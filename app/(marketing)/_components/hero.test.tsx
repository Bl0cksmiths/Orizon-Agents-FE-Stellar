// @vitest-environment jsdom
/**
 * The hero's stat row. It used to hard-code "2,481" agents, "1.2k" tasks a
 * second and "99.3%" trust — none of them measured. It now states only what
 * the server read (lib/public-network-stats.ts), leaves out a figure it could
 * not read, and has no row at all when it read nothing.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Hero } from "./hero";

// The hero animates with framer-motion; every `m.<tag>` renders as the plain
// element without its motion props.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MOTION = new Set(["initial", "animate", "transition"]);
  const m = new Proxy(
    {},
    {
      get:
        (_, tag: string) =>
        ({ children, ...props }: Record<string, unknown>) =>
          React.createElement(
            tag,
            Object.fromEntries(
              Object.entries(props).filter(([k]) => !MOTION.has(k)),
            ),
            children as React.ReactNode,
          ),
    },
  );
  return { m };
});

afterEach(cleanup);

const INVENTED = /2,481|1\.2k|99\.3%|Tasks\/s|Avg trust/;

const statRow = (container: HTMLElement) =>
  container.querySelector("[data-hero-stats]");

/** The figure under each label, label → value. */
function figures(container: HTMLElement): Record<string, string> {
  const row = statRow(container);
  if (!row) return {};
  return Object.fromEntries(
    Array.from(row.querySelectorAll("dt")).map((dt) => [
      dt.textContent ?? "",
      dt.nextElementSibling?.textContent ?? "",
    ]),
  );
}

describe("Hero stat row", () => {
  it("states the registered, external and operator-wallet counts", () => {
    const { container } = render(
      <Hero stats={{ registered: 49, external: 24, operatorWallets: 20 }} />,
    );
    expect(figures(container)).toEqual({
      "Registered agents": "49",
      "External agents": "24",
      "Operator wallets": "20",
    });
    expect(statRow(container)?.textContent).toContain(
      "Read from the Stellar testnet registry",
    );
    expect(container.textContent).not.toMatch(INVENTED);
  });

  it("formats large counts", () => {
    const { container } = render(
      <Hero stats={{ registered: 12_345, external: 0, operatorWallets: 0 }} />,
    );
    expect(figures(container)["Registered agents"]).toBe("12,345");
    expect(figures(container)["External agents"]).toBe("0");
  });

  it("leaves out a figure it could not read", () => {
    const { container } = render(
      <Hero
        stats={{ registered: 49, external: null, operatorWallets: null }}
      />,
    );
    expect(figures(container)).toEqual({ "Registered agents": "49" });
  });

  it("renders no stat row, and no invented figure, without data", () => {
    const { container } = render(<Hero stats={null} />);
    expect(statRow(container)).toBeNull();
    expect(container.querySelector("dl")).toBeNull();
    expect(container.textContent).not.toMatch(INVENTED);
    // The page is otherwise whole: heading, calls to action, the example run.
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByText("Launch Console ▸")).toBeTruthy();
    expect(container.textContent).toContain("orizon.flow");
  });
});
