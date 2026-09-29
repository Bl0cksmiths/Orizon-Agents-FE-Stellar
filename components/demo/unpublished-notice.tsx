/**
 * The page before the video exists: an honest notice, and how to check each
 * deliverable in the meantime without taking anyone's word for it.
 *
 * There is no player, no poster and no evidence table here, not even an
 * empty one: a frame with nothing in it still reads as "the demo is here".
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  DELIVERABLE_NAMES,
  ECOSYSTEM_PATH,
  EVIDENCE_BUNDLES,
  GUIDE_PATH,
  OPERATOR_PATH,
  UNPUBLISHED_NOTICE,
  type Deliverable,
} from "@/lib/demo/display";
import { inlineLink } from "@/lib/ui";

const WEEK_3_BUNDLE = EVIDENCE_BUNDLES[2];

const VERIFY: { d: Deliverable; body: ReactNode }[] = [
  {
    d: "D1",
    body: (
      <>
        Follow the{" "}
        <Link href={GUIDE_PATH} className={inlineLink}>
          operator guide
        </Link>{" "}
        to register an agent from your own wallet and bind its endpoint, then
        find it on the{" "}
        <Link href={OPERATOR_PATH} className={inlineLink}>
          operator dashboard
        </Link>{" "}
        with that wallet connected.
      </>
    ),
  },
  {
    d: "D2",
    body: (
      <>
        Ask the{" "}
        <Link href="/app/orchestrator" className={inlineLink}>
          orchestrator
        </Link>{" "}
        for a plan: the plan card shows each agent&rsquo;s reputation, and an
        agent below the reputation floor is shown as excluded.
      </>
    ),
  },
  {
    d: "D3",
    body: (
      <>
        The{" "}
        <a href={WEEK_3_BUNDLE.href} rel="noreferrer" className={inlineLink}>
          Week 3 evidence bundle
        </a>{" "}
        sets out the dispute and refund path, the testnet transactions that
        exist for it, and what is still missing.
      </>
    ),
  },
  {
    d: "D4",
    body: (
      <>
        The{" "}
        <Link href={ECOSYSTEM_PATH} className={inlineLink}>
          ecosystem page
        </Link>{" "}
        counts operators outside the team against the adoption targets, and
        lists the team&rsquo;s own wallets separately so you can check.
      </>
    ),
  },
];

export function UnpublishedNotice() {
  return (
    <section aria-labelledby="demo-verify" data-demo-state="unpublished">
      <div className="flex items-start gap-3 border-l-2 border-cyan/60 bg-cyan/5 px-4 py-4 text-text">
        <span aria-hidden="true" className="font-mono text-cyan">
          ◆
        </span>
        <p role="note" className="leading-relaxed">
          {UNPUBLISHED_NOTICE}
        </p>
      </div>

      <h2
        id="demo-verify"
        className="mt-12 text-2xl font-semibold tracking-tight text-text"
      >
        Verify each deliverable yourself
      </h2>
      <ol className="mt-5 space-y-5">
        {VERIFY.map(({ d, body }) => (
          <li key={d} className="border-l-2 border-border pl-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-violet-readable">
              {d}
            </p>
            <h3 className="mt-1 font-semibold text-text">
              {DELIVERABLE_NAMES[d]}
            </h3>
            <p className="mt-1 leading-relaxed text-text/90">{body}</p>
          </li>
        ))}
      </ol>

      <h3 className="mt-10 font-semibold text-text">Evidence bundles</h3>
      <p className="mt-1 text-muted">
        Each week&rsquo;s evidence, with every claim linked to a public pull
        request, commit or testnet transaction.
      </p>
      <ul className="mt-3 space-y-2">
        {EVIDENCE_BUNDLES.map((b) => (
          <li key={b.href}>
            <a href={b.href} rel="noreferrer" className={inlineLink}>
              {b.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
