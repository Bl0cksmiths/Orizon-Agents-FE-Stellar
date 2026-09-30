import type { Metadata } from "next";
import { EvidenceArticle } from "@/components/evidence/evidence-article";
import { metricsHeadline } from "@/lib/evidence/checklist";
import { EVIDENCE_PATH, formatDate } from "@/lib/evidence/display";
import { loadEvidence } from "@/lib/evidence/load";
import { Footer } from "../_components/footer";
import { Nav } from "../_components/nav";
import "./print.css";

/**
 * /evidence: the evidence index, every SOW claim linked to its on-chain proof
 * (story 5.05, the sprint's exit gate).
 *
 * Statically generated from content/evidence/index.json at build time. The
 * page needs no account, wallet or backend call and runs no script of its own;
 * an index that breaks a rule in lib/evidence/validate.mjs fails `next build`
 * with every problem listed.
 *
 * Like /demo and the guide, the nav and footer sit outside <main> so they stay
 * the banner and contentinfo landmarks, and "Skip to content" lands past the
 * nav. Neither prints: the printout is the evidence pack alone.
 */

// A page that sets its own openGraph loses the root opengraph-image, so the
// site card is named here explicitly.
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Orizon Agents — Pay-per-workflow agent commerce on Stellar",
};

const TITLE = "Evidence index: every claim linked to its proof";

export function generateMetadata(): Metadata {
  const index = loadEvidence();
  const description = `The Orizon Agents Instaward evidence as of ${formatDate(index.snapshot.as_of)}: each SOW deliverable and success metric linked to its proof on Stellar testnet. ${metricsHeadline(index.metrics)}.`;
  return {
    title: `${TITLE} — Orizon Agents`,
    description,
    alternates: { canonical: EVIDENCE_PATH },
    openGraph: {
      title: TITLE,
      description,
      type: "website",
      url: EVIDENCE_PATH,
      siteName: "Orizon Agents",
      locale: "en_US",
      images: [SHARE_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description,
      images: [SHARE_IMAGE],
    },
  };
}

export default function EvidencePage() {
  const index = loadEvidence();
  return (
    <>
      <div className="print:hidden">
        <Nav />
      </div>
      <main id="main" className="relative">
        <EvidenceArticle index={index} />
      </main>
      <div className="print:hidden">
        <Footer />
      </div>
    </>
  );
}
