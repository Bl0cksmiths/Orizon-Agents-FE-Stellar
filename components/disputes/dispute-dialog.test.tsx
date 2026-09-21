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
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import type {
  CreditPolicy,
  Dispute,
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

import { ApiError } from "@/lib/api";
import { DisputeRefusal } from "@/lib/disputes";
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

const DISPUTE: Dispute = {
  id: "dsp_1",
  job_id_hex: JOB,
  task_id: "task-1",
  step_index: STEP.step_index,
  agent_id: STEP.agent_id,
  payer: PAYER,
  reason: REASON,
  status: "open",
  charged_usdc: STEP.price_usdc,
  creditable_usdc: STEP.creditable_usdc,
  opened_at: 1_790_000_600,
  resolved_at: null,
  refund_tx: null,
  rating_tx: null,
};

/** The challenge message the stand-in asks the wallet to sign. */
const CHALLENGE = `orizon-dispute:v1:${JOB}:${STEP.step_index}:nonce-1`;

type RaiseArgs = {
  settlement: SettlementView;
  step: SettlementStepView;
  reason: string;
  payer: string;
  signMessage: (message: string) => Promise<string>;
};

/** A promise the test settles by hand, to hold the sequence at one state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * The real sequence's shape — challenge, one signature over its message, then
 * the open — with `open` deciding how the backend answers.
 */
function raiseThen(open: () => Promise<Dispute> = async () => DISPUTE) {
  raiseDispute.mockImplementation(async ({ signMessage }: RaiseArgs) => {
    await signMessage(CHALLENGE);
    return open();
  });
}

const dialog = () => screen.getByRole("dialog");
const reasonBox = () =>
  screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Your reason" });
/** The form's primary action, whatever its label says at this moment. */
const submitButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: /sign|submit/i });

const status = () => screen.getByRole("status").textContent;

function typeReason(value: string) {
  fireEvent.change(reasonBox(), { target: { value } });
}

