import type { Metadata } from "next";
import { LitepaperArticle } from "@/components/litepaper/litepaper-article";
import { formatDate } from "@/lib/evidence/display";
import { LITEPAPER_PATH } from "@/lib/litepaper/display";
import { loadLitepaper } from "@/lib/litepaper/load";
import { Footer } from "../_components/footer";
import { Nav } from "../_components/nav";

/**
 * /litepaper: the Orizon Agents Protocol Litepaper, to read or download
 * (story 5.06).
 *
 * Statically generated from litepaper/ at build time: the cover's version and
 * date, each file's size and the §6 anchor are read there, and a folder that
 * is missing anything fails `next build` with every problem listed. The files
 * themselves are served from public/litepaper/, copied by the prebuild step.
 * The page needs no account, wallet or backend call.
 *
 * Like /demo and the guide, the nav and footer sit outside <main> so they stay
 * the banner and contentinfo landmarks, and "Skip to content" lands past the
 * nav.
 */

// A page that sets its own openGraph loses the root opengraph-image, so the
// site card is named here explicitly.
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Orizon Agents — Pay-per-workflow agent commerce on Stellar",
};

export function generateMetadata(): Metadata {
  const paper = loadLitepaper();
  const title = `${paper.title}, v${paper.version}`;
  const description = `Version ${paper.version}, dated ${formatDate(paper.date)}. Read the Orizon Agents litepaper as a PDF, a web page, a Word document or Markdown. §6 is updated for open registration.`;
  return {
    title: `${title} — Orizon Agents`,
    description,
    alternates: { canonical: LITEPAPER_PATH },
    openGraph: {
      title,
      description,
      type: "article",
      url: LITEPAPER_PATH,
      siteName: "Orizon Agents",
      locale: "en_US",
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SHARE_IMAGE],
    },
  };
}

export default function LitepaperPage() {
  const paper = loadLitepaper();
  return (
    <>
      <Nav />
      <main id="main" className="relative">
        <LitepaperArticle paper={paper} />
      </main>
      <Footer />
    </>
  );
}
