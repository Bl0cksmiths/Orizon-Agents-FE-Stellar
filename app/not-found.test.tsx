// @vitest-environment jsdom
/**
 * The 404 page speaks the same plain language as the error screens.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotFound from "./not-found";

afterEach(cleanup);

describe("the not-found page", () => {
  it("says the page wasn't found, in plain words", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/signal lost|re-align/i);
  });

  it("offers the way home and into the console", () => {
    render(<NotFound />);
    expect(
      screen
        .getByRole("link", { name: "Go to the home page" })
        .getAttribute("href"),
    ).toBe("/");
    expect(
      screen
        .getByRole("link", { name: "Open the console" })
        .getAttribute("href"),
    ).toBe("/app");
  });

  it("keeps the skip link's target", () => {
    render(<NotFound />);
    expect(document.querySelector("main#main")).not.toBeNull();
  });
});
