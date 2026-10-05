/**
 * GET /api/stellar/reputation — the on-chain reputation batch.
 * Served from the shared cache in front of the backend (lib/api-proxy.ts);
 * every other method and path still goes through the rewrite in
 * next.config.mjs.
 */
import { cachedRouteHandler } from "@/lib/api-proxy";
import { REPUTATION, backendRead } from "@/lib/api-proxy-routes";

// Read per request: the cache lives in this module, not in a build output.
export const dynamic = "force-dynamic";
// Room for a cold backend (about a minute) to answer after the response that
// started the read has gone out, so the next visitor finds the copy.
export const maxDuration = 60;

export const GET = cachedRouteHandler(backendRead(REPUTATION));
