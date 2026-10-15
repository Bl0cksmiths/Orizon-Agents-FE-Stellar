/**
 * isComponent decides which tags the layout's isolation guard counts, so a
 * tag it misreads is a provider that could crash the page unnoticed.
 */
import { describe, expect, it } from "vitest";
import { isComponent } from "./isolation";

describe("isComponent", () => {
  it("counts a tag that starts with a capital", () => {
    expect(isComponent("Nav")).toBe(true);
    expect(isComponent("A")).toBe(true);
  });

  it("counts a dotted tag wherever the dot is", () => {
    expect(isComponent("motion.div")).toBe(true);
    expect(isComponent("x.Y")).toBe(true);
    expect(isComponent(".")).toBe(true);
  });

  it("does not count an HTML element", () => {
    expect(isComponent("main")).toBe(false);
    expect(isComponent("a")).toBe(false);
  });

  it("does not count a capital that is not the first character", () => {
    expect(isComponent("aB")).toBe(false);
    expect(isComponent("1A")).toBe(false);
    expect(isComponent("")).toBe(false);
  });
});
