// @vitest-environment jsdom
/**
 * Unit tests for the guide's copy button.
 *
 * It copies the code element's text, announces "Copied" in a polite live
 * region that is mounted before anything is said, falls back to selecting
 * the code when the clipboard refuses, and is disabled in the server HTML so
 * that with JavaScript off it does not pretend to work.
 */

import { renderToString } from "react-dom/server";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

function setup() {
  render(
    <>
      <pre>
        <code id="run-code">echo hello</code>
      </pre>
      <CopyButton targetId="run-code" title="Run it" />
    </>,
  );
  return {
    button: screen.getByRole("button", { name: "Copy Run it" }),
    status: screen.getByRole("status"),
  };
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
  return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.getSelection()?.removeAllRanges();
});

describe("CopyButton", () => {
  it("is disabled in the server HTML, so it is inert without JavaScript", () => {
    const html = renderToString(<CopyButton targetId="x" title="Run it" />);
    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
    expect(html).toContain('aria-label="Copy Run it"');
    expect(html).toMatch(/role="status" aria-live="polite"/);
  });

  it("is enabled once hydrated, with a silent live region", () => {
    const { button, status } = setup();
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.textContent).toBe("Copy");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");
  });

  it("copies the code's text and announces Copied, then goes quiet", async () => {
    vi.useFakeTimers();
    const writeText = stubClipboard(async () => {});
    const { button, status } = setup();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledWith("echo hello");
    expect(status.textContent).toBe("Copied");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(status.textContent).toBe("");
  });

  it("selects the code for a manual copy when the clipboard refuses", async () => {
    stubClipboard(async () => {
      throw new Error("denied");
    });
    const { button, status } = setup();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(window.getSelection()?.toString()).toBe("echo hello");
    expect(status.textContent).toBe("Selected — press Ctrl+C or ⌘C to copy");
  });
});
