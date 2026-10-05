"use client";

import { useEffect } from "react";
import { classifyError } from "@/lib/error-recovery";
import { reportClientError } from "@/lib/report-error";

// Renders in place of the root layout, so globals.css is not guaranteed
// to be present — style inline with the design-language palette.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      kind: classifyError(error),
      route: window.location.pathname,
      recovery: "shown",
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 24px",
          background: "#0A0014",
          color: "#F5F3FF",
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#FF2E9A",
          }}
        >
          {"// system fault"}
        </p>
        <h1
          style={{
            margin: "16px 0 0",
            fontSize: 28,
            letterSpacing: "0.2em",
            fontWeight: 700,
            textShadow: "0 0 12px rgba(176,38,255,0.7)",
          }}
        >
          SYSTEM FAULT
        </h1>
        <p
          style={{
            margin: "16px 0 0",
            maxWidth: 380,
            fontSize: 12,
            lineHeight: 1.7,
            color: "#A79FC7",
          }}
        >
          A critical error interrupted this process. The rest of the network is
          unaffected — retry the operation.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 32,
            height: 40,
            padding: "0 20px",
            fontFamily: "inherit",
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#F5F3FF",
            background: "transparent",
            border: "1px solid rgba(176,38,255,0.6)",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
