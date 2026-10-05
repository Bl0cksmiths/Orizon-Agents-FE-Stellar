/**
 * Every `/api/*` request on its way to the backend — the rewrite in
 * next.config.mjs and the cached route handlers under app/api/ alike — passes
 * here first, so the visitor's own claims about proxy identity are removed
 * and the frontend's are added (lib/proxy-identity.ts):
 *
 *   - `X-Frontend-Proxy-Token` / `X-Orizon-Client-Ip` sent by the browser are
 *     stripped, always: nobody can name an address or present a token;
 *   - with FRONTEND_PROXY_TOKEN configured, the forwarded request carries the
 *     token and the visitor's address, so the backend's per-client limits
 *     see each visitor rather than Vercel's shared egress.
 *
 * The headers are set on the REQUEST (`NextResponse.next({ request })`), which
 * the rewrite then proxies on; nothing is added to the response, so the token
 * never reaches a browser. The cached handlers ignore incoming headers and
 * present the token alone (lib/api-proxy-routes.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  clientIp,
  forwardedRequestHeaders,
  proxyToken,
} from "@/lib/proxy-identity";

export function middleware(request: NextRequest): NextResponse {
  const headers = forwardedRequestHeaders(request.headers, {
    // Read by name: the edge bundle resolves `process.env.X` at runtime.
    token: proxyToken({
      FRONTEND_PROXY_TOKEN: process.env.FRONTEND_PROXY_TOKEN,
    }),
    clientIp: clientIp(request),
  });
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
