// @vitest-environment jsdom
/**
 * Unit tests for FiatFund's claims about what the peso ramp pays for.
 *
 * What the ramp credits is fixed: PDAX buys USDC and withdraws USDCXLM to the
 * buyer's Stellar address. Whether that funds the workflow is not — the
 * authorization is signed in whatever the escrow's SAC wraps, which is native
 * XLM on testnet. So the panel may say the pesos fund the workflow only when
 * the escrow takes USDC, and says nothing either way while the asset is
 * unknown.
 *
 * Assertions are plain DOM checks — this repo does not install jest-dom.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Hoisted: the vi.mock factory runs before module-scope consts exist. The
// quote never settles — these tests are about the copy, not the pricing.
const { pdax } = vi.hoisted(() => ({
  pdax: {
    pdaxFundingQuote: vi.fn(() => new Promise(() => {})),
    pdaxReconcileRamp: vi.fn(),
    pdaxStartOnRamp: vi.fn(),
  },
}));
vi.mock("@/lib/pdax", () => pdax);

import { FiatFund } from "./fiat-fund";

afterEach(cleanup);

/** Everything the panel says, as one string. */
function text(asset: string | null | undefined): string {
  const { container } = render(<FiatFund usdcAmount={0.123} asset={asset} />);
  return container.textContent ?? "";
}

/** The two claims that the pesos pay for the workflow itself. */
const FUNDS_WORKFLOW = /Fund this workflow|then you authorize as usual/;

describe("FiatFund · what the ramp is said to pay for", () => {
  // Testnet: the escrow takes native XLM, so USDC in the wallet funds nothing
  // the buyer is about to sign.
  it("never claims the pesos fund an XLM authorization", () => {
    const shown = text("native");
    expect(shown).not.toMatch(FUNDS_WORKFLOW);
    expect(shown).toContain("This network's escrow takes XLM, not USDC");
  });

  // Unknown is not XLM and not USDC. Either claim would be a guess.
  it.each([null, undefined])(
    "claims nothing either way while the asset is %s",
    (asset) => {
      const shown = text(asset);
      expect(shown).not.toMatch(FUNDS_WORKFLOW);
      expect(shown).not.toContain("escrow takes");
      // What the ramp itself delivers is fixed, and still said.
      expect(shown).toContain("USDCXLM");
    },
  );

  // The one deployment where the original promise is true: USDC arrives and
  // the cap is signed in USDC, so no other crypto is needed.
  it("keeps the whole promise where the escrow takes USDC", () => {
    const shown = text("USDC");
    expect(shown).toContain("Fund this workflow with pesos");
    expect(shown).toContain("then you authorize as usual");
    expect(shown).toContain("(no crypto needed)");
    expect(shown).not.toContain("escrow takes");
  });

  it("drops the no-crypto promise wherever the escrow does not take USDC", () => {
    expect(text("native")).not.toContain("no crypto needed");
    expect(text(null)).not.toContain("no crypto needed");
  });
});
