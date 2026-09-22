"use client";
/**
 * The receipt of one dispute, as a buyer reads it on the trace page: where it
 * stands, what happens next, what it pays and who pays it, and the two
 * on-chain transactions that prove it — the refund transfer and the dispute
 * rating.
 *
 * It is evidence as much as interface. A grant reviewer watching a screen
 * recording matches what is drawn here against Stellar Expert, so no line may
 * claim more than the record vouches for: a transaction that was merely
 * submitted is drawn as pending and never with a success look, because an
 * optimistic "refunded" the chain later contradicts is worse than no receipt.
 *
 * Presentational by contract, like the panel it sits in. Whether the amount
 * is final, whether each transaction is confirmed, and which reasons this
 * viewer may read all arrive decided in DisputeReceiptView; this file only
 * chooses how each decided state looks and reads.
 */

import { useId, useState, type ReactNode } from "react";

import { formatAge } from "@/components/ui/stale-badge";
import { StellarExpertLink } from "@/components/ui/stellar-link";
import { formatUsdc, receiptBadgeStatus } from "@/lib/disputes";
import type {
  CreditPolicy,
  DisputeArtifact,
  DisputeReceiptView,
  DisputeStatus,
  DisputeViewer,
} from "@/lib/types";
import { cn } from "@/lib/utils";

import { DisputeStatusBadge } from "./dispute-status-badge";
import { formatLocalTime } from "./window-state";

/**
 * Who the copy addresses. Only the payer is "you": a shared trace shows
 * anyone the same public receipt, and telling a stranger a credit went to
 * "your wallet" would be a false line on an evidence page. An anonymous viewer
 * may be the payer on another device, but "the payer" is true either way.
 */
type Voice = {
  /** Opens a sentence about the dispute: "Your dispute …" / "The dispute …". */
  owner: string;
  /** Where the credit goes. */
  wallet: string;
  /** Who is paid. */
  who: string;
};

const PAYER_VOICE: Voice = { owner: "Your", wallet: "your wallet", who: "you" };
const OTHER_VOICE: Voice = {
  owner: "The",
  wallet: "the payer's wallet",
  who: "the payer",
};

// Keyed by the policy's own literal type, as the panel's terms are, so a new
// funder cannot reach the buyer without someone writing down what it means.
// The funder rides on the credit line itself (story 4.06's product rule): a
// figure seen without it reads as money taken back from the agent.
const FUNDED_BY: Record<CreditPolicy["funded_by"], string> = {
  platform: "funded by the platform, not clawed back from the agent",
};

/**
 * What a screen reader hears when the status changes while the receipt is on
 * screen — in the status badge's own words ("refunded", not the backend's
 * "credited"), so the ear and the eye are told the same thing.
 */
const CHANGED: Record<DisputeStatus, string> = {
  open: "is under review",
  upheld: "was upheld",
  crediting: "is being refunded",
  credited: "was refunded",
  rejected: "was rejected",
};

/**
 * The announcement for the status in `view`. A dispute marked credited with no
 * confirmed refund is not announced as refunded: the ear gets the same
 * restraint as the sentence on screen.
 */
function changeSentence(
  view: DisputeReceiptView,
  agentName: string,
  voice: Voice,
): string {
  const change =
    view.status === "credited" && view.refund.state !== "confirmed"
      ? "was marked as paid, but its refund is not confirmed on Stellar yet"
      : CHANGED[view.status];
  return `${voice.owner} dispute against ${agentName} ${change}.`;
}

