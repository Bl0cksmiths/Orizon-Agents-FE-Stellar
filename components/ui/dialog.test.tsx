// @vitest-environment jsdom
/**
 * Unit tests for Dialog, the native-<dialog> modal primitive.
 *
 * The component's whole contract is that the `open` prop, and nothing else,
 * decides whether the dialog is shown: the browser's own ways of closing it
 * (Escape, a forced close) become requests, the caller can refuse them all at
 * once, and focus goes back where it came from. Each of those is driven here
 * through a small stateful harness so the request → answer loop is exercised
 * the way a page uses it.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { useRef, useState, type ReactNode } from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { Dialog } from "./dialog";

// ── jsdom has no modal dialogs ──────────────────────────────────────────────
//
// jsdom 29 ships HTMLDialogElement and reflects its `open` attribute, but
// implements none of show(), showModal() or close(). Rather than teach the
// component a fallback no browser needs, the missing methods are modelled
// here, for this file only, on the parts of the HTML spec the component
// relies on:
//
//   showModal()  throws InvalidStateError when already open (as browsers do),
//                sets `open`, then runs the dialog focusing steps: the first
//                [autofocus] descendant, else the first focusable one.
//   close()      a no-op when closed; otherwise clears `open` and fires
//                `close` as a queued task — asynchronously, as in browsers.
//
// Escape is modelled by `pressEscape` below, not here: it is the user agent's
// close-request algorithm, not a method. What cannot be modelled in jsdom —
// the top layer, inertness, the ::backdrop box — is not asserted.

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const dialogProto = HTMLDialogElement.prototype;
const polyfilled = typeof dialogProto.showModal !== "function";

if (polyfilled) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) {
      throw new DOMException(
        "The dialog is already open.",
        "InvalidStateError",
      );
    }
    this.setAttribute("open", "");
    const target =
      this.querySelector<HTMLElement>("[autofocus]") ??
      this.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  };
  dialogProto.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute("open");
    setTimeout(() => this.dispatchEvent(new Event("close")), 0);
  };
}

afterAll(() => {
  if (!polyfilled) return;
  Reflect.deleteProperty(dialogProto, "showModal");
  Reflect.deleteProperty(dialogProto, "close");
});

afterEach(cleanup);

/** Lets queued tasks (the polyfill's `close` event) run inside act(). */
async function flushTasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * The user agent's close-request steps for Escape: a keydown on the focused
 * element; unless that is cancelled, a cancelable `cancel` on the dialog;
 * unless that is cancelled too, close(). Returns which stage stopped it.
 */
function pressEscape(): "keydown" | "cancel" | "closed" {
  const dialog = dialogEl();
  const target = (document.activeElement as HTMLElement | null) ?? dialog;
  if (!fireEvent.keyDown(target, { key: "Escape" })) return "keydown";
  const cancel = new Event("cancel", { cancelable: true });
  act(() => {
    dialog.dispatchEvent(cancel);
  });
  if (cancel.defaultPrevented) return "cancel";
  act(() => dialog.close());
  return "closed";
}

/** The <dialog> element, open or not — a closed one has no role to query. */
function dialogEl(): HTMLDialogElement {
  const el = document.querySelector("dialog");
  if (!el) throw new Error("no <dialog> rendered");
  return el;
}

/**
 * A page that owns `open`, the way every real caller does: a button opens the
 * dialog and `onClose` requests are answered by closing it, unless the test
 * says the page should refuse.
 */
function Harness({
  dismissible,
  onClose = () => {},
  refuseClose = false,
  focusField = false,
  footer,
}: {
  dismissible?: boolean;
  onClose?: () => void;
  refuseClose?: boolean;
  focusField?: boolean;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          if (!refuseClose) setOpen(false);
        }}
        eyebrow="dispute"
        title="Raise a dispute"
        description="One step, one reason."
        dismissible={dismissible}
        initialFocusRef={focusField ? fieldRef : undefined}
        footer={footer}
      >
        <label>
          Reason
          <input ref={fieldRef} />
        </label>
        <p>Body copy</p>
      </Dialog>
    </>
  );
}

