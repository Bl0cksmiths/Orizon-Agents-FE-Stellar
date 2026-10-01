/**
 * The home page's network figures, read on the server.
 *
 * The hero is static marketing: it renders on the server and is regenerated
 * at most every `PUBLIC_STATS_REVALIDATE_S` seconds (ISR), so the backend sees
 * one read per window, not one per visitor, and the figures are never older
 * than that window. It reads the backend directly at the same origin the
 * `/api` rewrite targets (`resolveApiBase`), because a server render has no
 * page origin for a relative `/api` URL to resolve against.
 *
 * Same rules as the console (lib/network-stats.ts): the measured overview
 * when the backend serves it, otherwise the registry and the adoption read —
 * never the legacy overview's figures. A figure that cannot be read is null,
 * and the hero leaves it out; when none can be read it leaves out the whole
 * row. It never prints a stand-in.
 */

import { resolveApiBase } from "./api-base.mjs";
import { isEcosystemAdoption } from "./ecosystem";
import { isOverviewV2, screenAgentList } from "./guards";
import {
  deriveNetworkStats,
  statsFromOverview,
  type Measured,
  type NetworkStats,
  type Read,
} from "./network-stats";

/** How long a rendered hero, and each read behind it, may be served. */
export const PUBLIC_STATS_REVALIDATE_S = 300;
/** A read slower than this is left out of the render. The backend takes
 * 30–60s to wake on its free tier; a build or a first render must not wait
 * that long, and the next regeneration reads it again. */
export const PUBLIC_STATS_TIMEOUT_MS = 10_000;

export type PublicNetworkStats = {
  registered: number | null;
  external: number | null;
  operatorWallets: number | null;
};

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function readJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(PUBLIC_STATS_TIMEOUT_MS),
    // Next's data cache: one read per window, shared by every render.
    next: { revalidate: PUBLIC_STATS_REVALIDATE_S },
  } as RequestInit);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function read<T>(
  body: Promise<unknown>,
  parse: (v: unknown) => T | null,
): Promise<Read<T>> {
  try {
    const value = parse(await body);
    return value === null
      ? { ok: false, error: "malformed" }
      : { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

const value = (m: Measured<number>) => (m.ok ? m.value : null);

function pick(s: NetworkStats): PublicNetworkStats | null {
  const out = {
    registered: value(s.registered),
    external: value(s.external),
    operatorWallets: value(s.operatorWallets),
  };
  return Object.values(out).every((v) => v === null) ? null : out;
}

/**
 * The registered, external and operator-wallet counts, or null when none of
 * them could be read. Never throws: a dead backend at build time leaves the
 * hero without a stat row, and the build goes on.
 */
export async function getPublicNetworkStats(
  env: Env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<PublicNetworkStats | null> {
  let base: string;
  try {
    base = `${resolveApiBase(env)}/api`;
  } catch {
    return null;
  }

  try {
    const overview = await readJson(fetchImpl, `${base}/metrics/overview`);
    if (isOverviewV2(overview)) return pick(statsFromOverview(overview));
  } catch {
    // An older or unreachable overview: derive below, as the console does.
  }

  const [agents, adoption] = await Promise.all([
    read(readJson(fetchImpl, `${base}/agents`), screenAgentList),
    read(readJson(fetchImpl, `${base}/ecosystem/adoption`), (v) =>
      isEcosystemAdoption(v) ? v : null,
    ),
  ]);
  return pick(
    deriveNetworkStats({
      agents,
      adoption,
      reputation: { ok: false, error: "not read for the hero" },
    }),
  );
}
