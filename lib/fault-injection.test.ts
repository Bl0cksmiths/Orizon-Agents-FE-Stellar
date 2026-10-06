import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FAULTS_GLOBAL,
  faultPoint,
  injectedFaultMessage,
} from "./fault-injection";

/** A browser window whose page asked for `faults` to break. */
const pageAsking = (faults: unknown) =>
  vi.stubGlobal("window", { [FAULTS_GLOBAL]: faults });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("faultPoint", () => {
  it("never throws in a build without fault injection, even when asked", () => {
    vi.stubEnv("NEXT_PUBLIC_FAULT_INJECTION", "");
    pageAsking(["nav"]);
    expect(() => faultPoint("nav")).not.toThrow();
  });

  it("never throws on the server, so the HTML a crawler fetches is whole", () => {
    vi.stubEnv("NEXT_PUBLIC_FAULT_INJECTION", "1");
    vi.stubGlobal("window", undefined);
    expect(() => faultPoint("nav")).not.toThrow();
  });

  it("throws only for the points the page asked for", () => {
    vi.stubEnv("NEXT_PUBLIC_FAULT_INJECTION", "1");
    pageAsking(["wallet"]);
    expect(() => faultPoint("wallet")).toThrow(injectedFaultMessage("wallet"));
    expect(() => faultPoint("nav")).not.toThrow();
  });

  it("ignores a page that asked for nothing, or asked in the wrong shape", () => {
    vi.stubEnv("NEXT_PUBLIC_FAULT_INJECTION", "1");
    pageAsking(undefined);
    expect(() => faultPoint("wallet")).not.toThrow();
    pageAsking("wallet");
    expect(() => faultPoint("wallet")).not.toThrow();
  });
});
