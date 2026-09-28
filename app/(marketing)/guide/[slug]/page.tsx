import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/guide/guide-article";
import { guidePath } from "@/lib/guide/display";
import { listGuideSlugs, loadGuide } from "@/lib/guide/load";

/**
 * A public guide, e.g. /guide/list-your-agent.
 *
 * Statically generated from content/guides/<slug>.md at build time: the page
 * is plain HTML with no login, wallet or backend call between a reader and
 * the text. A guide whose frontmatter or code fences break the dialect fails
 * `next build` with the file name and every problem listed. Only the guides
 * on disk exist; any other slug is a 404.
 */

export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return listGuideSlugs().map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

export function generateMetadata({ params }: Props): Metadata {
  const guide = loadGuide(params.slug);
  if (!guide) return {};
  const { title, description, updated } = guide.meta;
  const url = guidePath(guide.slug);
  return {
    title: `${title} — Orizon Agents`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
      siteName: "Orizon Agents",
      locale: "en_US",
      modifiedTime: updated,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function GuidePage({ params }: Props) {
  const guide = loadGuide(params.slug);
  if (!guide) notFound();
  return <GuideArticle guide={guide} />;
}
