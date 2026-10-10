/**
 * POST /api/agents/{id}/bind — binds an endpoint.
 * Asked of BotID first, and forwarded to the backend unchanged only when it
 * lets the request through (lib/botid-proxy.ts); listed for the browser's
 * half in lib/botid-routes.ts.
 */
import { botGuardedProxy, passThrough } from "@/lib/botid-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Above UPSTREAM_TIMEOUT_MS (110 s), so a slow backend gets a 504 rather than
// a killed function.
export const maxDuration = 120;

export const POST = botGuardedProxy();

// The same path revokes a binding. Not guarded (it is not a spend, and the
// console never calls it), but served here: without it this handler would
// answer 405 where the backend answers.
export const DELETE = passThrough;
