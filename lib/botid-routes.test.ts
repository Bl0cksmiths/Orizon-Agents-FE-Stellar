/**
 * The guarded-route list both halves of BotID read (lib/botid-routes.ts):
 * what it matches, under BotID's own pattern rule, and what it leaves alone.
 */
import { describe, expect, it } from "vitest";
import {
  BOTID_PROTECTED_ROUTES,
  botIdActive,
  isBotIdProtected,
} from "./botid-routes";

describe("isBotIdProtected", () => {
  it.each([
    "/api/orchestrator/decompose",
    "/api/orchestrator/execute",
    "/api/stellar/build/authorize",
    "/api/stellar/build/reclaim",
    "/api/stellar/build/register-agent",
    "/api/stellar/build/update-price",
    "/api/stellar/build/set-active",
    "/api/stellar/submit",
    "/api/disputes/challenge",
    "/api/disputes",
    "/api/agents/agt_1/bind/challenge",
    "/api/agents/agt%201/bind",
  ])("guards POST %s", (path) => {
    expect(isBotIdProtected(path, "POST")).toBe(true);
    expect(isBotIdProtected(path, "post")).toBe(true);
  });

  it.each([
    ["GET", "/api/orchestrator/decompose"],
    ["GET", "/api/agents"],
    ["GET", "/api/trace/t1/stream"],
    ["GET", "/api/agents/agt_1/binding"],
    ["DELETE", "/api/agents/agt_1/bind"],
    ["POST", "/api/stellar/server/charge"],
    ["POST", "/api/stellar/server/seal"],
    ["POST", "/api/disputes/read-challenge"],
    ["POST", "/api/disputes/d1/uphold"],
    ["POST", "/api/stellar/agents/sync"],
    ["POST", "/api/pdax/ramp/onramp"],
    ["POST", "/api/disputes/challenge/extra"],
    ["POST", "/api/orchestrator/decompose2"],
  ])("leaves %s %s alone", (method, path) => {
    expect(isBotIdProtected(path, method)).toBe(false);
  });

  it("guards POSTs only", () => {
    expect(BOTID_PROTECTED_ROUTES.every((r) => r.method === "POST")).toBe(true);
  });
});

describe("botIdActive", () => {
  it("is on for a Vercel deployment only", () => {
    expect(botIdActive({ VERCEL: "1" })).toBe(true);
    expect(botIdActive({})).toBe(false);
    expect(botIdActive({ VERCEL: "" })).toBe(false);
    expect(botIdActive({ VERCEL: "0" })).toBe(false);
  });
});
