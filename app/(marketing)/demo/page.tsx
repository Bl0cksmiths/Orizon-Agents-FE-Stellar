import type { Metadata } from "next";
import { DemoArticle } from "@/components/demo/demo-article";
import { DEMO_PATH, formatDuration } from "@/lib/demo/display";
import { loadDemo } from "@/lib/demo/load";
import { Footer } from "../_components/footer";
import { Nav } from "../_components/nav";

/**
 * /demo: the demo video, where a reviewer lands (story 5.04).
 *
 * Statically generated from content/demo/demo.json at build time. The page
 * needs no account, wallet or backend call, and a manifest that breaks a rule
 * in lib/demo/validate.mjs fails `next build` with every problem listed.
 * Until the video is recorded the manifest is unpublished and the page says
 * so, showing how to verify each deliverable instead of anything staged.
 *
 * Like the guide, the nav and footer sit outside <main> so they stay the
 * banner and contentinfo landmarks, and "Skip to content" lands past the nav.
 */

// A page that sets its own openGraph loses the root opengraph-image, so the
// site card is named here explicitly.
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Orizon Agents — Pay-per-workflow agent commerce on Stellar",
};

const TITLE = "Demo: Orizon Agents, end to end";

export function generateMetadata(): Metadata {
  const demo = loadDemo();
  const description =
    demo.status === "published"
      ? `A ${formatDuration(demo.video.duration_seconds)} walkthrough of Orizon Agents on Stellar testnet, from the operator's side and the buyer's, with every transaction linked on Stellar Expert.`
      : "The Orizon Agents demo video has not been recorded yet. Until it is, verify each funded deliverable yourself on Stellar testnet.";
  return {
    title: `${TITLE} — Orizon Agents`,
    description,
    alternates: { canonical: DEMO_PATH },
    openGraph: {
      title: TITLE,
      description,
      type: "website",
      url: DEMO_PATH,
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

export default function DemoPage() {
  const demo = loadDemo();
  return (
    <>
      <Nav />
      <main id="main" className="relative">
        <DemoArticle demo={demo} />
      </main>
      <Footer />
    </>
  );
}
