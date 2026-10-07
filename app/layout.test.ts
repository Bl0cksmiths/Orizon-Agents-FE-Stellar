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

const read = (path: string) =>
  readFileSync(join(__dirname, "..", path), "utf8");
const LAYOUT = read("app/layout.tsx");

/**
 * Client components that are boundaries themselves: each wraps everything it
 * renders in an <Isolate>, and is checked for it below. The wallet's is one
 * because it needs the page twice (see the last test).
 */
const BOUNDARIES: Record<string, string> = {
  WalletBoundary: "components/wallet-boundary.tsx",
};

describe("the root layout", () => {
  it("renders every component inside a local boundary", () => {
    expect(
      unisolated(LAYOUT, (tag) => isComponent(tag) && !(tag in BOUNDARIES)),
    ).toEqual([]);
  });

  it.each(Object.entries(BOUNDARIES))(
    "%s renders everything inside a local boundary",
    (_, file) => {
      const source = read(file);
      expect(source).toContain("<Isolate");
      expect(unisolated(source, isComponent)).toEqual([]);
    },
  );

  it("still renders the wallet provider and both telemetry components", () => {
    // The guards above pass for a layout with nothing in it; this keeps them
    // reading the layout that is really there.
    for (const tag of ["WalletBoundary", "Analytics", "SpeedInsights"]) {
      expect(LAYOUT).toContain(`<${tag}`);
    }
    expect(read(BOUNDARIES.WalletBoundary)).toContain("<WalletProvider");
  });

  it("sends the page once", () => {
    // Written twice in this server component (say, as a boundary's children
    // and again in its fallback), the page goes into the RSC payload twice,
    // the second time as a reference to the first, and Next 14.2's React can
    // resolve that reference to null mid-hydration: the page then fails to
    // hydrate on a share of loads. A boundary that needs the page twice is a
    // client component that receives it once (components/wallet-boundary.tsx).
    expect(LAYOUT.match(/\{children\}/g)).toHaveLength(1);
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
