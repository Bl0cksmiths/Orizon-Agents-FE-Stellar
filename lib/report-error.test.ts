import { afterEach, describe, expect, it, vi } from "vitest";

const trackMock = vi.fn();
vi.mock("@vercel/analytics", () => ({
  track: (...a: unknown[]) => trackMock(...a),
}));

import { reportClientError, scrubForTelemetry } from "./report-error";

const ACCOUNT = "GA7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV";
const SEED = "SB7AI5TAJEZA27I666DSJC4MUJYBEWUYNNZWPU7R2ONA7IZQVO6R5OQV";

/** The props of the one event sent. */
const sent = () => {
  expect(trackMock).toHaveBeenCalledTimes(1);
  return trackMock.mock.calls[0][1] as Record<string, unknown>;
};

describe("reportClientError", () => {
  afterEach(() => {
    trackMock.mockReset();
    vi.restoreAllMocks();
  });

  it("emits the client-error event with the digest, message, kind, route and recovery", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(Object.assign(new Error("boom"), { digest: "d1" }), {
      kind: "render",
      route: "/app/agents",
      recovery: "shown",
    });
    expect(trackMock).toHaveBeenCalledWith("client-error", {
      digest: "d1",
      message: "boom",
      kind: "render",
      route: "/app/agents",
      recovery: "shown",
    });
  });

  it("falls back to 'none' when there is no digest", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(new Error("no digest"), {
      kind: "render",
      route: "/",
      recovery: "shown",
    });
    expect(sent().digest).toBe("none");
  });

  it("records an automatic reload as the recovery", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(
      Object.assign(new Error("x"), { name: "ChunkLoadError" }),
      { kind: "chunk", route: "/app", recovery: "auto-reload" },
    );
    expect(sent()).toMatchObject({ kind: "chunk", recovery: "auto-reload" });
  });

  it("names the part a local boundary drew its fallback for", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(new Error("boom"), {
      kind: "render",
      route: "/",
      recovery: "isolated",
      part: "nav",
    });
    expect(sent()).toMatchObject({ recovery: "isolated", part: "nav" });
  });

  it("sends no part for a page-wide boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(new Error("boom"), {
      kind: "render",
      route: "/",
      recovery: "shown",
    });
    expect(sent()).not.toHaveProperty("part");
  });

  it("sends the route without its query or fragment", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(new Error("boom"), {
      kind: "render",
      route: "/app/trace?task=t_1&token=secret#step-2",
      recovery: "shown",
    });
    expect(sent().route).toBe("/app/trace");
  });

  it("scrubs the message before it leaves the browser", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(new Error(`no balance for ${ACCOUNT}`), {
      kind: "render",
      route: "/app/wallet",
      recovery: "shown",
    });
    expect(sent().message).toBe("no balance for [key]");
  });

  it("truncates the message to 120 characters", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reportClientError(new Error("x ".repeat(500)), {
      kind: "render",
      route: "/",
      recovery: "shown",
    });
    expect(sent().message as string).toHaveLength(120);
  });

  it("never throws when telemetry throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    trackMock.mockImplementation(() => {
      throw new Error("analytics down");
    });
    expect(() =>
      reportClientError(new Error("boom"), {
        kind: "render",
        route: "/",
        recovery: "shown",
      }),
    ).not.toThrow();
  });

  it("logs the error to the console for local debugging", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    reportClientError(err, { kind: "render", route: "/", recovery: "shown" });
    expect(spy).toHaveBeenCalledWith(err);
  });
});

describe("scrubForTelemetry", () => {
  it.each([
    [
      "a URL's query and fragment",
      "Loading chunk 1 failed. (https://orizons.xyz/app/trace?task=t_9&token=abc#x)",
      "Loading chunk 1 failed. (https://orizons.xyz/app/trace)",
    ],
    [
      "a relative URL's query",
      "fetch /api/tasks/t_9/disputes?read_token=abc failed",
      "fetch /api/tasks/t_9/disputes failed",
    ],
    ["a Stellar account", `owner ${ACCOUNT} unbound`, "owner [key] unbound"],
    ["a Stellar secret seed", `bad seed ${SEED}`, "bad seed [key]"],
    ["an email address", "no user ana@example.com", "no user [email]"],
    [
      "a transaction hash",
      `tx ${"ab".repeat(32)} not found`,
      "tx [hex] not found",
    ],
  ])("redacts %s", (_, raw, clean) => {
    expect(scrubForTelemetry(raw)).toBe(clean);
  });

  it("keeps React's error number, which is not personal", () => {
    expect(
      scrubForTelemetry(
        "Minified React error #418; visit https://reactjs.org/docs/error-decoder.html?invariant=418 for the full message",
      ),
    ).toBe(
      "Minified React error #418; visit https://reactjs.org/docs/error-decoder.html for the full message",
    );
  });
});
