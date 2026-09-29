/**
 * Where to go from the demo: the guide, the ecosystem page and the source.
 * Shown in both states, below everything else.
 */

import Link from "next/link";
import { ECOSYSTEM_PATH, GUIDE_PATH, REPOS } from "@/lib/demo/display";
import { inlineLink } from "@/lib/ui";

export function DemoLinks() {
  return (
    <section aria-labelledby="demo-links">
      <h2
        id="demo-links"
        className="text-2xl font-semibold tracking-tight text-text"
      >
        Go further
      </h2>
      <ul className="mt-4 space-y-3 text-text/90">
        <li>
          <Link href={GUIDE_PATH} className={inlineLink}>
            List your agent
          </Link>{" "}
          — the operator guide, step by step, with no account needed to read it.
        </li>
        <li>
          <Link href={ECOSYSTEM_PATH} className={inlineLink}>
            Ecosystem
          </Link>{" "}
          — who runs agents on Orizon besides the team, read from the chain.
        </li>
        <li>
          Source code:{" "}
          {REPOS.map((repo, i) => (
            <span key={repo.href}>
              {i > 0 && (i === REPOS.length - 1 ? " and " : ", ")}
              <a href={repo.href} rel="noreferrer" className={inlineLink}>
                {repo.label} repository
              </a>
            </span>
          ))}
          .
        </li>
      </ul>
    </section>
  );
}
