/**
 * Who the backend is hearing from, when the frontend's server talks to it.
 *
 * The backend keys its rate limits on the real visitor. Every request the
 * browser makes to `/api/*` reaches Render from Vercel's shared egress — via
 * the rewrite in next.config.mjs or one of the cached route handlers — so
 * without this every visitor would share one per-client budget. The frontend
 * therefore vouches for itself with a shared secret, and names the visitor it
 * is acting for:
 *
 *   X-Frontend-Proxy-Token  the secret (server-only env FRONTEND_PROXY_TOKEN)
 *   X-Orizon-Client-Ip      the visitor's address, on forwarded requests only
 *
 * A cached read acts for nobody (one backend read serves every visitor), so
 * it sends the token alone. With the env var unset nothing is sent and the
 * backend treats the traffic as it always did.
 *
 * Both headers are stripped from whatever the browser sent before anything is
 * forwarded: a visitor must not be able to name an address, or present a
 * token, of their own. The token is never logged and never reaches the
 * browser — it lives only in server-side environment, never NEXT_PUBLIC_.
 *
 * Pure and runtime-neutral: the middleware (edge) and the route handlers
 * (node) both build on it.
 */

export const PROXY_TOKEN_HEADER = "X-Frontend-Proxy-Token";
export const CLIENT_IP_HEADER = "X-Orizon-Client-Ip";
/** The server-only environment variable holding the shared secret. */
export const PROXY_TOKEN_ENV = "FRONTEND_PROXY_TOKEN";

/** Longest value accepted as an address: an IPv6 address with a zone id
 * fits comfortably; anything longer is not one. */
const MAX_IP_LENGTH = 64;
/** The characters an IPv4 or IPv6 address (with a zone id) is made of. */
const IP_SHAPE = /^[0-9A-Fa-f.:%]+$/;

/** The configured secret, or null when it is unset or blank. */
export function proxyToken(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const token = env[PROXY_TOKEN_ENV]?.trim();
  return token ? token : null;
}

/** `value` when it looks like an address, else null. */
function asIp(value: string | null | undefined): string | null {
  const ip = value?.trim();
  return ip && ip.length <= MAX_IP_LENGTH && IP_SHAPE.test(ip) ? ip : null;
}

/**
 * The visitor's address: the platform's own reading (`request.ip` on Vercel)
 * first, else the first `x-forwarded-for` entry — the one Vercel's edge sets
 * to the connecting client. Null when neither is a plausible address.
 */
export function clientIp(request: {
  ip?: string | null;
  headers: Headers;
}): string | null {
  return (
    asIp(request.ip) ??
    asIp(request.headers.get("x-forwarded-for")?.split(",")[0])
  );
}

/**
 * The headers to forward a visitor's request with: the browser's own, minus
 * any proxy identity it claimed, plus ours when a token is configured.
 */
export function forwardedRequestHeaders(
  incoming: Headers,
  identity: { token: string | null; clientIp: string | null },
): Headers {
  const out = new Headers(incoming);
  out.delete(PROXY_TOKEN_HEADER);
  out.delete(CLIENT_IP_HEADER);
  if (identity.token) {
    out.set(PROXY_TOKEN_HEADER, identity.token);
    if (identity.clientIp) out.set(CLIENT_IP_HEADER, identity.clientIp);
  }
  return out;
}

/** The headers a cached read sends: the token alone, acting for nobody. */
export function cachedReadHeaders(
  token: string | null = proxyToken(),
): Record<string, string> {
  return token ? { [PROXY_TOKEN_HEADER]: token } : {};
}
