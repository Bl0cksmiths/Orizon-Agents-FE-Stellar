/**
 * The `/api` calls BotID guards: every browser request that makes the backend
 * spend money, sign on-chain, or run the AI planner. Read by both halves of
 * the check, so they cannot drift apart:
 *
 *   - the browser (`<BotIdClient>` in app/layout.tsx) attaches its challenge
 *     answer to a request only when it matches an entry here;
 *   - the route handlers under app/api/ (lib/botid-guard.ts) refuse a request
 *     that arrives without one.
 *
 * A guarded handler whose path is missing here would refuse every visitor,
 * so app/api/botid-routes.test.ts checks each handler's path against this
 * list. `*` matches one or more path segments (BotID's own pattern rule).
 *
 * Not guarded, on purpose: reads, the trace stream, and the server-to-server
 * routes the backend already authenticates by key.
 */

export type ProtectedRoute = {
  readonly path: string;
  readonly method: "POST";
};

export const BOTID_PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  // The AI planner and the run it starts.
  { path: "/api/orchestrator/decompose", method: "POST" },
  { path: "/api/orchestrator/execute", method: "POST" },
  // Transactions the backend builds for a wallet to sign, and their submit.
  { path: "/api/stellar/build/authorize", method: "POST" },
  { path: "/api/stellar/build/reclaim", method: "POST" },
  { path: "/api/stellar/build/register-agent", method: "POST" },
  { path: "/api/stellar/build/update-price", method: "POST" },
  { path: "/api/stellar/build/set-active", method: "POST" },
  { path: "/api/stellar/submit", method: "POST" },
  // Opening a dispute on a settled step.
  { path: "/api/disputes/challenge", method: "POST" },
  { path: "/api/disputes", method: "POST" },
  // Binding an agent's endpoint.
  { path: "/api/agents/*/bind/challenge", method: "POST" },
  { path: "/api/agents/*/bind", method: "POST" },
];

/** BotID's pattern rule: `*` spans any run of characters, anchored. */
function patternOf(path: string): RegExp {
  const escaped = path
    .replace(/[.?+^$[\]\\(){}|-]/g, "\\$&")
    .split("*")
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

/** Whether BotID's browser half protects this request. */
export function isBotIdProtected(pathname: string, method: string): boolean {
  return BOTID_PROTECTED_ROUTES.some(
    (route) =>
      route.method === method.toUpperCase() &&
      patternOf(route.path).test(pathname),
  );
}

/**
 * Whether BotID runs at all: on a Vercel deployment only (`VERCEL` is "1"
 * there, at build and at run time). Anywhere else — `next dev`, the
 * Playwright and Lighthouse servers, a local `next start` — there is no
 * challenge to fetch and no verdict to ask for, so neither half runs: the
 * browser loads no script and the handlers forward without a check.
 */
export function botIdActive(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL === "1";
}
