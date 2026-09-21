// @vitest-environment jsdom
/**
 * Unit tests for DisputeStatusBadge.
 *
 * The badge is the buyer's only answer to "what happened to my dispute", so
 * the tests pin the words it says. Each status needs its own label — two
 * statuses reading alike is two outcomes the buyer cannot tell apart — and
 * none may leak the backend's state name in place of plain language.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { DisputeStatus } from "@/lib/types";
import { DisputeStatusBadge, disputeStatusLabel } from "./dispute-status-badge";

afterEach(cleanup);

const LABELS: Record<DisputeStatus, string> = {
  open: "Under review",
  upheld: "Upheld",
  crediting: "Refund in progress",
  credited: "Refunded",
  rejected: "Rejected",
};

const STATUSES = Object.keys(LABELS) as DisputeStatus[];

describe("DisputeStatusBadge", () => {
  it.each(STATUSES)("labels %s in plain language", (status) => {
    render(<DisputeStatusBadge status={status} />);
    expect(screen.getByText(LABELS[status])).toBeTruthy();
    expect(disputeStatusLabel(status)).toBe(LABELS[status]);
  });

  it("gives all five statuses a different label", () => {
    const labels = STATUSES.map(disputeStatusLabel);
    expect(new Set(labels).size).toBe(STATUSES.length);
  });

  // `crediting` is the store's name for a payout held against a double pay;
  // the buyer is told their refund is under way, never the raw state.
  it("reads a refund in flight as a refund, not as a state name", () => {
    const { container } = render(<DisputeStatusBadge status="crediting" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Refund in progress");
    expect(text.toLowerCase()).not.toContain("crediting");
  });

  it("gives all five statuses a different colour", () => {
    const colours = STATUSES.map((status) => {
      const { container } = render(<DisputeStatusBadge status={status} />);
      const badge = container.firstElementChild as HTMLElement;
      const text = badge.className
        .split(/\s+/)
        .find((c) => c.startsWith("text-") && !c.startsWith("text-["));
      cleanup();
      return text;
    });
    expect(colours.every(Boolean)).toBe(true);
    expect(new Set(colours).size).toBe(STATUSES.length);
  });

  // Out of its row the bare label ("Refunded") does not say what it is the
  // status of; a screen reader hears the qualifier the eye gets from layout.
  it("names what the label is the status of for screen readers", () => {
    const { container } = render(<DisputeStatusBadge status="credited" />);
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toContain("Dispute status");
  });

  // The mark repeats the label's meaning in shape as well as colour, and is
  // hidden from assistive tech so it is not read out as "check mark".
  it("hides its decorative mark from assistive tech", () => {
    for (const status of STATUSES) {
      const { container } = render(<DisputeStatusBadge status={status} />);
      const mark = container.querySelector("[aria-hidden='true']");
      expect(mark).not.toBeNull();
      cleanup();
    }
  });
});