/** Types a reason and submits, letting whatever the stand-in does settle. */
async function submitWith(reason = REASON) {
  typeReason(reason);
  await act(async () => {
    fireEvent.click(submitButton());
  });
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

describe("DisputeDialog — submitting", () => {
  it("hands raiseDispute the settlement, the step, the reason and the connected wallet", async () => {
    raiseThen();
    const { props } = renderDialog();

    await submitWith();

    expect(raiseDispute).toHaveBeenCalledTimes(1);
    expect(raiseDispute.mock.calls[0][0]).toMatchObject({
      settlement: props.settlement,
      step: STEP,
      reason: REASON,
      payer: PAYER,
    });
    // The wallet signs the challenge's message, verbatim.
    expect(wallet.signMessage).toHaveBeenCalledWith(CHALLENGE);
  });

  it("hands the stored dispute to onSubmitted, once", async () => {
    raiseThen();
    const { props } = renderDialog();

    await submitWith();

    expect(props.onSubmitted).toHaveBeenCalledTimes(1);
    expect(props.onSubmitted).toHaveBeenCalledWith(DISPUTE);
  });

  it("moves idle → signing → submitting → done, one state at a time", async () => {
    const challenge = deferred<void>();
    const signature = deferred<string>();
    const opened = deferred<Dispute>();
    wallet.signMessage.mockReturnValue(signature.promise);
    raiseDispute.mockImplementation(async ({ signMessage }: RaiseArgs) => {
      await challenge.promise;
      await signMessage(CHALLENGE);
      return opened.promise;
    });
    renderDialog();
    expect(status()).toBe("");

    await submitWith();
    expect(status()).toBe("Preparing the message to sign…");

    await act(async () => challenge.resolve());
    expect(status()).toBe(
      "Waiting for your wallet… Approve the signature in Freighter.",
    );
    // Named without the decorative ◉, which is hidden from assistive tech.
    expect(submitButton()).toBe(
      screen.getByRole("button", { name: "Signing…" }),
    );

    await act(async () => signature.resolve("c2lnbmF0dXJl"));
    expect(status()).toBe("Signed. Submitting your dispute…");
    expect(submitButton()).toBe(
      screen.getByRole("button", { name: "Submitting…" }),
    );

    await act(async () => opened.resolve(DISPUTE));
    expect(status()).toBe("Your dispute was raised.");
  });

  it("cannot be dismissed, or submitted twice, while the wallet is signing", async () => {
    const signature = deferred<string>();
    wallet.signMessage.mockReturnValue(signature.promise);
    raiseThen();
    const { props } = renderDialog();
    await submitWith();

    // Escape is stopped before it becomes a close request…
    expect(fireEvent.keyDown(reasonBox(), { key: "Escape" })).toBe(false);
    // …and so is a close request that arrives without one.
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      dialog().dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    // The backdrop is ignored, and every way out is disabled.
    fireEvent.pointerDown(dialog());
    fireEvent.click(dialog());
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Close" }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Cancel" })
        .disabled,
    ).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();

    // A second submit — even one forced past the disabled button — is refused.
    expect(submitButton().disabled).toBe(true);
    const form = dialog().querySelector("form");
    if (!form) throw new Error("no form rendered");
    await act(async () => {
      fireEvent.submit(form);
    });
    expect(raiseDispute).toHaveBeenCalledTimes(1);
    // The reason stays on screen, fixed, while it is being signed.
    expect(reasonBox().readOnly).toBe(true);
    expect(reasonBox().value).toBe(REASON);

    await act(async () => signature.resolve("c2lnbmF0dXJl"));
  });

  it("cannot be dismissed while the dispute is being submitted", async () => {
    const opened = deferred<Dispute>();
    raiseThen(() => opened.promise);
    const { props } = renderDialog();
    await submitWith();
    expect(status()).toBe("Signed. Submitting your dispute…");

    expect(fireEvent.keyDown(reasonBox(), { key: "Escape" })).toBe(false);
    expect(props.onClose).not.toHaveBeenCalled();

    await act(async () => opened.resolve(DISPUTE));
  });

  it("shows the dispute as stored, focuses Done, and closes as dismissed", async () => {
    raiseThen();
    const { props } = renderDialog();

    await submitWith();

    expect(screen.getByText("dispute raised")).toBeTruthy();
    expect(screen.getByText("under review")).toBeTruthy();
    expect(screen.getByText(REASON)).toBeTruthy();
    const done = screen.getByRole("button", { name: "Done" });
    expect(document.activeElement).toBe(done);

    fireEvent.click(done);

    expect(props.onClose).toHaveBeenCalledWith("dismissed");
  });

  it("asks the wallet once more when the first challenge expired unused", async () => {
    const second = deferred<string>();
    wallet.signMessage
      .mockResolvedValueOnce("Zmlyc3Q=")
      .mockReturnValueOnce(second.promise);
    raiseDispute.mockImplementation(async ({ signMessage }: RaiseArgs) => {
      await signMessage(CHALLENGE);
      await signMessage(`${CHALLENGE}-2`);
      return DISPUTE;
    });
    renderDialog();

    await submitWith();

    expect(status()).toBe(
      "The first signature expired before it could be used. Waiting for your wallet to sign once more…",
    );
    await act(async () => second.resolve("c2Vjb25k"));
    expect(status()).toBe("Your dispute was raised.");
  });

  it("submits from the reason with Ctrl+Enter", async () => {
    raiseThen();
    renderDialog();
    typeReason(REASON);

    await act(async () => {
      fireEvent.keyDown(reasonBox(), { key: "Enter", ctrlKey: true });
    });

    expect(raiseDispute).toHaveBeenCalledTimes(1);
  });

  it("says so, and cannot submit, when no wallet is connected", () => {
    wallet.address = null;
    renderDialog();

    typeReason(REASON);

    expect(
      screen.getByText(
        "No wallet is connected. Close this, connect that wallet, then raise the dispute.",
      ),
    ).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
  });
});

