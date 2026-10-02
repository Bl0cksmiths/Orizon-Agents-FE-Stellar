/**
 * What the demo page says, as plain functions and constants: the names of the
 * four funded deliverables, how a timestamp or a hash is written, and every
 * URL the page links to. Nothing here reads the manifest.
 */

import { LIST_YOUR_AGENT_PATH } from "@/lib/guide/display";
import type { DemoRole } from "./load";

export const DEMO_PATH = "/demo";

export type Deliverable = "D1" | "D2" | "D3" | "D4";
/** What a chapter shows: one deliverable, or null when it shows none. */
export type ChapterDeliverable = Deliverable | null;

/** The four deliverables the award funds, as the sprint board names them. */
export const DELIVERABLE_NAMES: Record<Deliverable, string> = {
  D1: "Permissionless agent registration",
  D2: "Reputation-gated routing",
  D3: "Dispute window and partial-credit refund",
  D4: "Ecosystem validation",
};

/** Whose side each part shows, as its heading names it. */
export const ROLE_LABEL: Record<DemoRole, string> = {
  operator: "The operator's side",
  buyer: "The buyer's side",
};

/** "Part 2: The buyer's side"; a part's heading, numbered from 1. */
export function partHeading(index: number, role: DemoRole): string {
  return `Part ${index + 1}: ${ROLE_LABEL[role]}`;
}

/**
 * The one plain sentence under a part recorded on an earlier console, so it
 * is never taken for the console as it is now.
 */
export function earlierConsoleNote(recordedOn: string): string {
  return `This part was recorded on ${formatDemoDate(recordedOn)}, on an earlier version of the console than the one live now.`;
}

/** A deliverable tag's full meaning, for screen readers and tooltips alike. */
export function deliverableLabel(d: Deliverable): string {
  return `Deliverable ${d}: ${DELIVERABLE_NAMES[d]}`;
}

export type EvidenceKind =
  | "register"
  | "authorize"
  | "settle"
  | "seal"
  | "rating"
  | "dispute_rating"
  | "refund"
  | "other";

export const KIND_LABEL: Record<EvidenceKind, string> = {
  register: "Registration",
  authorize: "Authorization",
  settle: "Settlement",
  seal: "Job seal",
  rating: "Rating",
  dispute_rating: "Dispute rating",
  refund: "Refund credit",
  other: "Other",
};

/** 75 → "1:15"; the chapter list's timestamp. */
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 75 → "PT1M15S", for a <time> element's dateTime. */
export function isoDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `PT${m ? `${m}M` : ""}${s || !m ? `${s}S` : ""}`;
}

/** 252 → "4 min 12 s"; 240 → "4 min". */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** A 64-character hash, shortened to its ends: "9b8ffaa4…8f919a68". */
export function truncateHash(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

/** "2026-10-02" → "October 2, 2026", the same on every server. */
export function formatDemoDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** A Unix time in seconds → "October 2, 2026, 14:05 UTC". */
export function formatUnixUtc(seconds: number): string {
  const d = new Date(seconds * 1000);
  const date = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date}, ${hh}:${mm} UTC`;
}

/** The video on YouTube itself, optionally from a second into it. */
export function youtubeWatchUrl(id: string, start = 0): string {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  return start > 0 ? `${url}&t=${start}s` : url;
}

/**
 * The privacy-enhanced embed, which sets no cookie until the viewer plays.
 * It is loaded only by a click, so autoplay is what the viewer asked for.
 * Captions are asked for up front (`cc_load_policy=1`), so a viewer who
 * needs them does not have to find the CC button first.
 */
export function youtubeEmbedUrl(id: string, start = 0): string {
  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    cc_load_policy: "1",
  });
  if (start > 0) params.set("start", String(start));
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`;
}

/** YouTube's own thumbnail, which every video has at this size. */
export function youtubePosterUrl(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

const ORG = "https://github.com/Bl0cksmiths";

export const REPOS = [
  { label: "Frontend", href: `${ORG}/Orizon-Agents-FE-Stellar` },
  { label: "Backend", href: `${ORG}/Orizon-Agents-BE-Stellar` },
  {
    label: "Smart contracts",
    href: `${ORG}/Orizon-Agents-Smart-Contract-Stellar`,
  },
] as const;

/** The weekly tranche evidence bundles, each on the frontend repo's main. */
export const EVIDENCE_BUNDLES = [1, 2, 3].map((week) => ({
  label: `Week ${week} evidence bundle`,
  href: `${ORG}/Orizon-Agents-FE-Stellar/tree/main/Week-${week}-Tranche-Submission`,
}));

export const GUIDE_PATH = LIST_YOUR_AGENT_PATH;
export const ECOSYSTEM_PATH = "/app/ecosystem";
export const OPERATOR_PATH = "/app/operator";

export const UNPUBLISHED_NOTICE =
  "The demo video has not been recorded yet. It will show only real testnet transactions. Until then, here is how to verify each deliverable yourself.";
