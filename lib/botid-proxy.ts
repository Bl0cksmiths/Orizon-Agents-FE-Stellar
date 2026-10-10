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

/** Forwards the request to the backend and answers with its response. */
export async function forwardToBackend(
  request: Request,
  deps: Partial<ForwardDeps> = {},
): Promise<Response> {
  const doFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const base = deps.base ?? resolveApiBase(process.env);
  const upstream = await doFetch(backendUrl(request, base), {
    method: request.method,
    // Every answer here is one visitor's, and a mutation besides.
    cache: "no-store",
    redirect: "manual",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  });
}
