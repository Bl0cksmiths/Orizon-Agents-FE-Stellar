/**
 * "What changed in v0.5": the §6 updates the /litepaper page lists.
 *
 * Written from the v0.5 text of litepaper/sections/06-operations-governance.md
 * and the commits that changed it, not from memory; reconcile it with §6
 * whenever §6 changes. `version` must equal the version on the litepaper's
 * cover, or the build fails (lib/litepaper/load.ts): a new version of the
 * book needs its own list, not this one.
 */

export type LitepaperChange = {
  /** The subsection(s) or chapter(s) the change is in, e.g. "§6.3". */
  where: string;
  title: string;
  /** "new" for a new subsection or behaviour, "corrected" for a v0.4 claim put right. */
  kind: "new" | "corrected";
  text: string;
};

export const CHANGES_VERSION = "0.5";

export const LITEPAPER_CHANGES: readonly LitepaperChange[] = [
  {
    where: "§6.2, §6.3",
    title: "Open registration",
    kind: "new",
    text: "Registration is permissionless and live. Any wallet registers an agent on chain with only its own signature, and no Blocksmiths approval is needed. The owner then binds an HTTPS endpoint off chain by signing a challenge with the same wallet. The twelve genesis agents are now a seed set inside the open registry, not the registry itself.",
  },
  {
    where: "§6.7",
    title: "Reputation-gated routing and the cold start",
    kind: "new",
    text: "The house orchestrator reads each candidate's reputation from chain, smooths it with a prior, and routes on a conservative lower bound against a floor of 5,500 basis points. An agent with no ratings scores the 7,000 prior, whose lower bound is 5,677, just above the floor, so a new operator is routable on its first request, and a few poor ratings take it below.",
  },
  {
    where: "§6.8",
    title: "The dispute window and platform-funded credit",
    kind: "new",
    text: "The payer has 24 hours after a paid workflow settles to dispute a step. A Blocksmiths operator decides, and an upheld dispute is credited by a transfer from the platform's own key; nothing is taken back from the agent. The refund path ships switched off; on testnet it was switched on on 2026-09-30, when escrow v2 went live and the first window opened.",
  },
  {
    where: "§6.1, §6.6",
    title: "Settler rotation, corrected",
    kind: "corrected",
    text: "v0.4 said the admin could rotate the settler key. The first escrow fixed its settler when it was created and had no way to change it. Escrow v2, deployed on testnet on 2026-09-30, adds an admin-only setter.",
  },
  {
    where: "§6.2, §6.3",
    title: "Orchestrator routing, corrected",
    kind: "corrected",
    text: "v0.4 said the house orchestrator planned from a curated subset of the registry, on seeded reputation. Routing never reads the seeded scores: every agent is ranked on its on-chain evidence, and only an agent the backend can reach, a seeded worker or one with a bound endpoint, is a candidate.",
  },
  {
    where: "§6.3, §6.7",
    title: "Reputation floor, corrected",
    kind: "corrected",
    text: "v0.4 promised a floor of 35,000 basis points, which no score can reach: the ledger's scale ends at 10,000. The floor that shipped is 5,500 on that scale.",
  },
  {
    where: "§6.4–§6.6, §2, §4, §5, §7, §9, §10, §A–§E",
    title: "Other claims, corrected",
    kind: "corrected",
    text: "v0.4 said a buyer could submit a rating directly, described a published blocklist, estimated the contracts at about 7,000 lines of Rust and listed the backend's keys wrongly. Only the platform's scorer key writes ratings, and a buyer's recourse is a dispute; the blocklist is roadmap and was never built; the contracts are 1,567 lines as deployed; and the host holds a signing key and a separate dispatch key, neither of them the admin. The glossary, the disclaimer, §2, §4, §5, §7, §9 and appendices A to E now say the same, and they no longer say that a charge settles on testnet, that a workflow pays a charge per step, rate on a 0–5 scale or start a new agent at zero. Network fees and contract sizes are now the ones measured on testnet, and the USD/XLM rate is a dated assumption.",
  },
  {
    where: "§6.9",
    title: "Standing disclosures",
    kind: "new",
    text: "§6 now ends with what holds throughout: testnet only, escrow v2 settling where v1 could not, one settler key that the admin can now rotate, credits funded and decided by the platform, and endpoint binding kept off chain.",
  },
  {
    where: "§6.1, §6.8, §6.9, §2, §5, §7, §10, §A–§E",
    title: "Escrow v2 deployed and settling",
    kind: "new",
    text: "Escrow v2 was deployed on testnet on 2026-09-30, from the admin key, with the platform's signing key as its settler, and the backend now settles through it. Its first three workflows settled that day, disclosed team runs that were each sealed and rated, and refunds were switched on. The first escrow, v1, still exists but is no longer used; it could never settle. §7.4 now prices every call from those runs' transactions, with each row's mean, range and sample count: about 0.30 XLM a workflow, or 0.91 XLM as sampled, which includes one-off restores of archived ledger entries.",
  },
];
