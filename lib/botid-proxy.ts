/**
 * The BotID-guarded `/api` routes' way to the backend. Server-only.
 *
 * A route handler under app/api/ wins over the fallback rewrite in
 * next.config.mjs that proxies every other `/api` path, so a guarded route
 * has to do the rewrite's job itself once BotID lets the request through:
 * the same backend origin (lib/api-base.mjs), the same path and query, the
 * method, the body's exact bytes, the request headers middleware.ts left
 * (the proxy token and the visitor's address among them), and the backend's
 * status, headers and body back, streamed.
 */

import { resolveApiBase } from "./api-base.mjs";
import { PROXY_TOKEN_HEADER } from "./proxy-identity";

/** Hop-by-hop headers (RFC 9110 §7.6.1): they describe one connection, so a
 * proxy never passes them on, in either direction. */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/** Request headers that are not the backend's business, or that fetch sets
 * for itself. */
const REQUEST_DROP = [
  ...HOP_BY_HOP,
  // fetch sets these for the connection it opens.
  "host",
  "content-length",
  "expect",
  // fetch negotiates its own encoding and decodes the answer itself.
  "accept-encoding",
  // BotID's challenge answer: read here, meaningless to the backend.
  "x-is-human",
  "x-path",
  "x-method",
  // Vercel's credential for this deployment (BotID's verdict uses it). It
  // must never leave for another origin.
  "x-vercel-oidc-token",
  "x-matched-path",
];

/** Prefixes of Next's own request plumbing (middleware overrides, the
 * router's invoke headers). */
const REQUEST_DROP_PREFIXES = ["x-middleware-", "x-invoke-"];

/** Response headers not passed back to the browser. */
const RESPONSE_DROP = [
  ...HOP_BY_HOP,
  // fetch has already decoded the body, so its old encoding and length no
  // longer describe it; the platform sets both again for what it sends.
  "content-encoding",
  "content-length",
  // The frontend's shared secret never reaches a browser, whatever the
  // backend sends.
  PROXY_TOKEN_HEADER.toLowerCase(),
];

/** The names a `Connection` header lists, which are hop-by-hop as well. */
function connectionListed(headers: Headers): string[] {
  return (headers.get("connection") ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

/** `headers` minus the dropped names and anything under a dropped prefix. */
function without(
  headers: Headers,
  drop: readonly string[],
  prefixes: readonly string[] = [],
): Headers {
  const gone = new Set([...drop, ...connectionListed(headers)]);
  const out = new Headers();
  headers.forEach((value, name) => {
    if (gone.has(name) || prefixes.some((p) => name.startsWith(p))) return;
    out.append(name, value);
  });
  return out;
}

/**
 * The headers the backend receives: the request's own as middleware.ts left
 * them — proxy token and visitor address included — minus the hop-by-hop and
 * platform-internal ones.
 */
export function forwardedHeaders(incoming: Headers): Headers {
  return without(incoming, REQUEST_DROP, REQUEST_DROP_PREFIXES);
}

/** The backend's response headers the browser receives. */
export function returnedHeaders(upstream: Headers): Headers {
  const out = without(upstream, RESPONSE_DROP);
  // `Headers.forEach` folds repeated Set-Cookie headers into one line;
  // `getSetCookie` keeps them apart.
  const cookies = upstream.getSetCookie();
  if (cookies.length > 0) {
    out.delete("set-cookie");
    for (const cookie of cookies) out.append("set-cookie", cookie);
  }
  return out;
}

export type ForwardDeps = {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** The backend origin, normalized: no trailing slash, no `/api`. */
  base: string;
};

/** The backend URL for a request: its path and query on the backend origin. */
export function backendUrl(request: Request, base: string): string {
  const { pathname, search } = new URL(request.url);
  return `${base}${pathname}${search}`;
}

/**
 * The request body as the browser sent it, byte for byte (never parsed and
 * re-serialized), or undefined for a method that carries none. Read whole:
 * the guarded routes take small JSON bodies, and a buffered body goes out
 * with an exact Content-Length instead of a chunked stream.
 */
async function bodyOf(request: Request): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const bytes = await request.arrayBuffer();
  return bytes.byteLength > 0 ? bytes : undefined;
}

/** Forwards the request to the backend and answers with its response. */
export async function forwardToBackend(
  request: Request,
  deps: Partial<ForwardDeps> = {},
): Promise<Response> {
  const doFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const base = deps.base ?? resolveApiBase(process.env);
  const upstream = await doFetch(backendUrl(request, base), {
    method: request.method,
    headers: forwardedHeaders(request.headers),
    body: await bodyOf(request),
    // Every answer here is one visitor's, and a mutation besides.
    cache: "no-store",
    redirect: "manual",
  });
  // The body is streamed back as it arrives, not buffered.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: returnedHeaders(upstream.headers),
  });
}
