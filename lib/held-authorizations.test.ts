// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_HELD_AUTHORIZATIONS,
  getHeldAuthorization,
  rememberHeldAuthorization,
  type HeldAuthorization,
} from "./held-authorizations";

const held = (i = 0): HeldAuthorization => ({
  authIdHex: i.toString(16).padStart(32, "0"),
  payer: "GBPAYER".padEnd(56, "A"),
  expiresAt: 1_790_000_000 + i,
});

afterEach(() => sessionStorage.clear());

describe("held authorizations", () => {
  it("remembers the authorization a task was started with, for this session", () => {
    rememberHeldAuthorization("task_1", held(1));
    expect(getHeldAuthorization("task_1")).toEqual(held(1));
    expect(getHeldAuthorization("task_2")).toBeNull();
  });

  it("keeps an unknown expiry as null", () => {
    rememberHeldAuthorization("task_1", { ...held(1), expiresAt: null });
    expect(getHeldAuthorization("task_1")?.expiresAt).toBeNull();
  });

  it("refuses an authorization id that is not 32 hex characters", () => {
    rememberHeldAuthorization("task_1", { ...held(1), authIdHex: "nope" });
    expect(getHeldAuthorization("task_1")).toBeNull();
  });

  it("reads corrupt storage as none", () => {
    sessionStorage.setItem("orizon.held-authorizations", "{not json");
    expect(getHeldAuthorization("task_1")).toBeNull();
    sessionStorage.setItem(
      "orizon.held-authorizations",
      JSON.stringify([["task_1", { authIdHex: 5 }]]),
    );
    expect(getHeldAuthorization("task_1")).toBeNull();
  });

  it("forgets the oldest past its cap", () => {
    for (let i = 0; i <= MAX_HELD_AUTHORIZATIONS; i++) {
      rememberHeldAuthorization(`task_${i}`, held(i));
    }
    expect(getHeldAuthorization("task_0")).toBeNull();
    expect(getHeldAuthorization(`task_${MAX_HELD_AUTHORIZATIONS}`)).toEqual(
      held(MAX_HELD_AUTHORIZATIONS),
    );
  });
});
