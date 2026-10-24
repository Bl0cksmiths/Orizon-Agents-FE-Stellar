/**
 * Unit tests for the outage classifier (lib/store-outage.ts), driven through
 * `httpError` — the one place a failed read becomes an `ApiError` — so the
 * status, the envelope's code and the Retry-After header all arrive the way
 * a real 503 delivers them.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, httpError } from "./api";
import { BOT_CHECK_UNAVAILABLE_CODE } from "./bot-check-message";
import { isStoreUnavailableCode, storeOutage } from "./store-outage";

const PATH = "/tasks/tsk_2a55b0229bccf4e0/disputes";

/** A failed response as the backend sends it: envelope and headers. */
function failed(
  status: number,
  code: string | null,
  headers: Record<string, string> = {},
): Response {
  const body =
    code === null
      ? "upstream connect error"
      : JSON.stringify({
          detail: code,
          error: {
            code,
            message: code.replaceAll("_", " "),
            request_id: "req0000000000503",
          },
        });
  return new Response(body, { status, headers });
}

const outageOf = async (res: Response) =>
  storeOutage(await httpError("GET", PATH, res));

afterEach(() => {
  vi.useRealTimers();
});

describe("isStoreUnavailableCode", () => {
  it("names the bare code and every store's own", () => {
    expect(isStoreUnavailableCode("store_unavailable")).toBe(true);
    expect(isStoreUnavailableCode("task_store_unavailable")).toBe(true);
    expect(isStoreUnavailableCode("plan_store_unavailable")).toBe(true);
  });

  it("names nothing else", () => {
    expect(isStoreUnavailableCode(undefined)).toBe(false);
    expect(isStoreUnavailableCode("registry_unavailable")).toBe(false);
    expect(isStoreUnavailableCode("internal_error")).toBe(false);
    expect(isStoreUnavailableCode("store_unavailable_soon")).toBe(false);
  });
});

describe("storeOutage", () => {
  it("reads a 503 store_unavailable as the store, with its Retry-After and request id", async () => {
    expect(
      await outageOf(failed(503, "store_unavailable", { "Retry-After": "5" })),
    ).toEqual({
      kind: "store",
      retryAfterMs: 5_000,
      requestId: "req0000000000503",
    });
  });

  it("reads the task store's own code the same way", async () => {
    const outage = await outageOf(failed(503, "task_store_unavailable"));
    expect(outage?.kind).toBe("store");
    expect(outage?.retryAfterMs).toBeNull();
  });

  it("takes a Retry-After given as an HTTP date", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-25T12:00:00Z") });
    const outage = await outageOf(
      failed(503, "store_unavailable", {
        "Retry-After": "Sun, 25 Oct 2026 12:00:30 GMT",
      }),
    );
    expect(outage?.retryAfterMs).toBe(30_000);
  });

  it("ignores a Retry-After it cannot read", async () => {
    const outage = await outageOf(
      failed(503, "store_unavailable", { "Retry-After": "soon" }),
    );
    expect(outage).toMatchObject({ kind: "store", retryAfterMs: null });
  });

  it("reads 500, 502, 504 and an uncoded 503 as temporary, without blaming the store", async () => {
    for (const status of [500, 502, 503, 504]) {
      expect(await outageOf(failed(status, "internal_error"))).toMatchObject({
        kind: "server",
      });
    }
    // A proxy's own page: no envelope, so no request id either.
    expect(await outageOf(failed(502, null))).toEqual({
      kind: "server",
      retryAfterMs: null,
      requestId: null,
    });
  });

  it("does not blame the store for its code on a status other than 503", async () => {
    expect(await outageOf(failed(500, "store_unavailable"))).toMatchObject({
      kind: "server",
    });
  });

  it("is null for answers a moment will not change", async () => {
    for (const [status, code] of [
      [400, "validation_error"],
      [404, "unknown_task"],
      [429, "rate_limited"],
      [501, "not_implemented"],
    ] as const) {
      expect(await outageOf(failed(status, code))).toBeNull();
    }
  });

  it("is null for the browser check's own 503, which has its own sentence", async () => {
    expect(await outageOf(failed(503, BOT_CHECK_UNAVAILABLE_CODE))).toBeNull();
  });

  it("is null for anything that is not an ApiError", () => {
    expect(
      storeOutage(new Error("GET /x → 503 — store unavailable")),
    ).toBeNull();
    expect(storeOutage(new TypeError("Failed to fetch"))).toBeNull();
    expect(storeOutage("503")).toBeNull();
    expect(storeOutage(null)).toBeNull();
  });

  it("drops a negative or non-finite wait", () => {
    expect(
      storeOutage(new ApiError("x", 503, Number.NaN, "store_unavailable"))
        ?.retryAfterMs,
    ).toBeNull();
    expect(
      storeOutage(new ApiError("x", 503, -1, "store_unavailable"))
        ?.retryAfterMs,
    ).toBeNull();
  });
});
