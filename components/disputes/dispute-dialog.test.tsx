// @vitest-environment jsdom
/**
 * Unit tests for DisputeDialog, the form a buyer disputes one settled step
 * with (story 4.05).
 *
 * The form is judged on two things. First, what it says BEFORE anything is
 * signed: the step, the money, the terms as the backend served them, a
 * mandatory reason, and what signing does — in that order. Second, how it
 * behaves once the buyer commits: one state at a time, no way out while the
 * wallet is signing, every refusal in plain words, and never a lost reason.
 *
 * `raiseDispute` is replaced by a stand-in that drives the `signMessage` it
 * is handed exactly as the real one does (challenge → sign → open), so the
 * dialog's own wrapper — the part that tells a wallet refusal from a backend
 * one — runs for real. Everything else in lib/disputes (the error-code reader,
 * the formatter, the cap) is the real module. The wallet is a plain object.
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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type {
  CreditPolicy,
  SettlementStepView,
  SettlementView,
} from "@/lib/types";

// Hoisted: vi.mock factories run before module-scope consts are initialized.
const { wallet, raiseDispute } = vi.hoisted(() => ({
  wallet: {
    address: null as string | null,
    walletName: null as string | null,
    signMessage: vi.fn<(message: string) => Promise<string>>(),
  },
  raiseDispute: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet }));
vi.mock("@/lib/disputes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/disputes")>()),
  raiseDispute,
}));

import { DisputeDialog, type DisputeDialogProps } from "./dispute-dialog";

// ── jsdom has no modal dialogs ──────────────────────────────────────────────
//
// jsdom 29 ships HTMLDialogElement and reflects `open`, but implements none of
// showModal() or close(). They are modelled here, for this file only, on the
// HTML spec (see components/ui/dialog.test.tsx for the same model and its
// reasoning): showModal() sets `open` and focuses the first focusable
// descendant; close() clears it and fires `close` as a queued task.

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
    this.querySelector<HTMLElement>(FOCUSABLE)?.focus();
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

// ── fixtures ────────────────────────────────────────────────────────────────

const PAYER = "GBPAYER".padEnd(56, "Q");
const JOB = "ab".repeat(32);

const POLICY: CreditPolicy = {
  credited_fraction: 0.5,
  funded_by: "platform",
  adjudicated_by: "platform",
};

const STEP: SettlementStepView = {
  step_index: 1,
  agent_id: "code.gen",
  agent_name: "Code Gen",
  price_usdc: 0.054,
  delivered: true,
  creditable_usdc: 0.027,
  output_summary: "calculator app, 3 files",
};

function settlementWith(policy: CreditPolicy = POLICY): SettlementView {
  return {
    job_id_hex: JOB,
    payer: PAYER,
    settled_at: 1_790_000_000,
    window_closes_at: 1_790_086_400,
    settled_usdc: 0.066,
    charge_tx: "c".repeat(64),
    proof_tx: null,
    steps: [STEP],
    policy,
  };
}

beforeEach(() => {
  wallet.address = PAYER;
  wallet.walletName = "Freighter";
  wallet.signMessage.mockReset();
  wallet.signMessage.mockResolvedValue("c2lnbmF0dXJl");
  raiseDispute.mockReset();
});

afterEach(cleanup);

function renderDialog(overrides: Partial<DisputeDialogProps> = {}) {
  const props: DisputeDialogProps = {
    open: true,
    step: STEP,
    settlement: settlementWith(),
    onClose: vi.fn(),
    onSubmitted: vi.fn(),
    ...overrides,
  };
  const view = render(<DisputeDialog {...props} />);
  return {
    props,
    rerender: (next: Partial<DisputeDialogProps>) =>
      view.rerender(<DisputeDialog {...props} {...next} />),
  };
}

const REASON = "the calculator it built does not compute anything";

const dialog = () => screen.getByRole("dialog");
const reasonBox = () =>
  screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Your reason" });
const submitButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: /sign and submit/i });

function typeReason(value: string) {
  fireEvent.change(reasonBox(), { target: { value } });
}

describe("DisputeDialog — what the buyer reads before submitting", () => {
  it("is named for the step and hidden when there is no step to dispute", () => {
    const { rerender } = renderDialog();
    expect(screen.getByRole("dialog", { name: "Dispute step 2" })).toBe(
      dialog(),
    );

    rerender({ step: null });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("presents the step, the money, the terms, the reason and signing, in that order", () => {
    renderDialog();

    const inOrder = [
      screen.getByText("Step 2"),
      screen.getByText("Code Gen"),
      screen.getByText("calculator app, 3 files"),
      screen.getByText("0.054 USDC"),
      screen.getByText("0.027 USDC"),
      screen.getByText(/credits 50% of this step's charge/),
      reasonBox(),
      screen.getByText(/to sign a message/),
    ];
    for (let i = 1; i < inOrder.length; i += 1) {
      const previous = inOrder[i - 1];
      const current = inOrder[i];
      // DOCUMENT_POSITION_FOLLOWING: `current` comes after `previous`.
      expect(previous.compareDocumentPosition(current) & 4).toBe(4);
    }
  });

  it("labels the charge and the credit", () => {
    renderDialog();

    expect(screen.getByText("Charged for this step")).toBeTruthy();
    expect(screen.getByText("Credited if upheld")).toBeTruthy();
  });

  it("says plainly when no summary of the step's output was recorded", () => {
    renderDialog({ step: { ...STEP, output_summary: null } });

    expect(
      screen.getByText(
        "No summary of what this step produced was recorded for this run.",
      ),
    ).toBeTruthy();
  });

  it("reads the credited fraction off the policy, so changing it changes the text", () => {
    const { rerender } = renderDialog();
    expect(screen.getByText(/credits 50% of this step's charge/)).toBeTruthy();

    rerender({
      settlement: settlementWith({ ...POLICY, credited_fraction: 0.25 }),
    });

    expect(screen.getByText(/credits 25% of this step's charge/)).toBeTruthy();
    expect(screen.queryByText(/50%/)).toBeNull();
  });

  it("keeps a fraction's precision rather than rounding it", () => {
    renderDialog({
      settlement: settlementWith({ ...POLICY, credited_fraction: 0.125 }),
    });

    expect(
      screen.getByText(/credits 12.5% of this step's charge/),
    ).toBeTruthy();
  });

  it("says so when the policy credits nothing", () => {
    renderDialog({
      settlement: settlementWith({ ...POLICY, credited_fraction: 0 }),
    });

    expect(
      screen.getByText(
        "Under the current terms an upheld dispute credits nothing back.",
      ),
    ).toBeTruthy();
  });

  it("says who pays the credit and who decides, from the policy", () => {
    renderDialog();

    expect(
      screen.getByText(
        "The platform pays the credit. Nothing is clawed back from the agent.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The platform reviews the dispute and decides. There is no on-chain arbitration.",
      ),
    ).toBeTruthy();
  });

  it("says which wallet will sign, that signing is free and that nothing is sent", () => {
    renderDialog();

    const line = screen.getByText(/to sign a message/);
    expect(line.textContent).toContain("GBPA…QQQQ");
    expect(line.textContent).toContain("Signing costs nothing");
    expect(line.textContent).toContain("no transaction is sent");
  });
});

describe("DisputeDialog — the reason", () => {
  it("keeps submit disabled while the reason is empty", () => {
    renderDialog();

    expect(reasonBox().value).toBe("");
    expect(submitButton().disabled).toBe(true);
  });

  it("keeps submit disabled while the reason is only whitespace", () => {
    renderDialog();

    typeReason("   \n\t  ");

    expect(submitButton().disabled).toBe(true);
  });

  it("enables submit once there are words, and disables it again when they go", () => {
    renderDialog();

    typeReason(REASON);
    expect(submitButton().disabled).toBe(false);

    typeReason("");
    expect(submitButton().disabled).toBe(true);
  });

  it("is a required field, described by its hint and its counter", () => {
    renderDialog();

    const box = reasonBox();
    expect(box.required).toBe(true);
    const describedBy = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "");
    expect(describedBy[0]).toMatch(/^Required\./);
    expect(describedBy[1]).toBe("0 / 500 characters");
  });

  it("caps the field at 500 characters, so nothing is cut behind the buyer's back", () => {
    renderDialog();

    // The browser enforces maxLength on typing and pasting; jsdom does not
    // simulate either, so the cap is asserted where it lives.
    expect(reasonBox().maxLength).toBe(500);
  });

  it("counts characters as they are typed", () => {
    renderDialog();

    typeReason("hello");

    expect(screen.getByText("5 / 500 characters")).toBeTruthy();
  });

  it("starts speaking only when the cap is close", () => {
    renderDialog();
    const live = () =>
      dialog().querySelector('[aria-live="polite"]:not([role])')?.textContent;

    typeReason("a".repeat(400));
    expect(live()).toBe("");

    typeReason("a".repeat(480));
    expect(live()).toBe("20 characters left.");
  });

  it("says when the limit is reached", () => {
    renderDialog();

    typeReason("a".repeat(500));

    expect(
      screen.getByText("500 / 500 characters · limit reached"),
    ).toBeTruthy();
  });
});
