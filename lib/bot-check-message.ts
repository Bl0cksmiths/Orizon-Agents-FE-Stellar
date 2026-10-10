/**
 * The two answers the BotID guard in front of the paid `/api` routes gives
 * (lib/botid-guard.ts), and the sentence the console shows for each. Both are
 * refusals made BEFORE the backend saw the request, and the copy says that
 * much and no more: it does not claim "nothing was charged", because a run
 * refused at execute may follow an escrow authorization that already
 * confirmed, which the plan card's own notice accounts for.
 *
 * Shared by the server, which puts the code and message in the error
 * envelope, and the browser, which maps the code back to the sentence
 * wherever an API failure is printed.
 */

/** 403: the request was judged automated. */
export const BOT_DETECTED_CODE = "bot_detected";
/** 503: the check itself could not run, so the request was not forwarded. */
export const BOT_CHECK_UNAVAILABLE_CODE = "bot_check_unavailable";

export const BOT_DETECTED_MESSAGE =
  "This browser could not be verified, so the request was stopped before it reached Orizon. Reload the page and try again.";
export const BOT_CHECK_UNAVAILABLE_MESSAGE =
  "The browser check is unavailable right now, so the request was stopped before it reached Orizon. Try again in a moment.";

/**
 * The console's sentence for a refusal by the BotID guard, or undefined for
 * any other failure, so a caller falls through to its own handling. Read by
 * shape (`code`), as lib/plan-errors.ts reads its codes, so it holds for any
 * rejection carrying the envelope's code. Pure and total: never throws.
 */
export function botCheckMessage(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  if (err.code === BOT_DETECTED_CODE) return BOT_DETECTED_MESSAGE;
  if (err.code === BOT_CHECK_UNAVAILABLE_CODE) {
    return BOT_CHECK_UNAVAILABLE_MESSAGE;
  }
  return undefined;
}
