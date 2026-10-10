/**
 * An error answered by the console's own `/api` route handlers, in the
 * backend's envelope, so lib/api.ts reads it exactly as it reads one from the
 * backend: `error.code` for callers that branch, `error.message` for the
 * sentence, the legacy `detail` beside them. `request_id` is Vercel's id for
 * the request (`x-vercel-id`), the one support can look up, when there is one.
 */

const JSON_TYPE = "application/json";

export function apiErrorResponse(
  status: number,
  code: string,
  message: string,
  opts: { request?: Request; headers?: Record<string, string> } = {},
): Response {
  const requestId = opts.request?.headers.get("x-vercel-id") ?? null;
  const body = {
    detail: message,
    error: {
      code,
      message,
      ...(requestId ? { request_id: requestId } : {}),
    },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": JSON_TYPE,
      "cache-control": "no-store",
      ...opts.headers,
    },
  });
}
