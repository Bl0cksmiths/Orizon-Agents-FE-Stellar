// @vitest-environment jsdom
/**
 * The shared page-scroll lock: counted, so two modal surfaces open at once
 * (a dialog over the nav's sheet, say) only put the page back when the last
 * one lets go, and a release called twice cannot unlock someone else's hold.
 */

import { afterEach, describe, expect, it } from "vitest";
import { lockPageScroll } from "./scroll-lock";

const root = () => document.documentElement.style.overflow;
const body = () => document.body.style.overflow;

afterEach(() => {
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

describe("lockPageScroll", () => {
  it("locks both the root and the body, and puts back what was there", () => {
    document.body.style.overflow = "auto";
    const release = lockPageScroll();
    expect(root()).toBe("hidden");
    expect(body()).toBe("hidden");
    release();
    expect(root()).toBe("");
    expect(body()).toBe("auto");
  });

  it("holds the page until the last of two locks is released", () => {
    const first = lockPageScroll();
    const second = lockPageScroll();
    first();
    expect(root()).toBe("hidden");
    second();
    expect(root()).toBe("");
  });

  it("ignores a release called twice", () => {
    const first = lockPageScroll();
    const second = lockPageScroll();
    first();
    first();
    expect(root()).toBe("hidden");
    second();
    expect(root()).toBe("");
  });
});
