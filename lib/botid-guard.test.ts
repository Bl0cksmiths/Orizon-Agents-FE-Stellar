/**
 * BotID's server half (lib/botid-guard.ts): which requests it refuses, how,
 * and where it does not run at all. BotID's own `checkBotId` is mocked; its
 * verdict is Vercel's to give, not this suite's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkBotId = vi.hoisted(() => vi.fn<() => Promise<{ isBot: boolean }>>());
vi.mock("botid/server", () => ({ checkBotId }));

import { refuseBots } from "./botid-guard";
import {
  BOT_CHECK_UNAVAILABLE_MESSAGE,
  BOT_DETECTED_MESSAGE,
} from "./bot-check-message";

const visit = () =>
  new Request("https://orizons.test/api/orchestrator/decompose", {
    method: "POST",
    headers: { "x-vercel-id": "iad1::req" },
  });

beforeEach(() => {
  checkBotId.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("on Vercel", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
  });

  it("refuses a bot with 403 bot_detected in the backend's envelope", async () => {
    checkBotId.mockResolvedValue({ isBot: true });
    const res = await refuseBots(visit());
    expect(res?.status).toBe(403);
    expect(res?.headers.get("content-type")).toBe("application/json");
    expect(res?.headers.get("cache-control")).toBe("no-store");
    expect(await res?.json()).toEqual({
      detail: BOT_DETECTED_MESSAGE,
      error: {
        code: "bot_detected",
        message: BOT_DETECTED_MESSAGE,
        request_id: "iad1::req",
      },
    });
  });

  it("lets a person through", async () => {
    checkBotId.mockResolvedValue({ isBot: false });
    expect(await refuseBots(visit())).toBeNull();
    expect(checkBotId).toHaveBeenCalledTimes(1);
  });

  it("asks with the project's check level, not one of its own", async () => {
    checkBotId.mockResolvedValue({ isBot: false });
    await refuseBots(visit());
    // No argument: no per-route checkLevel for the browser's half to match.
    expect(checkBotId).toHaveBeenCalledWith();
  });

  it("forwards unchecked, and logs, when the check cannot run", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkBotId.mockRejectedValue(new Error("VERCEL_OIDC_TOKEN is not set"));
    expect(await refuseBots(visit())).toBeNull();
    expect(log).toHaveBeenCalledWith(
      "[botid] check failed, forwarding unchecked: VERCEL_OIDC_TOKEN is not set",
    );
  });

  it("fails closed, 503 bot_check_unavailable, when BOTID_ON_CHECK_ERROR=closed", async () => {
    vi.stubEnv("BOTID_ON_CHECK_ERROR", "closed");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    checkBotId.mockRejectedValue(new Error("VERCEL_OIDC_TOKEN is not set"));
    const res = await refuseBots(visit());
    expect(res?.status).toBe(503);
    expect(res?.headers.get("retry-after")).toBe("5");
    expect(await res?.json()).toMatchObject({
      error: {
        code: "bot_check_unavailable",
        message: BOT_CHECK_UNAVAILABLE_MESSAGE,
      },
    });
    expect(log).toHaveBeenCalledWith(
      "[botid] check failed: VERCEL_OIDC_TOKEN is not set",
    );
  });
});

describe("off Vercel", () => {
  it("does not run: next dev, the e2e servers and next start forward unchecked", async () => {
    vi.stubEnv("VERCEL", "");
    expect(await refuseBots(visit())).toBeNull();
    expect(checkBotId).not.toHaveBeenCalled();
  });
});

describe("injected", () => {
  it("uses the given switch and check over the platform's", async () => {
    vi.stubEnv("VERCEL", "");
    const check = vi.fn(async () => ({ isBot: true }));
    const res = await refuseBots(visit(), { active: true, check });
    expect(res?.status).toBe(403);
    expect(checkBotId).not.toHaveBeenCalled();
  });
});
