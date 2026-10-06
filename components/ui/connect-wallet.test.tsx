// @vitest-environment jsdom
/**
 * The connect control when the wallet could not start on the page: it says
 * so in place of a button that could never work.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WalletUnavailable } from "@/lib/wallet";
import { ConnectWallet } from "./connect-wallet";

afterEach(cleanup);

describe("ConnectWallet with the wallet unavailable", () => {
  it("states the wallet is unavailable instead of offering to connect", () => {
    render(
      <WalletUnavailable>
        <ConnectWallet className="hidden lg:flex" />
      </WalletUnavailable>,
    );
    const note = screen.getByText("Wallet unavailable");
    expect(note.closest("div")?.className).toContain("lg:flex");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
