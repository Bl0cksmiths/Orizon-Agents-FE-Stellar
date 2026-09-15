// @vitest-environment jsdom
/**
 * Tests for the wallet-picker accessibility shim.
 *
 * The shim patches a third-party modal it does not own, so the contract is as
 * much about what it must NOT do — never throw, never fire when the picker is
 * closed, never outlive the modal — as about the affordances it adds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installWalletPickerA11y } from "./wallet-picker-a11y";

/** The `d` prefix the kit's X icon uses. */
const CLOSE_D = "M11.9997 10.5865 L1 1";

/** Build the kit's modal DOM: root > (backdrop, card > div > header > buttons). */
function mountPicker({ withHeader = true } = {}): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <section class="stellar-wallets-kit #hashed">
      <div></div>
      <section>
        ${
          withHeader
            ? `<div><header>
                 <div><button type="button"><svg><path d="M12 22C6.47715"/></svg></button></div>
                 <div><h1>Connect Wallet</h1></div>
                 <div><button type="button"><svg><path d="${CLOSE_D}"/></svg></button></div>
               </header></div>`
            : ""
        }
        <ul><li>Freighter</li><li>xBull</li></ul>
      </section>
    </section>`;
  document.body.appendChild(wrapper);
  return wrapper;
}

function pressEscape() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
}

function closeButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `section.stellar-wallets-kit header div:last-child button`,
  );
}

beforeEach(() => {
  // Deterministic focus restore — the shim defers it a frame.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("installWalletPickerA11y", () => {
  it("routes Escape to the kit's own close path", () => {
    mountPicker();
    const requestClose = vi.fn();
    const dispose = installWalletPickerA11y(requestClose);

    pressEscape();

    expect(requestClose).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("stops listening once disposed", () => {
    mountPicker();
    const requestClose = vi.fn();
    installWalletPickerA11y(requestClose)();

    pressEscape();

    expect(requestClose).not.toHaveBeenCalled();
  });

  it("ignores Escape while no picker is open", () => {
    // No picker in the DOM: the app's own Escape handlers must still see it.
    const appHandler = vi.fn();
    document.addEventListener("keydown", appHandler);
    const requestClose = vi.fn();
    const dispose = installWalletPickerA11y(requestClose);

    pressEscape();

    expect(requestClose).not.toHaveBeenCalled();
    expect(appHandler).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", appHandler);
    dispose();
  });

  it("gives the close control an accessible name", () => {
    mountPicker();
    const dispose = installWalletPickerA11y(vi.fn());

    expect(closeButton()?.getAttribute("aria-label")).toBe(
      "Close wallet picker",
    );
    dispose();
  });

  it("labels the dialog from its heading", () => {
    mountPicker();
    const dispose = installWalletPickerA11y(vi.fn());

    const card = document.querySelector<HTMLElement>(
      "section.stellar-wallets-kit > section",
    );
    expect(card?.getAttribute("role")).toBe("dialog");
    expect(card?.getAttribute("aria-modal")).toBe("true");
    expect(card?.getAttribute("aria-labelledby")).toBe("swk-a11y-title");
    dispose();
  });

  it("makes the wallet rows keyboard-operable", () => {
    mountPicker();
    const dispose = installWalletPickerA11y(vi.fn());

    const rows = Array.from(document.querySelectorAll("li"));
    expect(rows.map((li) => li.getAttribute("role"))).toEqual([
      "button",
      "button",
    ]);
    expect(rows.every((li) => (li as HTMLElement).tabIndex === 0)).toBe(true);

    // Enter on a row drives the kit's own click handler.
    const clicked = vi.fn();
    rows[0].addEventListener("click", clicked);
    rows[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(clicked).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("decorates a picker that appears after install", async () => {
    const dispose = installWalletPickerA11y(vi.fn());
    mountPicker();

    // MutationObserver callbacks are queued as microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(closeButton()?.getAttribute("aria-label")).toBe(
      "Close wallet picker",
    );
    dispose();
  });

  it("degrades quietly when the kit's DOM is not what it expects", () => {
    mountPicker({ withHeader: false });
    const requestClose = vi.fn();

    // No header to label, but the shim must still install and still close.
    const dispose = installWalletPickerA11y(requestClose);
    pressEscape();

    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(() => dispose()).not.toThrow();
  });

  it("is safe to dispose twice", () => {
    mountPicker();
    const dispose = installWalletPickerA11y(vi.fn());

    dispose();
    expect(() => dispose()).not.toThrow();
  });

  it("returns focus to the opener", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    mountPicker();

    installWalletPickerA11y(vi.fn())();

    expect(document.activeElement).toBe(opener);
  });

  it("does not focus an opener that is still disabled", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    mountPicker();
    const dispose = installWalletPickerA11y(vi.fn());

    opener.disabled = true;
    dispose();

    expect(document.activeElement).not.toBe(opener);
  });
});
