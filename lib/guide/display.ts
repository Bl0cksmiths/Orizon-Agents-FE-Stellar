/**
 * What the guide page says about a guide, as plain functions: its URL, the
 * backend commit it was verified against, its date, and the words for each
 * code block's verify mode and each callout.
 */

import type { VerifyMode } from "./fence";
import type { CalloutKind } from "./parse";

export const SITE_URL = "https://orizons.xyz";

/** The one guide every "how do I list my agent" link points at. */
export const LIST_YOUR_AGENT_SLUG = "list-your-agent";

export function guidePath(slug: string): string {
  return `/guide/${slug}`;
}

export const LIST_YOUR_AGENT_PATH = guidePath(LIST_YOUR_AGENT_SLUG);

const BACKEND_REPO = "https://github.com/Bl0cksmiths/Orizon-Agents-BE-Stellar";

export function backendCommitUrl(sha: string): string {
  return `${BACKEND_REPO}/commit/${sha}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** "2026-09-29" → "September 29, 2026", the same on every server. */
export function formatGuideDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The verify badge on each sample, and the sentence that explains it. The
 * explanation is printed once on the page, never hidden in a tooltip.
 */
export const VERIFY_TEXT: Record<
  VerifyMode,
  { label: string; explanation: string }
> = {
  live: {
    label: "Runs live",
    explanation:
      "Runs as written against the public testnet backend. Nothing of yours is needed.",
  },
  offline: {
    label: "Runs offline",
    explanation:
      "Runs on your own machine without calling Orizon, for example to build or check a signature.",
  },
  manual: {
    label: "Needs your key",
    explanation:
      "Needs something only you have, such as your secret key, account or endpoint, filled in before it runs.",
  },
};

export const CALLOUT_LABEL: Record<CalloutKind, string> = {
  note: "Note",
  warning: "Warning",
  limitation: "Limitation",
};

export const DRAFT_NOTICE = "Draft — not yet validated by a newcomer";
