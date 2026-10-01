/**
 * A whole guide page: header, contents, the code-block legend and the body.
 *
 * The contents list is in the DOM once, right after the header, which is
 * where it reads on a phone; from the lg breakpoint the grid moves it into a
 * sticky right-hand column without changing the reading order.
 */

import type { LoadedGuide } from "@/lib/guide/load";
import { GuideBody } from "./guide-body";
import { GuideHeader } from "./guide-header";
import { GuideToc } from "./guide-toc";
import { VerifyLegend } from "./verify-legend";

export function GuideArticle({ guide }: { guide: LoadedGuide }) {
  return (
    <article
      data-guide={guide.slug}
      className="relative mx-auto grid max-w-6xl gap-y-8 px-4 pb-24 pt-28 sm:px-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-x-14"
    >
      <div className="min-w-0 max-w-3xl lg:col-start-1">
        <GuideHeader meta={guide.meta} />
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-3 lg:row-start-1">
        <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <GuideToc toc={guide.toc} />
        </div>
      </div>
      <div className="min-w-0 max-w-3xl lg:col-start-1">
        <VerifyLegend />
      </div>
      <div className="min-w-0 max-w-3xl lg:col-start-1">
        <GuideBody tree={guide.tree} />
      </div>
    </article>
  );
}
