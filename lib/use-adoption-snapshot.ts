"use client";
/**
 * The last adoption read this browser saw, kept so the Ecosystem page can
 * open on it while a fresh one is out.
 *
 * The backend takes minutes over the adoption read (QA defect D-091). The
 * console's cache usually has a copy, but after a deploy or in a new region
 * it may not, and a returning visitor then stared at a skeleton for minutes.
 * With this they see the last figures at once, dated by the snapshot's own
 * `generated_at`, and labelled as a snapshot until the live read lands.
 *
 * What is stored is exactly what was shown, and it is checked with the same
 * guard as a live read before it is shown again — a payload this build can
 * no longer read, or a hand-edited one, is dropped, never rendered. Storage
 * that is full, disabled or missing (private mode) costs the feature, never
 * the page.
 */

import { useEffect, useState } from "react";
import { isEcosystemAdoption, type EcosystemAdoption } from "./ecosystem";

export const ADOPTION_SNAPSHOT_KEY = "orizon:adoption-snapshot:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored snapshot, if there is one this build can read. */
export function readAdoptionSnapshot(
  store: StorageLike | null = storage(),
): EcosystemAdoption | null {
  try {
    const raw = store?.getItem(ADOPTION_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isEcosystemAdoption(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Keeps `adoption` as the snapshot. Never throws. */
export function saveAdoptionSnapshot(
  adoption: EcosystemAdoption,
  store: StorageLike | null = storage(),
): void {
  try {
    store?.setItem(ADOPTION_SNAPSHOT_KEY, JSON.stringify(adoption));
  } catch {
    /* full or disabled storage: the next visit simply waits */
  }
}

/**
 * The stored snapshot (read after mount, so the server render and the first
 * client render agree), replaced in storage whenever `latest` lands.
 */
export function useAdoptionSnapshot(
  latest: EcosystemAdoption | null,
): EcosystemAdoption | null {
  const [snapshot, setSnapshot] = useState<EcosystemAdoption | null>(null);
  useEffect(() => {
    setSnapshot(readAdoptionSnapshot());
  }, []);
  useEffect(() => {
    if (latest) saveAdoptionSnapshot(latest);
  }, [latest]);
  return snapshot;
}
