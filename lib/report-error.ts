import { track } from "@vercel/analytics";
import type { ErrorKind } from "./error-recovery";

/** What the boundary did about the error: reloaded by itself, or showed the
 * error screen. */
export type ErrorRecovery = "auto-reload" | "shown";

export type ErrorReport = {
  kind: ErrorKind;
  /** The page's path. Its query and fragment are dropped before sending. */
  route: string;
  recovery: ErrorRecovery;
};

const MESSAGE_MAX = 120;
const ROUTE_MAX = 100;

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  // A URL keeps its path; its query and fragment can carry task ids and read
  // tokens. React's decoder link loses only its `?invariant=`, and the error
  // number stays in the message itself.
  [/\b(https?:\/\/[^\s?#'")]+)[?#][^\s'")]*/g, "$1"],
  [/(\/[^\s?#'")]*)\?[^\s'")]*/g, "$1"],
  // Stellar accounts and secret seeds (StrKey: a version letter, 55 base32
  // characters), and muxed accounts.
  [/\b[GS][A-Z2-7]{55}\b|\bM[A-Z2-7]{68}\b/g, "[key]"],
  [/[^\s@()<>'"]+@[^\s@()<>'"]+\.[a-z]{2,}/gi, "[email]"],
  // Transaction hashes, signatures and other long hex.
  [/\b[0-9a-f]{32,}\b/gi, "[hex]"],
];

/** The text with anything that could identify a visitor taken out. */
export function scrubForTelemetry(text: string): string {
  return REDACTIONS.reduce((t, [re, by]) => t.replace(re, by), text);
}

/**
 * Report a client-side error caught by an error boundary to telemetry.
 *
 * Shared by every error boundary (`app/error`, `app/global-error`,
 * `app/app/error`) so the event name, its fields, the scrubbing and the
 * "telemetry must never throw inside a boundary" guarantee are defined in
 * exactly one place. A boundary is the last line of defence, so a failure in
 * `track()` here must never mask the error the boundary is handling.
 *
 * Sent: the digest, the scrubbed message (no URL queries, Stellar keys,
 * emails or long hex), the kind, the path without its query, and what the
 * boundary did about it. Nothing else about the visitor.
 */
export function reportClientError(
  error: Error & { digest?: string },
  report: ErrorReport,
): void {
  console.error(error);
  try {
    track("client-error", {
      digest: error.digest ?? "none",
      message: scrubForTelemetry(String(error.message)).slice(0, MESSAGE_MAX),
      kind: report.kind,
      route: scrubForTelemetry(report.route.split(/[?#]/)[0]).slice(
        0,
        ROUTE_MAX,
      ),
      recovery: report.recovery,
    });
  } catch {
    // Telemetry must never throw inside an error boundary.
  }
}
