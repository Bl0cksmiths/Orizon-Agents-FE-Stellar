import { Nav } from "./(marketing)/_components/nav";
import { Hero } from "./(marketing)/_components/hero";
import { Problem } from "./(marketing)/_components/problem";
import { Solution } from "./(marketing)/_components/solution";
import { Architecture } from "./(marketing)/_components/architecture";
import { Reputation } from "./(marketing)/_components/reputation";
import { UseCases } from "./(marketing)/_components/use-cases";
import { Roadmap } from "./(marketing)/_components/roadmap";
import { Personas } from "./(marketing)/_components/personas";
import { CTA } from "./(marketing)/_components/cta";
import { Footer } from "./(marketing)/_components/footer";
import { Marquee } from "@/components/ui/marquee";
import { BackendWarmup } from "@/components/backend-warmup";
import { getPublicNetworkStats } from "@/lib/public-network-stats";

// The hero's network figures are read on the server and the page is
// regenerated at most every five minutes (PUBLIC_STATS_REVALIDATE_S — Next
// needs the literal here). A read that fails leaves the figures out until
// the next regeneration; it never fails the build.
export const revalidate = 300;

// Structured data for search engines. Serialized into a JSON-LD script tag
// below; the page stays a server component so this ships as static HTML.
const structuredData: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Orizon Agents",
      url: "https://orizons.xyz",
    },
    {
      "@type": "SoftwareApplication",
      name: "Orizon Agents",
      url: "https://orizons.xyz",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

const agentTags = [
  "seo.brief",
  "copywrite.v3",
  "design.figma",
  "code.next",
  "deploy.v0",
  "sol-audit",
  "research.pro",
  "ads.meta",
  "translate.42",
  "vision.ocr",
  "analytics.v2",
  "crawl.v2",
];

export default async function Home() {
  const stats = await getPublicNetworkStats();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <BackendWarmup />
      {/* Nav and Footer sit OUTSIDE <main> on purpose: <header>/<footer> only
          expose the banner/contentinfo landmarks when they are not descendants
          of main, and the layout's "Skip to content" link (href="#main") has to
          land past the nav rather than on top of it. */}
      <Nav />
      <main id="main" className="relative overflow-hidden">
        <Hero stats={stats} />
        <Marquee items={agentTags} />
        <Problem />
        <Solution />
        <Architecture />
        <Reputation />
        <UseCases />
        <Roadmap />
        <Personas />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