/** Focuses the opener first, as a real click or Enter would, then opens. */
function openDialog(): HTMLButtonElement {
  const opener = screen.getByRole<HTMLButtonElement>("button", {
    name: "Open dialog",
  });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe("Dialog — open and close", () => {
  it("renders an empty, closed element until it is opened", () => {
    render(<Harness />);

    expect(dialogEl().open).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    // Content mounts only while open, so nothing stale sits in the DOM.
    expect(screen.queryByText("Body copy")).toBeNull();
  });

  it("opens modally, named by its title and described by its description", () => {
    render(<Harness />);
    openDialog();

    expect(dialogEl().open).toBe(true);
    const dialog = screen.getByRole("dialog", {
      name: "Raise a dispute",
      description: "One step, one reason.",
    });
    expect(dialog).toBe(dialogEl());
    expect(screen.getByText("Body copy")).toBeTruthy();
  });

  it("renders the footer outside the scrolling body", () => {
    render(<Harness footer={<button type="button">Confirm</button>} />);
    openDialog();

    const confirm = screen.getByRole("button", { name: "Confirm" });
    const body = screen.getByText("Body copy").parentElement;
    expect(body?.contains(confirm)).toBe(false);
  });

  it("closes when the prop turns false, and unmounts its content", () => {
    function Controlled({ open }: { open: boolean }) {
      return (
        <Dialog open={open} onClose={() => {}} title="Receipt">
          <p>Body copy</p>
        </Dialog>
      );
    }
    const { rerender } = render(<Controlled open />);
    expect(dialogEl().open).toBe(true);

    rerender(<Controlled open={false} />);

    expect(dialogEl().open).toBe(false);
    expect(screen.queryByText("Body copy")).toBeNull();
  });

  it("does not describe itself when there is no description", () => {
    render(
      <Dialog open onClose={() => {}} title="Receipt">
        <p>Body copy</p>
      </Dialog>,
    );

    expect(dialogEl().hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("Dialog — Escape", () => {
  it("turns Escape into a close request the page answers", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();

    // The native close is always cancelled: the prop, not the browser, closes.
    expect(pressEscape()).toBe("cancel");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().open).toBe(false);
    expect(screen.queryByText("Body copy")).toBeNull();
  });

  it("stays open when the page does not answer the request", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} refuseClose />);
    openDialog();

    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().open).toBe(true);
    expect(screen.getByText("Body copy")).toBeTruthy();
  });

  it("reports a close the browser forced, so the prop follows it", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();

    // Chrome closes outright on a second Escape once a cancel was refused.
    act(() => dialogEl().close());
    await flushTasks();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Body copy")).toBeNull();
  });

  it("does not report its own close as a dismissal", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await flushTasks();

    // Once for the button; the `close` event that followed was ours.
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Dialog — focus", () => {
  it("moves focus to the title on open, ahead of any control", () => {
    render(<Harness />);
    openDialog();

    const title = screen.getByRole("heading", { name: "Raise a dispute" });
    expect(document.activeElement).toBe(title);
    // A landing point for script, never a Tab stop.
    expect(title.getAttribute("tabindex")).toBe("-1");
  });

  it("moves focus to the caller's element when one is given", () => {
    render(<Harness focusField />);
    openDialog();

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Reason" }),
    );
  });

  it("returns focus to the opener when Escape closes it", () => {
    render(<Harness />);
    const opener = openDialog();

    pressEscape();

    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the opener when the close button closes it", () => {
    render(<Harness />);
    const opener = openDialog();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the opener when it unmounts while open", () => {
    function Page({ show }: { show: boolean }) {
      return show ? (
        <Dialog open onClose={() => {}} title="Receipt">
          <p>Body copy</p>
        </Dialog>
      ) : null;
    }
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();

    const { rerender } = render(<Page show />);
    expect(document.activeElement).not.toBe(outside);

    rerender(<Page show={false} />);

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("leaves focus alone when the opener is gone", () => {
    function Page({ open }: { open: boolean }) {
      return (
        <Dialog open={open} onClose={() => {}} title="Receipt">
          <p>Body copy</p>
        </Dialog>
      );
    }
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { rerender } = render(<Page open />);

    // The page swapped the opener for a result while the dialog was up.
    opener.remove();

    expect(() => rerender(<Page open={false} />)).not.toThrow();
    expect(document.activeElement).not.toBe(opener);
  });
});

describe("Dialog — close button and backdrop", () => {
  it("has a visible, named close button that requests a close", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();

    const close = screen.getByRole<HTMLButtonElement>("button", {
      name: "Close",
    });
    expect(close.disabled).toBe(false);
    fireEvent.click(close);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().open).toBe(false);
  });

  it("closes on a click on the backdrop", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();

    // A ::backdrop click is dispatched to the <dialog> element itself.
    fireEvent.pointerDown(dialogEl());
    fireEvent.click(dialogEl());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().open).toBe(false);
  });

  it("ignores a click inside the panel", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();

    const copy = screen.getByText("Body copy");
    fireEvent.pointerDown(copy);
    fireEvent.click(copy);

    expect(onClose).not.toHaveBeenCalled();
    expect(dialogEl().open).toBe(true);
  });

  it("ignores a drag that starts in the panel and ends on the backdrop", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    openDialog();

    // Selecting text and releasing past the panel's edge: the click lands on
    // the common ancestor, the dialog, though the press was inside.
    fireEvent.pointerDown(screen.getByRole("textbox", { name: "Reason" }));
    fireEvent.click(dialogEl());

    expect(onClose).not.toHaveBeenCalled();
    expect(dialogEl().open).toBe(true);
  });
});