describe("DisputeDialog — refusals, in plain words", () => {
  const GENERIC =
    "Your dispute couldn't be submitted. Your reason is still here — try again.";

  /** A refusal in the backend's envelope, as lib/api turns it into an error. */
  const refused = (code: string, status: number, retryAfterMs?: number) =>
    new ApiError(`refused: ${code}`, status, retryAfterMs, code);

  const alertText = () => screen.getByRole("alert").textContent;

  it.each([
    [
      "dispute_window_closed",
      "The dispute window for this workflow has closed, so this step can no longer be disputed.",
      "stale",
    ],
    [
      "step_not_settled",
      "This step was never settled, so there is nothing to dispute on it.",
      "stale",
    ],
    [
      "nothing_was_charged",
      "Nothing was charged for this step, so there is nothing to dispute on it.",
      "stale",
    ],
    [
      "not_the_payer",
      "The connected wallet isn't the one that paid for this workflow. Close this, connect GBPA…QQQQ, and try again.",
      // The receipt is right; only the connected wallet is wrong.
      "dismissed",
    ],
  ])(
    "%s: says so, keeps the reason, and offers only a way out",
    async (code, message, closeReason) => {
      raiseThen(async () => {
        throw refused(code, 409);
      });
      const { props } = renderDialog();

      await submitWith();

      expect(alertText()).toBe(message);
      expect(reasonBox().value).toBe(REASON);
      // Nothing in the dialog can change this answer, so no retry is offered.
      expect(screen.queryByRole("button", { name: /sign|submit/i })).toBeNull();
      const back = screen.getByRole("button", { name: "Back to the receipt" });
      expect(document.activeElement).toBe(back);

      fireEvent.click(back);

      expect(props.onClose).toHaveBeenCalledWith(closeReason);
      expect(props.onSubmitted).not.toHaveBeenCalled();
    },
  );

  it("refuses a wallet that did not pay before it is ever asked to sign", async () => {
    raiseDispute.mockRejectedValue(
      new DisputeRefusal(
        "not_the_payer",
        "Only the wallet that paid for this workflow can dispute it.",
      ),
    );
    renderDialog();

    await submitWith();

    expect(alertText()).toBe(
      "The connected wallet isn't the one that paid for this workflow. Close this, connect GBPA…QQQQ, and try again.",
    );
    expect(wallet.signMessage).not.toHaveBeenCalled();
  });

  it.each([
    [
      "rate_limited, with a Retry-After",
      refused("rate_limited", 429, 30_000),
      "Too many requests — wait 30s and try again. Nothing was lost.",
    ],
    [
      "a bare 429 from a proxy",
      new ApiError("Too Many Requests", 429),
      "Too many requests — wait a moment and try again. Nothing was lost.",
    ],
    ["unknown_job", refused("unknown_job", 404), GENERIC],
    ["signature_malformed", refused("signature_malformed", 400), GENERIC],
    ["a second expired challenge", refused("challenge_expired", 409), GENERIC],
    ["a code newer than this build", refused("dispute_frozen", 409), GENERIC],
    ["a dropped connection", new Error("Failed to fetch"), GENERIC],
  ])(
    "%s: says so, keeps the reason, and lets the buyer try again",
    async (_label, error, message) => {
      raiseThen(async () => {
        throw error;
      });
      const { props } = renderDialog();

      await submitWith();

      expect(alertText()).toBe(message);
      expect(reasonBox().value).toBe(REASON);
      expect(reasonBox().readOnly).toBe(false);
      const retry = screen.getByRole<HTMLButtonElement>("button", {
        name: "Sign and submit again",
      });
      expect(retry.disabled).toBe(false);
      expect(document.activeElement).toBe(retry);
      expect(props.onSubmitted).not.toHaveBeenCalled();

      raiseThen();
      await act(async () => {
        fireEvent.click(retry);
      });

      expect(raiseDispute).toHaveBeenCalledTimes(2);
      expect(raiseDispute.mock.calls[1][0]).toMatchObject({ reason: REASON });
      expect(props.onSubmitted).toHaveBeenCalledWith(DISPUTE);
    },
  );

  it("sends the buyer back to the reason when it is the reason that was refused", async () => {
    raiseThen(async () => {
      throw refused("reason_required", 422);
    });
    renderDialog();

    await submitWith();

    expect(alertText()).toBe(
      "Say what went wrong with this step, in words, before submitting.",
    );
    expect(reasonBox().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(reasonBox());
  });

  it("retires the error once the reason is edited", async () => {
    raiseThen(async () => {
      throw new Error("Failed to fetch");
    });
    renderDialog();
    await submitWith();
    expect(screen.getByRole("alert")).toBeTruthy();

    typeReason(`${REASON}, at all`);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Sign and submit" }),
    ).toBeTruthy();
  });
});
