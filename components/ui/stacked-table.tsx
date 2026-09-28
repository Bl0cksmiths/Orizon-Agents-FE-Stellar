import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A table on a desktop, a stack of cards on a phone.
 *
 * Below `md` every row becomes a bordered block and every cell a
 * label-and-value line, so nothing is scrolled sideways at 360px — the console
 * hides horizontal overflow, which means a wide table is not scrolled to, it
 * is cut off. The header row is kept for screen readers (visually hidden on a
 * phone) and the per-cell labels are hidden from them, so a cell is announced
 * once, under its real column header.
 *
 * The ARIA roles are explicit because changing a table part's `display`
 * drops its table semantics in some browsers; the roles put them back.
 */
export function StackedTable({
  caption,
  columns,
  rows,
  className,
}: {
  /** Read by screen readers; visually hidden, since a heading precedes it. */
  caption: string;
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
  className?: string;
}) {
  return (
    <table
      role="table"
      className={cn("block w-full text-left md:table", className)}
    >
      <caption className="sr-only">{caption}</caption>
      <thead
        role="rowgroup"
        className="sr-only md:not-sr-only md:table-header-group"
      >
        <tr role="row" className="md:border-b md:border-border">
          {columns.map((c) => (
            <th
              key={c}
              role="columnheader"
              scope="col"
              className="py-2 pr-4 font-mono text-[10px] font-normal uppercase tracking-widest text-muted"
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody
        role="rowgroup"
        className="block space-y-3 md:table-row-group md:space-y-0"
      >
        {rows.map((row) => (
          <tr
            key={row.key}
            role="row"
            className="block border border-border p-3 md:table-row md:border-0 md:border-b md:p-0"
          >
            {row.cells.map((cell, i) => (
              <td
                key={columns[i]}
                role="cell"
                className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-0.5 align-top font-mono text-[11px] text-text md:table-cell md:py-2 md:pr-4"
              >
                <span
                  aria-hidden="true"
                  className="text-[10px] uppercase tracking-widest text-muted md:hidden"
                >
                  {columns[i]}
                </span>
                <span className="min-w-0 break-all md:break-normal">
                  {cell}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
