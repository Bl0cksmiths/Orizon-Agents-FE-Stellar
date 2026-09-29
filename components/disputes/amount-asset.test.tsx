// @vitest-environment jsdom
/**
 * The receipt's amounts are denominated in the network's asset: XLM on
 * testnet, no unit while it is unknown, and never "USDC" read off the
 * `*_usdc` field names the figures arrive in (friction F-022).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { AmountAssetProvider, useFormatAmount } from "./amount-asset";

afterEach(cleanup);

function Figure({ n }: { n: number }) {
  const formatAmount = useFormatAmount();
  return <span>{formatAmount(n)}</span>;
}

const shown = (ui: JSX.Element) => render(ui).container.textContent;

describe("useFormatAmount", () => {
  it("prints XLM under the native asset", () => {
    expect(
      shown(
        <AmountAssetProvider asset="native">
          <Figure n={0.027} />
        </AmountAssetProvider>,
      ),
    ).toBe("0.027 XLM");
  });

  it.each([null, undefined])(
    "prints no unit while the asset is %s",
    (asset) => {
      expect(
        shown(
          <AmountAssetProvider asset={asset}>
            <Figure n={0.027} />
          </AmountAssetProvider>,
        ),
      ).toBe("0.027");
    },
  );

  it("prints no unit, and never USDC, outside a provider", () => {
    expect(shown(<Figure n={0.027} />)).toBe("0.027");
  });
});
