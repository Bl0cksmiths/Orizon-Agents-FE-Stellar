/**
 * The guide's header: what it is, and which API it was checked against.
 *
 * "Versioned with the API" means the reader can see, before trusting a single
 * sample, the guide's version, the backend commit it was verified against
 * (linked, so it can be compared with what is deployed), the date and the
 * network. A draft says so in words above everything else.
 */

import type { GuideMeta } from "@/lib/guide/frontmatter";
import {
  DRAFT_NOTICE,
  backendCommitUrl,
  formatGuideDate,
  shortSha,
} from "@/lib/guide/display";
import { inlineLink } from "@/lib/ui";
import { cn } from "@/lib/utils";

const term = "font-mono text-[10px] uppercase tracking-[0.25em] text-muted";
const value = "font-mono text-xs text-text";

export function GuideHeader({ meta }: { meta: GuideMeta }) {
  return (
    <header className="border-b border-border pb-8">
      <p className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan">
        <span aria-hidden="true" className="h-px w-8 bg-cyan/60" />
        Operator guide
      </p>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-text sm:text-4xl md:text-5xl">
        {meta.title}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        {meta.description}
      </p>

      {meta.status === "draft" && (
        <p
          role="note"
          data-guide-status="draft"
          className="mt-6 flex items-start gap-2 border-l-2 border-magenta/70 bg-magenta/10 px-4 py-3 text-sm text-text"
        >
          <span aria-hidden="true" className="font-mono text-magenta">
            ◆
          </span>
          <span>
            <strong className="font-semibold">{DRAFT_NOTICE}.</strong> The steps
            below have been checked by the team but not yet followed end to end
            by someone new to Orizon.
          </span>
        </p>
      )}

      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className={term}>Version</dt>
          <dd className={value}>{meta.version}</dd>
        </div>
        <div>
          <dt className={term}>Verified against backend</dt>
          <dd className={value}>
            <a
              href={backendCommitUrl(meta.api_verified_against)}
              rel="noreferrer"
              aria-label={`Backend commit ${shortSha(meta.api_verified_against)}`}
              className={cn(
                inlineLink,
                "[@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center",
              )}
            >
              {shortSha(meta.api_verified_against)}
            </a>
          </dd>
        </div>
        <div>
          <dt className={term}>Updated</dt>
          <dd className={value}>
            <time dateTime={meta.updated}>{formatGuideDate(meta.updated)}</time>
          </dd>
        </div>
        <div>
          <dt className={term}>Network</dt>
          <dd className={value}>{meta.network}</dd>
        </div>
      </dl>
    </header>
  );
}
