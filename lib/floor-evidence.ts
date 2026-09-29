/**
 * What the evidence behind a below-floor reputation bound lets us say — and
 * nothing more.
 *
 * The plan card's exclusions panel and the marketplace's standing mark both
 * explain why an agent sits under the routing floor. Both used to say it was
 * "thin evidence rather than bad work", which is false for an agent whose
 * bound rests on many real low ratings: a reference agent whose dispatches
 * timed out and were rated 20/100 on-chain is under the floor because of how
 * that work was rated, and telling a buyer otherwise is the one claim this
 * copy exists to avoid. So the sentence is now built from the numbers the
 * backend sends beside the bound — how many ratings it rests on, and what
 * share of them were disputes — and says only what those numbers support.
 * It never says "bad work", and never "not bad work" either.
 *
 * The four cases, and why each is worded as it is:
 *
 *   - Count unknown (absent from an older backend, null with no entry, or not
 *     a count at all): no sentence. Nothing about cause can be said.
 *   - 0 ratings: the bound IS the Bayesian prior — the starting estimate
 *     every unrated agent is credited with — so the floor sits above that.
 *     (Under the shipped config the prior clears the floor, so this only
 *     appears on a deployment that raised the floor past it; the sentence
 *     is true either way.)
 *   - Up to THIN_EVIDENCE_MAX_COUNT ratings: the evidence is thin.
 *   - More: the bound rests on that record, read conservatively. Deliberately
 *     NOT "its rated work averages below the floor": the bound blends the
 *     prior in and subtracts an uncertainty margin, so an agent whose ratings
 *     average 58/100 can sit under a 55/100 floor (floor-evidence.test.ts
 *     proves it with the client mirror of the backend math). "Falls short of
 *     the floor, read conservatively" is what the bound actually says.
 *
 * A non-zero dispute rate is then stated as a share, in the reputation chip's
 * own format (one decimal), because it is the one number that separates an
 * agent sunk by disputes from one that was merely rated low.
 */

/**
 * The most ratings a bound can rest on and still be called thin evidence.
 *
 * Derived from how the backend's prior works (reputation_svc.py, config.py on
 * the backend's feat/5.02-integration):
 *
 *   - The prior counts as REPUTATION_PRIOR_WEIGHT_USDC = 12 units of evidence
 *     mass, and the bound's sample size is prior mass plus rating weight.
 *   - One rating's weight is capped at REPUTATION_MAX_RATING_TO_PRIOR_RATIO
 *     (1.0) × that prior mass, and decay only ever shrinks it after that.
 *
 * So with ONE rating the evidence can at most equal the prior: the starting
 * estimate still carries at least half the bound, whatever the step was
 * priced at. That is the largest count at which "thin" is guaranteed. At two
 * or more, whether the ratings outweigh the prior depends on step prices and
 * decay, which the notice does not carry, so the copy stops calling it thin
 * and describes the record instead.
 *
 * If the backend ever RAISES the ratio above 1.0, a single rating could
 * outweigh the prior and this must drop to 0. Lowering it only makes one
 * rating thinner, so the claim stays true.
 */
export const THIN_EVIDENCE_MAX_COUNT = 1;

/** A count this module can reason about: a whole, non-negative number. */
function knownCount(count: number | null | undefined): number | null {
  return typeof count === "number" && Number.isInteger(count) && count >= 0
    ? count
    : null;
}

/** "14.3%" — the reputation chip's format, so one rate reads the same twice. */
function disputeShare(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * The sentence(s) the evidence supports about a bound under the floor, or
 * null when the count is unknown and nothing about cause can be said.
 *
 * Written to follow a sentence that has already said the bound is below the
 * floor, so every case opens "That bound…".
 */
export function belowFloorEvidence({
  count,
  disputeRateBps,
}: {
  count: number | null | undefined;
  disputeRateBps: number | null | undefined;
}): string | null {
  const n = knownCount(count);
  if (n === null) return null;

  if (n === 0) {
    return "That bound rests on no ratings: it is the starting estimate an unrated agent is credited with, and the floor sits above it.";
  }

  const record =
    n <= THIN_EVIDENCE_MAX_COUNT
      ? `That bound rests on ${n === 1 ? "a single rating" : `only ${n} ratings`}, so the evidence behind it is thin.`
      : `That bound rests on ${n} ratings, and that record, read conservatively, falls short of the floor.`;

  const disputed =
    typeof disputeRateBps === "number" &&
    Number.isFinite(disputeRateBps) &&
    disputeRateBps > 0
      ? n === 1
        ? " That rating was a dispute."
        : ` ${disputeShare(disputeRateBps)} of those ratings were disputes.`
      : "";

  return record + disputed;
}
