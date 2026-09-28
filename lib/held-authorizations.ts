/**
 * The escrow v2 authorizations this browser session signed, by the task they
 * paid for — so a receipt whose settlement failed can offer the buyer the
 * reclaim that needs the authorization id.
 *
 * The backend deliberately leaves `auth_id_hex` out of the receipt it serves,
 * so the session that signed the authorization is the only place a reclaim
 * can be started from without the buyer digging the id out of an explorer.
 * Stored on `lib/task-tokens.ts`'s terms: sessionStorage (dies with the tab,
 * never crosses tabs), every access guarded, corrupt data read as "none",
 * capped FIFO.
 */

export type HeldAuthorization = {
  /** The 16-byte authorization id, as 32 hex characters. */
  authIdHex: string;
  /** The wallet that signed it — the only one `reclaim` accepts. */
  payer: string;
  /** Epoch seconds after which reclaim is allowed; null when not reported. */
  expiresAt: number | null;
};

const KEY = "orizon.held-authorizations";
export const MAX_HELD_AUTHORIZATIONS = 50;

type Entry = [taskId: string, held: HeldAuthorization];

function isHeld(v: unknown): v is HeldAuthorization {
  if (typeof v !== "object" || v === null) return false;
  const h = v as Record<string, unknown>;
  return (
    typeof h.authIdHex === "string" &&
    /^[0-9a-f]{32}$/.test(h.authIdHex) &&
    typeof h.payer === "string" &&
    (h.expiresAt === null ||
      (typeof h.expiresAt === "number" && Number.isFinite(h.expiresAt)))
  );
}

function readEntries(): Entry[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry =>
        Array.isArray(e) && typeof e[0] === "string" && isHeld(e[1]),
    );
  } catch {
    return [];
  }
}

/** Remember the authorization a task was started with. Best-effort. */
export function rememberHeldAuthorization(
  taskId: string,
  held: HeldAuthorization,
): void {
  if (!taskId || !isHeld(held)) return;
  try {
    if (typeof window === "undefined") return;
    const entries = readEntries().filter(([id]) => id !== taskId);
    entries.push([taskId, held]);
    while (entries.length > MAX_HELD_AUTHORIZATIONS) entries.shift();
    window.sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable or full — the receipt then offers no reclaim */
  }
}

/** The authorization this session signed for a task, or null. */
export function getHeldAuthorization(taskId: string): HeldAuthorization | null {
  for (const [id, held] of readEntries()) {
    if (id === taskId) return held;
  }
  return null;
}