export function DisputeReceipt({
  view,
  agentName,
  viewer = "payer",
  nowMs,
  className,
}: {
  view: DisputeReceiptView;
  /** The disputed step's agent, as the step row names it. */
  agentName: string;
  /** Who is looking. Only the payer is addressed as "you". */
  viewer?: DisputeViewer;
  /**
   * "Now" for the relative ages, in epoch ms. The panel passes its own
   * server-corrected clock so a skewed laptop cannot print a dispute as
   * raised in the future; left out, the device clock stands in.
   */
  nowMs?: number;
  className?: string;
}) {
  const headingId = useId();
  const voice = viewer === "payer" ? PAYER_VOICE : OTHER_VOICE;
  const announcement = useStatusAnnouncement(
    view.status,
    changeSentence(view, agentName, voice),
  );
  const now = nowMs ?? Date.now();

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className={cn("space-y-4", className)}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4
            id={headingId}
            className="font-mono text-[10px] uppercase tracking-widest text-cyan"
          >
            Dispute receipt
            {/* Several steps can carry one; heard out of its row, the
                heading says which agent this one is about. */}
            <span className="sr-only">, {agentName}</span>
          </h4>
          {/* Not `view.status`: a credit recorded without a confirmed
              transfer must not wear the green "Refunded" badge. */}
          <DisputeStatusBadge status={receiptBadgeStatus(view)} />
        </div>
        <div className="flex flex-col gap-0.5 font-mono text-[11px] text-muted sm:flex-row sm:flex-wrap sm:gap-x-5">
          <Moment label="Raised" ms={view.openedAtMs} nowMs={now} />
          <Moment label="Updated" ms={view.lastChangedAtMs} nowMs={now} />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-text/90">
        {nextStep(view, agentName, voice)}
      </p>

      {view.status !== "rejected" && <CreditLine view={view} voice={voice} />}

      <Artifacts view={view} agentName={agentName} voice={voice} />

      {view.reason !== null && (
        <Quote label="Your reason" tone="border-violet/40">
          {view.reason}
        </Quote>
      )}
      {view.rejectionReason !== null && (
        <Quote label="Why it was rejected" tone="border-magenta/50">
          {view.rejectionReason}
        </Quote>
      )}

      {/* Mounted empty from the first render: a live region has to exist
          before its text changes, or the change is not announced. `status`
          already implies polite; it is stated as well because some screen
          reader and browser pairings only honour the attribute. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/**
 * The sentence to announce, set only when the status CHANGES while the
 * receipt is mounted: nothing on first render, and nothing on a poll that
 * brought the same status back, because the text is then left exactly as it
 * was and an unchanged live region says nothing.
 *
 * Tracked in state and adjusted during render (React's pattern for deriving
 * from a previous prop) rather than in an effect: the announcement lands in
 * the same commit as the new status it describes, never one frame behind.
 */
function useStatusAnnouncement(status: DisputeStatus, sentence: string) {
  const [seen, setSeen] = useState(status);
  const [announcement, setAnnouncement] = useState("");
  if (status !== seen) {
    setSeen(status);
    setAnnouncement(sentence);
  }
  return announcement;
}

/** One instant: local time with its zone for the record, and its age. */
function Moment({
  label,
  ms,
  nowMs,
}: {
  label: string;
  ms: number;
  nowMs: number;
}) {
  return (
    <p>
      {label}{" "}
      <time dateTime={new Date(ms).toISOString()} className="text-text/90">
        {formatLocalTime(ms)}
      </time>{" "}
      {/* Kept together: a "·" ending one line and the age opening the next
          reads, at 360px, as two separate facts. */}
      <span className="whitespace-nowrap">· {formatAge(nowMs - ms)}</span>
    </p>
  );
}

/**
 * What happens next, in one plain sentence per status. `credited` is the one
 * that says what it cost the agent, and says it only as far as the rating
 * transaction vouches for: a rating not yet confirmed is not yet a cost.
 */
function nextStep(
  view: DisputeReceiptView,
  agent: string,
  voice: Voice,
): string {
  switch (view.status) {
    case "open":
      return `The platform is reviewing this dispute; if it is upheld, the step's credit is paid to ${voice.wallet} and ${agent}'s reputation records the dispute.`;
    case "upheld":
      return `The platform upheld this dispute; the credit is being sent to ${voice.wallet}.`;
    case "crediting":
      return `The refund was submitted and is waiting for confirmation on Stellar; if it cannot be confirmed, the platform reconciles it by hand — ${voice.who} will not be paid twice, and will not be skipped.`;
    case "credited": {
      // The backend can mark a dispute credited with no transfer on record to
      // prove it — its own tooling treats that as unreconciled. The badge
      // still reports the status, but the sentence only says money arrived
      // once the refund is confirmed on Stellar.
      if (view.refund.state !== "confirmed") {
        return `The platform recorded this credit as paid, but the refund transfer is not confirmed on Stellar yet; the platform reconciles it by hand — ${voice.who} will not be paid twice, and will not be skipped.`;
      }
      // A promise is never restated as a payment: without the settled figure
      // the sentence says the credit arrived, not how much.
      const paid = view.amount.final
        ? formatUsdc(view.amount.usdc)
        : "the credit";
      return view.rating.state === "confirmed"
        ? `Done: ${voice.who} received ${paid}, and it cost ${agent} a dispute rating on its reputation.`
        : `Done: ${voice.who} received ${paid}; the dispute rating it costs ${agent} is not confirmed yet.`;
    }
    case "rejected":
      return `The platform did not uphold this dispute: no credit was issued, ${agent}'s reputation is unchanged${
        view.rejectionReason !== null ? ", and the reason is below" : ""
      }.`;
  }
}

/**
 * What the dispute pays, and who pays it, on one line. A figure that is not
 * final is only ever what WOULD be credited — "up to", never "credited" as a
 * fact — because the amount actually transferred is only known once the
 * refund has landed.
 */
function CreditLine({
  view,
  voice,
}: {
  view: DisputeReceiptView;
  voice: Voice;
}) {
  const figure = (
    <span className="font-mono text-sm text-text">
      {formatUsdc(view.amount.usdc)}
    </span>
  );
  let claim: ReactNode;
  if (view.amount.final) {
    claim = (
      <>
        {figure} credited to {voice.wallet}
      </>
    );
  } else {
    // "Credited" only once the refund is confirmed — an older backend can
    // confirm the transfer without reporting its settled figure, so the
    // promise stays the only number; short of that it is still on its way.
    const tail =
      view.status === "open"
        ? `would be credited to ${voice.wallet} if upheld`
        : view.refund.state === "confirmed"
          ? `credited to ${voice.wallet}`
          : `to be credited to ${voice.wallet}`;
    claim = (
      <>
        Up to {figure} {tail}
      </>
    );
  }
  return (
    <p className="text-xs leading-relaxed text-text/90">
      <span className="font-mono text-[10px] uppercase tracking-widest text-cyan">
        credit ·{" "}
      </span>
      {claim} <span className="text-muted">— {FUNDED_BY[view.fundedBy]}.</span>
    </p>
  );
}

type ArtifactCopy = {
  title: string;
  /** What the transaction means for the reader, beside its name. */
  caption: string;
  /** Visible link text, distinct per artifact so a link list is legible. */
  link: string;
};

/**
 * The refund transfer and the dispute rating, each with its hash and its
 * Stellar Expert link — the two things a reviewer matches against the chain.
 *
 * A `none` artifact is left out while the dispute is still moving: an absent
 * refund on an open dispute is not news. Once it is credited, an artifact the
 * record lacks gets one quiet line instead, because a finished receipt with a
 * row silently missing reads as complete when it is not.
 */
function Artifacts({
  view,
  agentName,
  voice,
}: {
  view: DisputeReceiptView;
  agentName: string;
  voice: Voice;
}) {
  const explainAbsence = view.status === "credited";
  const rows = [
    {
      key: "refund",
      artifact: view.refund,
      copy: {
        title: "Refund transfer",
        caption: `what ${voice.who} received`,
        link: "view refund on stellar.expert",
      },
    },
    {
      key: "rating",
      artifact: view.rating,
      copy: {
        title: `Dispute rating against ${agentName}`,
        caption: "what it cost the agent",
        link: "view rating on stellar.expert",
      },
    },
  ].filter(({ artifact }) => artifact.state !== "none" || explainAbsence);

  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h5 className="font-mono text-[10px] uppercase tracking-widest text-muted">
        On-chain record
      </h5>
      {/* A description list, not a <ul>: these are named transactions and
          their facts — the panel's own charge and seal rows are a <dl> too —
          and list items nested in a step's own <li> would read as more steps
          of the receipt. */}
      <dl className="space-y-2">
        {rows.map(({ key, artifact, copy }) => (
          <ArtifactRow key={key} artifact={artifact} copy={copy} />
        ))}
      </dl>
    </div>
  );
}

function ArtifactRow({
  artifact,
  copy,
}: {
  artifact: DisputeArtifact;
  copy: ArtifactCopy;
}) {
  if (artifact.state === "none") {
    return (
      <div className="text-xs leading-relaxed text-muted">
        <dt className="inline">{copy.title}</dt>{" "}
        <dd className="inline">— not recorded on-chain yet.</dd>
      </div>
    );
  }
  const confirmed = artifact.state === "confirmed";
  return (
    <div
      className={cn(
        "clip-cyber-sm border px-3 py-2.5",
        confirmed ? "border-cyan/30 bg-cyan/5" : "border-violet/40 bg-violet/5",
      )}
    >
      <dt className="text-xs leading-snug text-text">
        {copy.title}
        <span className="block font-mono text-[10px] uppercase tracking-widest text-muted">
          {copy.caption}
        </span>
      </dt>
      <dd className="mt-2 space-y-1.5">
        <ArtifactMark artifact={artifact} />
        {artifact.txHash && (
          <>
            {/* The full hash, wrapping, never truncated: in a recording the
                link cannot be inspected, so the painted characters are the
                only thing a reviewer can match to Stellar Expert — and all
                64 of them can be typed into its search from a paused frame. */}
            <p className="break-all font-mono text-xs leading-relaxed text-text">
              <span className="sr-only">Transaction hash </span>
              {artifact.txHash}
            </p>
            <StellarExpertLink
              kind="tx"
              id={artifact.txHash}
              className="inline-block"
            >
              {copy.link}
              <span aria-hidden="true"> ▸</span>
            </StellarExpertLink>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * An artifact's state in TxStatus's visual language — a cyan ✓ once
 * confirmed, a pulsing violet dot while in flight — but not TxStatus itself:
 * its Build → Sign → Broadcast trail narrates a transaction the USER signs,
 * and the platform's settler signs these. That trail here would tell the
 * buyer they had signed something they never saw.
 *
 * Pending borrows nothing from confirmed — no ✓, no cyan — so no frame of a
 * recording can pass a transaction in flight off as a landed one.
 */
function ArtifactMark({ artifact }: { artifact: DisputeArtifact }) {
  if (artifact.state === "confirmed") {
    return (
      <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan">
        <span aria-hidden="true">✓</span>
        Confirmed on Stellar
      </p>
    );
  }
  return (
    <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-violet-readable">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-violet shadow-[0_0_8px_#B026FF] motion-reduce:animate-none"
      />
      {artifact.txHash ? "Submitted, waiting for confirmation" : "Being sent"}
    </p>
  );
}

/** Someone's own words, labelled with whose they are. */
function Quote({
  label,
  tone,
  children,
}: {
  label: string;
  /** The rule's colour: the buyer's words and the platform's differ. */
  tone: string;
  children: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
      <blockquote
        className={cn(
          "mt-1 whitespace-pre-line break-words border-l-2 pl-3 text-xs leading-relaxed text-text/90",
          tone,
        )}
      >
        {children}
      </blockquote>
    </div>
  );
}
