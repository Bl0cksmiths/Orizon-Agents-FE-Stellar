/**
 * What the console says when the BotID guard refuses a request
 * (lib/bot-check-message.ts), and that the console's shared error paths say
 * it instead of the raw "POST … → 403 — …" line.
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  BOT_CHECK_UNAVAILABLE_MESSAGE,
  BOT_DETECTED_MESSAGE,
  botCheckMessage,
} from "./bot-check-message";

/** The rejection lib/api.ts builds from the guard's envelope. */
const refused = (code: string, status: number) =>
  new ApiError(
    `POST /orchestrator/decompose → ${status} — server sentence`,
    status,
    undefined,
    code,
    { error: { code, message: "server sentence" } },
  );

describe("botCheckMessage", () => {
  it("names a bot refusal in plain words", () => {
    expect(botCheckMessage(refused("bot_detected", 403))).toBe(
      BOT_DETECTED_MESSAGE,
    );
  });

  it("names a check that could not run", () => {
    expect(botCheckMessage(refused("bot_check_unavailable", 503))).toBe(
      BOT_CHECK_UNAVAILABLE_MESSAGE,
    );
  });

  it("reads the code by shape, not by class", () => {
    expect(botCheckMessage({ code: "bot_detected" })).toBe(
      BOT_DETECTED_MESSAGE,
    );
  });

  it.each([
    ["another code", refused("plan_expired", 410)],
    ["a plain error", new Error("network down")],
    ["a string", "bot_detected"],
    ["null", null],
    ["a non-string code", { code: 403 }],
  ])("leaves %s to the caller", (_, err) => {
    expect(botCheckMessage(err)).toBeUndefined();
  });

  it("never claims nothing was charged: a paid run may already hold escrow", () => {
    for (const message of [
      BOT_DETECTED_MESSAGE,
      BOT_CHECK_UNAVAILABLE_MESSAGE,
    ]) {
      expect(message).not.toMatch(/charged/i);
    }
  });
});
