/**
 * What the evidence page says, as plain functions and constants: status
 * words and icons, how a date or a hash is written, where a link goes and
 * what its accessible name adds. Nothing here reads the index.
 */

import { SITE_URL } from "@/lib/guide/display";
import type { DeliverableId, ItemStatus, MetricStatus } from "./types";

export const EVIDENCE_PATH = "/evidence";

/**
 * A status is always a word beside an icon, never a colour alone (WCAG
 * 1.4.1), and the word is what prints.
 */
export const ITEM_STATUS: Record<ItemStatus, { label: string; icon: string }> =
  {
    present: { label: "Present", icon: "✓" },
    partial: { label: "Partial", icon: "◐" },
    missing: { label: "Missing", icon: "✕" },
  };

export const METRIC_STATUS: Record<
  MetricStatus,
  { label: string; icon: string }
> = {
  met: { label: "Met", icon: "✓" },
  not_met: { label: "Not met", icon: "✕" },
  // Out of the sprint's requirements: neither a pass nor a fail, so neither
  // the tick nor the cross.
  descoped: { label: "Descoped", icon: "⊘" },
};

/** "2026-09-29" → "September 29, 2026", the same on every server. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** A 64-character hash, shortened to its ends: "9b8ffaa4…8f919a68". */
export function truncateHash(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

/** The section heading: "Deliverable 1: Permissionless Agent Registration". */
export function deliverableHeading(id: DeliverableId, name: string): string {
  return id === "RD" ? name : `Deliverable ${id.slice(1)}: ${name}`;
}

/** The in-page anchor for a deliverable's section. */
export function deliverableAnchor(id: DeliverableId): string {
  return `deliverable-${id.toLowerCase()}`;
}

const SITE_HOSTS = new Set([
  new URL(SITE_URL).hostname,
  `www.${new URL(SITE_URL).hostname}`,
]);

const KNOWN_SITES: Record<string, string> = {
  "stellar.expert": "Stellar Expert",
  "github.com": "GitHub",
  "www.youtube.com": "YouTube",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
};

export type Destination =
  { external: false } | { external: true; site: string; hint: string };

/**
 * Where a link leaves the site to, and the words its accessible name gains:
 * "(opens Stellar Expert)". A page on orizons.xyz itself stays in the tab.
 */
export function destination(url: string): Destination {
  const host = new URL(url).hostname;
  if (SITE_HOSTS.has(host)) return { external: false };
  const site = KNOWN_SITES[host] ?? host.replace(/^www\./, "");
  return { external: true, site, hint: `(opens ${site})` };
}
