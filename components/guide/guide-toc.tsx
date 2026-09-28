/**
 * "On this page": the guide's ## and ### headings as a nested list of links.
 * Plain HTML with no scroll-spy, so it costs no JavaScript and works with
 * scripts off.
 */

import type { TocEntry } from "@/lib/guide/parse";
import { focusRing } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Section = { entry: TocEntry; children: TocEntry[] };

/** Group each ### under the ## before it. A leading ### stands alone. */
export function nestToc(toc: TocEntry[]): Section[] {
  const sections: Section[] = [];
  for (const entry of toc) {
    const last = sections[sections.length - 1];
    if (entry.depth === 3 && last) last.children.push(entry);
    else sections.push({ entry, children: [] });
  }
  return sections;
}

const link = cn(
  "block py-1 text-sm text-muted transition-colors hover:text-text",
  focusRing,
);

export function GuideToc({ toc }: { toc: TocEntry[] }) {
  if (!toc.length) return null;
  return (
    <nav aria-labelledby="guide-toc-heading">
      <h2
        id="guide-toc-heading"
        className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan"
      >
        On this page
      </h2>
      <ol className="space-y-1 border-l border-border pl-4">
        {nestToc(toc).map(({ entry, children }) => (
          <li key={entry.id}>
            <a href={`#${entry.id}`} className={link}>
              {entry.text}
            </a>
            {children.length > 0 && (
              <ol className="ml-3 space-y-1 border-l border-border/60 pl-3">
                {children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={`#${child.id}`}
                      className={cn(link, "text-[13px]")}
                    >
                      {child.text}
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
