// @vitest-environment jsdom
/**
 * The marketing nav: its two disclosure menus, the promoted Guide link, and
 * the mobile sheet.
 *
 * Rendered whole, so the menus' shared state (one open at a time) and the
 * route-change reset are exercised the way the page uses them. jsdom applies
 * no Tailwind, so "shown" is read from the state the markup carries —
 * `aria-expanded`, the panel's `data-state`, the dialog's `open` — and the
 * real visibility is asserted in e2e/nav.spec.ts.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const connect = vi.fn();
vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({
    available: true,
    connected: false,
    address: null,
    connect,
    disconnect: vi.fn(),
    loading: false,
    error: null,
  }),
}));

import { Nav } from "./nav";

// ── jsdom has no modal dialogs ──────────────────────────────────────────────
// The same model as components/ui/dialog.test.tsx: showModal() sets `open`,
// close() clears it. Inertness and the top layer cannot be modelled here.
const dialogProto = HTMLDialogElement.prototype;
const polyfilled = typeof dialogProto.showModal !== "function";
if (polyfilled) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  dialogProto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
afterAll(() => {
  if (!polyfilled) return;
  Reflect.deleteProperty(dialogProto, "showModal");
  Reflect.deleteProperty(dialogProto, "close");
});

beforeEach(() => {
  pathname = "/";
  connect.mockReset();
});
afterEach(() => {
  cleanup();
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
});

const bar = () => screen.getByRole("navigation", { name: "Main" });
const trigger = (name: string) =>
  within(bar()).getByRole("button", { name: new RegExp(`^${name}`) });
const panelOf = (button: HTMLElement) => {
  const panel = document.getElementById(
    button.getAttribute("aria-controls") ?? "",
  );
  if (!panel) throw new Error("no panel for that button");
  return panel;
};
const isOpen = (button: HTMLElement) =>
  button.getAttribute("aria-expanded") === "true" &&
  panelOf(button).dataset.state === "open";
const panelLinks = (button: HTMLElement) =>
  within(panelOf(button)).getAllByRole("link");
const sheet = () => document.querySelector("dialog") as HTMLDialogElement;
const toggle = () => screen.getByRole("button", { name: "Open menu" });

describe("desktop menus", () => {
  it("are disclosure buttons wired to their panels, closed at first", () => {
    render(<Nav />);
    for (const name of ["Platform", "Resources"]) {
      const button = trigger(name);
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(panelOf(button).dataset.state).toBe("closed");
    }
    // Three top-level items: two menus and the Guide link.
    expect(bar().querySelectorAll(":scope > ul > li")).toHaveLength(3);
  });

  it("opens and closes on click", () => {
    render(<Nav />);
    const button = trigger("Platform");
    fireEvent.click(button);
    expect(isOpen(button)).toBe(true);
    fireEvent.click(button);
    expect(isOpen(button)).toBe(false);
  });

  it("keeps only one menu open at a time", () => {
    render(<Nav />);
    fireEvent.click(trigger("Platform"));
    fireEvent.pointerDown(trigger("Resources"));
    fireEvent.click(trigger("Resources"));
    expect(isOpen(trigger("Platform"))).toBe(false);
    expect(isOpen(trigger("Resources"))).toBe(true);
  });

  it("closes on Escape and returns focus to its button", () => {
    render(<Nav />);
    const button = trigger("Platform");
    fireEvent.click(button);
    const first = panelLinks(button)[0];
    first.focus();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(isOpen(button)).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it("closes on a press outside it, but not on one inside", () => {
    render(<Nav />);
    const button = trigger("Resources");
    fireEvent.click(button);
    fireEvent.pointerDown(panelLinks(button)[0]);
    expect(isOpen(button)).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(isOpen(button)).toBe(false);
  });

  it("closes when Tab takes focus out of it", () => {
    render(<Nav />);
    const button = trigger("Resources");
    fireEvent.click(button);
    const guide = within(bar()).getByRole("link", { name: "Guide" });
    fireEvent.blur(panelLinks(button).at(-1)!, { relatedTarget: guide });
    expect(isOpen(button)).toBe(false);
  });

  it("closes when one of its links is followed", () => {
    render(<Nav />);
    const button = trigger("Platform");
    fireEvent.click(button);
    fireEvent.click(panelLinks(button)[2]);
    expect(isOpen(button)).toBe(false);
  });

  it("opens from the keyboard and moves through its links with the arrows", () => {
    render(<Nav />);
    const button = trigger("Platform");
    const links = panelLinks(button);
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(isOpen(button)).toBe(true);
    expect(document.activeElement).toBe(links[0]);

    fireEvent.keyDown(links[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[1]);
    fireEvent.keyDown(links[1], { key: "End" });
    expect(document.activeElement).toBe(links.at(-1));
    // Wraps at both ends.
    fireEvent.keyDown(links.at(-1)!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(links[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(links.at(-1));
    fireEvent.keyDown(links.at(-1)!, { key: "Home" });
    expect(document.activeElement).toBe(links[0]);
  });

  it("opens on ArrowUp at its last link", () => {
    render(<Nav />);
    const button = trigger("Resources");
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowUp" });
    expect(document.activeElement).toBe(panelLinks(button).at(-1));
  });

  it("names each link by its label and describes it by its line", () => {
    render(<Nav />);
    const link = within(panelOf(trigger("Resources"))).getByRole("link", {
      name: "Litepaper",
    });
    expect(link.getAttribute("href")).toBe("/litepaper");
    const description = document.getElementById(
      link.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toMatch(/protocol/i);
  });

  it("roots the section links at / so they work from other pages", () => {
    pathname = "/evidence";
    render(<Nav />);
    const hrefs = panelLinks(trigger("Platform")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/#solution",
      "/#architecture",
      "/#reputation",
      "/#use-cases",
      "/#roadmap",
    ]);
  });
});

describe("the current page", () => {
  const current = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('[aria-current="page"]')).map((el) =>
      el.getAttribute("href"),
    );

  it.each([
    ["/guide/list-your-agent", "/guide/list-your-agent", null],
    ["/evidence", "/evidence", "Resources"],
    ["/litepaper", "/litepaper", "Resources"],
  ])("on %s marks %s, in the bar and in the sheet", (path, href, menu) => {
    pathname = path;
    render(<Nav />);
    expect(current(bar())).toEqual([href]);
    expect(current(sheet())).toEqual([href]);
    for (const name of ["Platform", "Resources"]) {
      expect(trigger(name).hasAttribute("data-current")).toBe(name === menu);
    }
  });

  it("marks nothing on the home page", () => {
    render(<Nav />);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});

describe("mobile sheet", () => {
  it("is a closed dialog the toggle controls", () => {
    render(<Nav />);
    expect(toggle().getAttribute("aria-controls")).toBe(sheet().id);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(sheet().open).toBe(false);
  });

  it("opens with focus on its first link and the page locked", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    expect(sheet().open).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    const site = within(sheet()).getByRole("navigation", { name: "Site" });
    expect(document.activeElement).toBe(within(site).getAllByRole("link")[0]);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("groups its links under headed sections", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    const headings = within(sheet())
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Platform", "Resources"]);
  });

  it("puts Connect Wallet and Launch App at the bottom, after every link", () => {
    render(<Nav />);
    const controls = Array.from(
      sheet().querySelectorAll<HTMLElement>("a[href], button"),
    ).map((el) => el.textContent?.trim());
    expect(controls.slice(-2)).toEqual(["Connect Wallet", "Launch App ▸"]);
  });

  it("traps Tab inside itself, both ways", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    const focusables = Array.from(
      sheet().querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
    );
    const first = focusables[0];
    const last = focusables.at(-1)!;

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape, unlocks the page and returns focus to the toggle", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      sheet().dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    expect(sheet().open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).toBe(toggle());
  });

  it("closes from its close button", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "Close menu" }),
    );
    expect(sheet().open).toBe(false);
    expect(document.activeElement).toBe(toggle());
  });

  it("closes when a link in it is followed", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    fireEvent.click(within(sheet()).getByRole("link", { name: "Roadmap" }));
    expect(sheet().open).toBe(false);
  });

  it("closes on a press on its backdrop", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    fireEvent.pointerDown(sheet());
    fireEvent.click(sheet());
    expect(sheet().open).toBe(false);
  });

  it("steps aside before the wallet picker opens", () => {
    render(<Nav />);
    fireEvent.click(toggle());
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "Connect Wallet" }),
    );
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sheet().open).toBe(false);
  });

  it("closes on a route change", () => {
    const { rerender } = render(<Nav />);
    fireEvent.click(toggle());
    expect(sheet().open).toBe(true);
    pathname = "/evidence";
    rerender(<Nav />);
    expect(sheet().open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("route change", () => {
  it("closes an open desktop menu", () => {
    const { rerender } = render(<Nav />);
    fireEvent.click(trigger("Resources"));
    pathname = "/litepaper";
    rerender(<Nav />);
    expect(isOpen(trigger("Resources"))).toBe(false);
  });
});
