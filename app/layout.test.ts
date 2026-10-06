/**
 * The root layout renders every page, so anything it draws that throws takes
 * the whole document down to app/global-error.tsx: that is how Google came to
 * index the home page as "system fault". Every component the root layout
 * renders must therefore sit inside a local boundary (<Isolate>), so a
 * provider added later cannot bring the risk back unnoticed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isComponent, unisolated } from "@/test/isolation";

const LAYOUT = readFileSync(join(__dirname, "layout.tsx"), "utf8");

describe("the root layout", () => {
  it("renders every component inside a local boundary", () => {
    expect(unisolated(LAYOUT, isComponent)).toEqual([]);
  });

  it("still renders the wallet provider and both telemetry components", () => {
    // The guard above passes for a layout with nothing in it; this keeps it
    // reading the layout that is really there.
    for (const tag of ["WalletProvider", "Analytics", "SpeedInsights"]) {
      expect(LAYOUT).toContain(`<${tag}`);
    }
  });
});

describe("the guard itself", () => {
  it("finds a provider rendered outside any boundary", () => {
    const layout = `
      export default function L({ children }) {
        return (
          <html><body>
            <Isolate name="wallet"><WalletProvider>{children}</WalletProvider></Isolate>
            <ThemeProvider>{children}</ThemeProvider>
            <Telemetry.Beacon />
          </body></html>
        );
      }`;
    expect(unisolated(layout, isComponent)).toEqual([
      "ThemeProvider",
      "Telemetry.Beacon",
    ]);
  });

  it("counts a boundary's fallback as inside it", () => {
    const layout = `
      <Isolate name="wallet" fallback={<WalletUnavailable>{children}</WalletUnavailable>}>
        <WalletProvider>{children}</WalletProvider>
      </Isolate>`;
    expect(unisolated(layout, isComponent)).toEqual([]);
  });

  it("ignores plain HTML elements", () => {
    expect(
      unisolated(`<html><body><a href="#main" /></body></html>`, isComponent),
    ).toEqual([]);
  });
});
