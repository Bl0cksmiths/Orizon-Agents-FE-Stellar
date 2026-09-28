/**
 * The link behind a piece of on-chain evidence the backend handed us.
 *
 * The ecosystem and readiness payloads both carry an `explorer` URL next to
 * the id it points at. That URL is data from the network, and an `href` built
 * from it unchecked is a `javascript:` link waiting to happen, so it is used
 * only when it parses as https. Otherwise the link is rebuilt from the id
 * itself, which is the part a reviewer actually verifies.
 */

import {
  stellarExpertUrl,
  type StellarExpertKind,
} from "@/components/ui/stellar-link";

/** `raw` when it is an https URL, else null. */
export function httpsUrlOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * The backend's explorer URL when it is safe to link, else a stellar.expert
 * URL built from `id`, else null when there is neither.
 */
export function explorerHref(
  explorer: string | null | undefined,
  kind: StellarExpertKind,
  id: string | null | undefined,
  network?: string,
): string | null {
  return (
    httpsUrlOrNull(explorer) ??
    (id ? stellarExpertUrl(kind, id, network) : null)
  );
}
