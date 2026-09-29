import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The evidence page's tables: a table on a desktop and on paper, a stack of
 * cards on a phone.
 *
 * The same approach as components/ui/stacked-table.tsx, which the console
 * uses: below `md` every row becomes a bordered block and every cell a
 * label-and-value line, so nothing scrolls sideways at 360px; the header row
 * stays for screen readers and the per-cell labels are hidden from them, so a
 * cell is announced once, under its real header. Two things differ, which is
 * why this is not that component:
 *
 *   - the first cell of each row is its row header (`<th scope="row">`), so a
 *     screen reader names the deliverable or metric a status belongs to;
 *   - the text is the page's readable sans, not the console's 11px mono, for
 *     a reviewer who is not a developer;
 *
 * and it prints as a real table whatever the paper's width, since `md` is
 * measured against the page when printing.
 *
 * The caption is visible: it says what the table is before its rows do.
 */
export function EvidenceTable({
  caption,
  columns,
  rows,
  className,
}: {
  caption: ReactNode;
  /** The first column heads the row headers. */
  columns: string[];
  rows: { key: string; header: ReactNode; cells: ReactNode[] }[];
  className?: string;
}) {
  const label = (i: number) => (
    <span
      aria-hidden="true"
      className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-muted md:hidden print:hidden"
    >
      {columns[i]}
    </span>
  );
  const cell =
    "block py-1.5 align-top md:table-cell md:border-b md:border-border md:px-3 md:py-3 print:table-cell print:border-b print:border-black/40 print:px-2 print:py-1.5";
  return (
    <table
      role="table"
      className={cn(
        "block w-full border-collapse text-left text-sm md:table print:table",
        className,
      )}
    >
      <caption className="mb-3 block text-left text-sm text-muted md:table-caption print:table-caption">
        {caption}
      </caption>
      <thead
        role="rowgroup"
        className="sr-only md:not-sr-only md:table-header-group print:not-sr-only print:table-header-group"
      >
        <tr role="row">
          {columns.map((c) => (
            <th
              key={c}
              role="columnheader"
              scope="col"
              className="border-b border-border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted print:border-black print:px-2"
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody
        role="rowgroup"
        className="block space-y-3 md:table-row-group md:space-y-0 print:table-row-group print:space-y-0"
      >
        {rows.map((row) => (
          <tr
            key={row.key}
            role="row"
            className="block break-inside-avoid border border-border p-3 md:table-row md:border-0 md:p-0 print:table-row print:border-0 print:p-0"
          >
            <th
              role="rowheader"
              scope="row"
              className={cn(cell, "font-normal text-text")}
            >
              {label(0)}
              {row.header}
            </th>
            {row.cells.map((c, i) => (
              <td
                key={columns[i + 1]}
                role="cell"
                className={cn(cell, "text-text/90")}
              >
                {label(i + 1)}
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
