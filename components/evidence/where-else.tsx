/**
 * "Where else to look": the public guide, the demo, the ecosystem page and
 * the source. On paper each prints its full address, since a printed
 * "/demo" goes nowhere.
 */

import Link from "next/link";
import { DEMO_PATH, ECOSYSTEM_PATH, REPOS } from "@/lib/demo/display";
import { LIST_YOUR_AGENT_PATH, SITE_URL } from "@/lib/guide/display";
import { inlineLink } from "@/lib/ui";

function PrintUrl({ href }: { href: string }) {
  return (
    <span
      data-print-url
      className="hidden break-all print:block print:text-[10px]"
    >
      {href.startsWith("/") ? `${SITE_URL}${href}` : href}
    </span>
  );
}

const PAGES = [
  {
    href: LIST_YOUR_AGENT_PATH,
    label: "List your agent on Orizon",
    what: "the public operator guide, step by step, readable with no account.",
  },
  {
    href: DEMO_PATH,
    label: "Demo",
    what: "the demo video page, and how to verify each deliverable yourself.",
  },
  {
    href: ECOSYSTEM_PATH,
    label: "Ecosystem",
    what: "who runs agents on Orizon besides the team, read from the chain.",
  },
];

export function WhereElse() {
  return (
    <section aria-labelledby="where-else">
      <h2
        id="where-else"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Where else to look
      </h2>
      <ul className="mt-4 space-y-3 leading-relaxed text-text/90">
        {PAGES.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className={inlineLink}>
              {p.label}
            </Link>{" "}
            — {p.what}
            <PrintUrl href={p.href} />
          </li>
        ))}
        {REPOS.map((repo) => (
          <li key={repo.href}>
            <a
              href={repo.href}
              target="_blank"
              rel="noopener noreferrer"
              className={inlineLink}
            >
              {repo.label} source code
              <span className="sr-only"> (opens GitHub)</span>
              <span aria-hidden="true" className="print:hidden">
                {" "}
                ↗
              </span>
            </a>{" "}
            — the repository on GitHub.
            <PrintUrl href={repo.href} />
          </li>
        ))}
      </ul>
    </section>
  );
}
