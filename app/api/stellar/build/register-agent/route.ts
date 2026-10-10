/**
 * POST /api/stellar/build/register-agent — an agent registration.
 * Asked of BotID first, and forwarded to the backend unchanged only when it
 * lets the request through (lib/botid-proxy.ts); listed for the browser's
 * half in lib/botid-routes.ts.
 */
import { botGuardedProxy } from "@/lib/botid-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Above UPSTREAM_TIMEOUT_MS (110 s), so a slow backend gets a 504 rather than
// a killed function.
export const maxDuration = 120;

export const POST = botGuardedProxy();
