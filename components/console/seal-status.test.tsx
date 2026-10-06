// @vitest-environment jsdom
/**
 * The trace's seal line (components/console/seal-status.tsx): every state in
 * words, announced as status, never by colour alone.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SealStatus } from "./seal-status";

afterEach(cleanup);

describe("SealStatus", () => {
  it.each([
    ["sealed", "Sealed on Stellar"],
    ["pending", "Sealing… checking the ledger"],
    ["unconfirmed", "Seal not confirmed yet"],
    ["failed", "Seal failed — your payment stands"],
  ] as const)("says %s as %s, as a status", (seal, label) => {
    render(<SealStatus seal={seal} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain(label);
  });

  it("tells a failed seal's buyer the payment stands", () => {
    render(<SealStatus seal="failed" />);
    expect(screen.getByRole("status").textContent).toMatch(
      /payment for this run is unaffected/,
    );
  });

  it("says why there is no seal when none was submitted", () => {
    render(<SealStatus seal={null} />);
    expect(screen.getByRole("status").textContent).toMatch(
      /No attestation seal was submitted/,
    );
  });

  it("keeps its glyph out of what a screen reader hears", () => {
    const { container } = render(<SealStatus seal="sealed" />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "✓ ",
    );
  });

  it("says a delivery-only seal without implying a payment", () => {
    render(<SealStatus seal="sealed" kind="delivery_only" />);
    const said = screen.getByRole("status").textContent ?? "";
    expect(said).toContain("Attested on Stellar — delivered, no payment made");
    expect(said).not.toMatch(/payment stands|disput/i);
  });
});
