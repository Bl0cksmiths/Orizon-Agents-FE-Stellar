/**
 * Unit tests for the live checks in checks.mjs, run against a stub client so
 * every answer a link or an endpoint can give is pinned without a server.
 * live.test.mjs runs the same checks end to end through a fake server.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TESTNET_ENDPOINTS, checkReachable } from "./checks.mjs";
import { NetworkError } from "./http.mjs";

/**
 * @typedef {{ status: number, url?: string, text?: string, chain?: { url: string, status: number }[] }} StubAnswer
 */

/**
 * A client whose `request` answers each URL from `pages` (a value, or a
 * function of the URL), and throws a NetworkError for any URL it lacks.
 * Records every URL asked.
 *
 * @param {Record<string, StubAnswer | Error>} pages
 */
function stubClient(pages) {
  /** @type {string[]} */
  const asked = [];
  return {
    asked,
    /** @param {string} url */
    async request(url) {
      asked.push(url);
      const page = pages[url];
      if (page === undefined) throw new NetworkError(`no answer for ${url}`);
      if (page instanceof Error) throw page;
      return {
        url: page.url ?? url,
        status: page.status,
        text: page.text ?? "",
        chain: page.chain ?? [{ url, status: page.status }],
        headers: new Headers(),
      };
    },
  };
}

const VIDEO = "https://youtu.be/demo123";
const OEMBED = `${TESTNET_ENDPOINTS.oembed}?url=${encodeURIComponent(VIDEO)}&format=json`;

describe("checkReachable: a YouTube link, through oEmbed", () => {
  it("passes a 200, quoting the title when there is one", async () => {
    const titled = stubClient({
      [OEMBED]: { status: 200, text: JSON.stringify({ title: "Demo" }) },
    });
    assert.deepEqual(await checkReachable(titled, VIDEO, TESTNET_ENDPOINTS), {
      check: {
        name: "youtube-oembed",
        result: "pass",
        detail: 'oEmbed 200: public or unlisted ("Demo")',
      },
      finalUrl: VIDEO,
      redirected: false,
    });
    assert.deepEqual(titled.asked, [OEMBED]);

    const untitled = stubClient({ [OEMBED]: { status: 200, text: "{}" } });
    const { check } = await checkReachable(untitled, VIDEO, TESTNET_ENDPOINTS);
    assert.equal(check.detail, "oEmbed 200: public or unlisted");
  });

  for (const [status, result, detail] of [
    [401, "fail", "oEmbed HTTP 401: private, or embedding disabled"],
    [403, "fail", "oEmbed HTTP 403: private, or embedding disabled"],
    [404, "fail", "oEmbed HTTP 404: no such video"],
    [500, "fail", "oEmbed HTTP 500: not viewable"],
    [429, "unverified", "oEmbed HTTP 429: rate limited"],
  ]) {
    it(`reports an oEmbed ${status} as ${result}`, async () => {
      const client = stubClient({ [OEMBED]: { status: Number(status) } });
      assert.deepEqual(await checkReachable(client, VIDEO, TESTNET_ENDPOINTS), {
        check: { name: "youtube-oembed", result, detail },
        finalUrl: null,
        redirected: false,
      });
    });
  }

  it("marks no answer unverified", async () => {
    const client = stubClient({});
    assert.deepEqual(await checkReachable(client, VIDEO, TESTNET_ENDPOINTS), {
      check: {
        name: "youtube-oembed",
        result: "unverified",
        detail: `no answer for ${OEMBED}`,
      },
      finalUrl: null,
      redirected: false,
    });
  });
});

describe("checkReachable: any other link", () => {
  const URL_ = "https://example.com/page";
  const FINAL = "https://example.com/final";
  const redirect = (/** @type {number} */ status, final = FINAL) => ({
    status,
    url: final,
    chain: [
      { url: URL_, status: 301 },
      { url: final, status },
    ],
  });

  it("marks no answer unverified", async () => {
    const client = stubClient({ [URL_]: new NetworkError("timed out") });
    assert.deepEqual(await checkReachable(client, URL_, TESTNET_ENDPOINTS), {
      check: { name: "http", result: "unverified", detail: "timed out" },
      finalUrl: null,
      redirected: false,
    });
  });

  it("passes a 2xx, naming a redirect's final URL", async () => {
    const direct = stubClient({ [URL_]: { status: 204 } });
    assert.deepEqual(await checkReachable(direct, URL_, TESTNET_ENDPOINTS), {
      check: { name: "http", result: "pass", detail: "HTTP 204" },
      finalUrl: URL_,
      redirected: false,
    });
    const moved = stubClient({ [URL_]: redirect(200) });
    assert.deepEqual(await checkReachable(moved, URL_, TESTNET_ENDPOINTS), {
      check: {
        name: "http",
        result: "pass",
        detail: `HTTP 200 after redirect to ${FINAL}`,
      },
      finalUrl: FINAL,
      redirected: true,
    });
  });

  it("fails a login wall before looking at the status", async () => {
    const client = stubClient({
      [URL_]: redirect(200, "https://accounts.google.com/signin"),
    });
    const { check, finalUrl, redirected } = await checkReachable(
      client,
      URL_,
      TESTNET_ENDPOINTS,
    );
    assert.deepEqual(check, {
      name: "http",
      result: "fail",
      detail: "login wall: redirected to a sign-in page (accounts.google.com)",
    });
    assert.equal(finalUrl, "https://accounts.google.com/signin");
    assert.equal(redirected, true);
  });

  it("marks a 429 unverified", async () => {
    const client = stubClient({ [URL_]: redirect(429) });
    const { check } = await checkReachable(client, URL_, TESTNET_ENDPOINTS);
    assert.deepEqual(check, {
      name: "http",
      result: "unverified",
      detail: `HTTP 429 after redirect to ${FINAL}: rate limited, not checked`,
    });
  });

  it("explains a GitHub 404, and fails any other status", async () => {
    const repo = "https://github.com/org/private";
    const github = stubClient({ [repo]: { status: 404 } });
    assert.deepEqual(
      (await checkReachable(github, repo, TESTNET_ENDPOINTS)).check,
      {
        name: "http",
        result: "fail",
        detail:
          "HTTP 404: GitHub answers 404 anonymously, so this is private or missing",
      },
    );
    const other = stubClient({ [URL_]: { status: 404 } });
    assert.deepEqual(
      (await checkReachable(other, URL_, TESTNET_ENDPOINTS)).check,
      { name: "http", result: "fail", detail: "HTTP 404" },
    );
    const broken = stubClient({ [URL_]: redirect(500) });
    assert.deepEqual(await checkReachable(broken, URL_, TESTNET_ENDPOINTS), {
      check: {
        name: "http",
        result: "fail",
        detail: `HTTP 500 after redirect to ${FINAL}`,
      },
      finalUrl: FINAL,
      redirected: true,
    });
  });
});
