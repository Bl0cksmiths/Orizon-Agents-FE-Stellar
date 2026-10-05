"use client";

import type { CSSProperties } from "react";
import { ERROR_COPY } from "@/lib/error-recovery";
import { useErrorRecovery } from "@/lib/use-error-recovery";

/**
 * The last-resort error screen: shown when the root layout itself failed, so
 * it renders its own <html> and cannot count on globals.css or the site's
 * fonts. It is styled inline in the site's palette and says what the other
 * error screens say; a deploy-skew chunk error reloads by itself
 * (lib/use-error-recovery.ts).
 */

const palette = {
  bg: "#0A0014",
  text: "#F5F3FF",
  muted: "#A79FC7",
  violet: "#B026FF",
  cyan: "#00FFD1",
};

const SANS =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace";

const styles = {
  body: {
    margin: 0,
    background: palette.bg,
    color: palette.text,
    fontFamily: SANS,
    WebkitFontSmoothing: "antialiased",
  },
  main: {
    minHeight: "100vh",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "64px 16px",
    textAlign: "center",
  },
  panel: { width: "100%", maxWidth: 448 },
  heading: {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.25,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    outline: "none",
  },
  message: {
    margin: "12px 0 0",
    fontSize: 14,
    lineHeight: 1.65,
    color: palette.muted,
  },
  actions: {
    marginTop: 32,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  button: {
    height: 40,
    padding: "0 20px",
    border: "none",
    background: palette.violet,
    color: "#FFFFFF",
    fontFamily: MONO,
    fontSize: 12,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    cursor: "pointer",
    // The site's chamfered button corners (globals.css .clip-cyber).
    clipPath:
      "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
  },
  link: {
    color: palette.cyan,
    fontFamily: MONO,
    fontSize: 12,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    textUnderlineOffset: 4,
  },
  status: { margin: 0, fontFamily: MONO, fontSize: 12, color: palette.muted },
} satisfies Record<string, CSSProperties>;

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { kind, phase, headingRef, reload } = useErrorRecovery(error);

  return (
    <html lang="en">
      <body style={styles.body}>
        <main id="main" style={styles.main}>
          {phase === "reloading" ? (
            <p role="status" style={styles.status}>
              {ERROR_COPY.reloading}
            </p>
          ) : (
            <div style={styles.panel}>
              <h1 ref={headingRef} tabIndex={-1} style={styles.heading}>
                {ERROR_COPY.heading}
              </h1>
              <p style={styles.message}>{ERROR_COPY.message[kind]}</p>
              <div style={styles.actions}>
                <button type="button" onClick={reload} style={styles.button}>
                  Reload
                </button>
                <a href="/" style={styles.link}>
                  Go to the home page
                </a>
              </div>
            </div>
          )}
        </main>
      </body>
    </html>
  );
}