describe("Dialog — the dismissal veto", () => {
  it("stops Escape at the keydown, before it becomes a close request", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} dismissible={false} />);
    openDialog();

    expect(pressEscape()).toBe("keydown");

    expect(onClose).not.toHaveBeenCalled();
    expect(dialogEl().open).toBe(true);
  });

  it("refuses a close request that arrives without a keydown", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} dismissible={false} />);
    openDialog();

    // The Android back gesture fires `cancel` with no Escape keydown.
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      dialogEl().dispatchEvent(cancel);
    });

    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialogEl().open).toBe(true);
  });

  it("disables the close button", () => {
    render(<Harness dismissible={false} />);
    openDialog();

    const close = screen.getByRole<HTMLButtonElement>("button", {
      name: "Close",
    });
    expect(close.disabled).toBe(true);
  });

  it("ignores a click on the backdrop", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} dismissible={false} />);
    openDialog();

    fireEvent.pointerDown(dialogEl());
    fireEvent.click(dialogEl());

    expect(onClose).not.toHaveBeenCalled();
    expect(dialogEl().open).toBe(true);
  });

  it("undoes a close the browser forces anyway", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} dismissible={false} />);
    openDialog();

    act(() => dialogEl().close());
    await flushTasks();

    expect(onClose).not.toHaveBeenCalled();
    expect(dialogEl().open).toBe(true);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Raise a dispute" }),
    );
  });

  it("dismisses normally again once the veto is lifted", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Harness onClose={onClose} dismissible={false} />,
    );
    openDialog();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();

    rerender(<Harness onClose={onClose} dismissible />);
    pressEscape();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogEl().open).toBe(false);
  });
});

describe("Dialog — page scroll", () => {
  afterEach(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });

  it("locks the root scroller and the body while open", () => {
    render(<Harness />);
    openDialog();

    // The global stylesheet makes the root, not the body, the scroller.
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("puts back whatever inline overflow the page had on close", () => {
    document.body.style.overflow = "clip";
    render(<Harness />);
    openDialog();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(document.body.style.overflow).toBe("clip");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("keeps the page locked until the last of two dialogs closes", () => {
    function Stack({ first, second }: { first: boolean; second: boolean }) {
      return (
        <>
          <Dialog open={first} onClose={() => {}} title="First">
            <p>one</p>
          </Dialog>
          <Dialog open={second} onClose={() => {}} title="Second">
            <p>two</p>
          </Dialog>
        </>
      );
    }
    const { rerender } = render(<Stack first second />);

    rerender(<Stack first={false} second />);
    expect(document.documentElement.style.overflow).toBe("hidden");

    rerender(<Stack first={false} second={false} />);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("releases the lock when it unmounts while open", () => {
    const { unmount } = render(
      <Dialog open onClose={() => {}} title="Receipt">
        <p>Body copy</p>
      </Dialog>,
    );
    expect(document.documentElement.style.overflow).toBe("hidden");

    unmount();

    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});
