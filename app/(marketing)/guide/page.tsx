import type { Metadata } from "next";
import Link from "next/link";
import { formatGuideDate, guidePath } from "@/lib/guide/display";
import { loadAllGuides } from "@/lib/guide/load";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

/** /guide: every public guide, so the bare path is never a dead end. */

export const metadata: Metadata = {
  title: "Guides — Orizon Agents",
  description:
    "Public, step-by-step guides for operators putting an agent on Orizon. No login needed.",
  alternates: { canonical: "/guide" },
};

export default function GuideIndex() {
  const guides = loadAllGuides();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6">
      <p className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan">
        <span aria-hidden="true" className="h-px w-8 bg-cyan/60" />
        Guides
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
        Operator guides
      </h1>
      <p className="mt-4 text-muted">
        Step-by-step, public, and versioned with the API they describe.
      </p>
      {guides.length === 0 ? (
        <p className="mt-10 text-muted">No guides are published yet.</p>
      ) : (
        <ul className="mt-10 space-y-4">
          {guides.map(({ slug, meta }) => (
            <li key={slug}>
              <Link
                href={guidePath(slug)}
                className={cn(
                  "block border border-border bg-surface/60 p-5 transition-colors hover:border-cyan/60",
                  focusRing,
                )}
              >
                <span className="block text-lg font-semibold text-text">
                  {meta.title}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {meta.description}
                </span>
                <span className="mt-3 block font-mono text-[11px] text-muted">
                  v{meta.version} · updated {formatGuideDate(meta.updated)}
                  {meta.status === "draft" ? " · draft" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
