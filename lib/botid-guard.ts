/**
 * BotID's server half: asks Vercel whether the request in hand came from a
 * person, before a guarded route forwards it to the backend (lib/botid-proxy.ts).
 * Server-only.
 *
 *   - Judged a bot: 403 `bot_detected`, and the backend never hears of it.
 *   - The check could not run (Vercel's verdict unreachable, the project's
 *     OIDC token missing): the request is forwarded unchecked and the failure
 *     logged, unless `BOTID_ON_CHECK_ERROR=closed` (lib/botid-routes.ts
 *     `botIdFailsClosed`), which answers 503 `bot_check_unavailable` instead.
 *   - Off Vercel (lib/botid-routes.ts `botIdActive`): no check, as there is no
 *     challenge for the browser to have answered.
 *
 * The check level is the project's (Vercel dashboard → Firewall → Rules →
 * BotID Deep Analysis): no per-route `checkLevel` is set here or in the
 * browser, so the two halves cannot disagree about it.
 */

import { checkBotId } from "botid/server";
import { apiErrorResponse } from "./api-error-response";
import {
  BOT_CHECK_UNAVAILABLE_CODE,
  BOT_CHECK_UNAVAILABLE_MESSAGE,
  BOT_DETECTED_CODE,
  BOT_DETECTED_MESSAGE,
} from "./bot-check-message";
import { botIdActive, botIdFailsClosed } from "./botid-routes";

/** Seconds a browser is asked to wait after the check could not run. */
const UNAVAILABLE_RETRY_AFTER_S = 5;

export type BotVerdict = { isBot: boolean };

export type BotGuardDeps = {
  /** Whether BotID runs here; `botIdActive()` by default. */
  active: boolean;
  /** The verdict for the current request; BotID's `checkBotId` by default. */
  check: () => Promise<BotVerdict>;
  /** Whether a failed check refuses the request; `botIdFailsClosed()` by default. */
  failClosed: boolean;
};

/**
 * The refusal for a request BotID does not let through, or null to go on.
 * `request` only names the request in the refusal (`request_id`).
 */
export async function refuseBots(
  request: Request,
  deps: Partial<BotGuardDeps> = {},
): Promise<Response | null> {
  if (!(deps.active ?? botIdActive())) return null;
  const check = deps.check ?? (() => checkBotId());
  let verdict: BotVerdict;
  try {
    verdict = await check();
  } catch (err) {
    // The message only: BotID's errors name what is misconfigured and carry
    // no token, and nothing about the request is logged.
    const reason = err instanceof Error ? err.message : String(err);
    if (!(deps.failClosed ?? botIdFailsClosed())) {
      console.warn(`[botid] check failed, forwarding unchecked: ${reason}`);
      return null;
    }
    console.error(`[botid] check failed: ${reason}`);
    return apiErrorResponse(
      503,
      BOT_CHECK_UNAVAILABLE_CODE,
      BOT_CHECK_UNAVAILABLE_MESSAGE,
      {
        request,
        headers: { "retry-after": String(UNAVAILABLE_RETRY_AFTER_S) },
      },
    );
  }
  return verdict.isBot
    ? apiErrorResponse(403, BOT_DETECTED_CODE, BOT_DETECTED_MESSAGE, {
        request,
      })
    : null;
}
