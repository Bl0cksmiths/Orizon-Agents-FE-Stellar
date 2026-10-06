import type { Metadata } from "next";
import { Nav } from "./(marketing)/_components/nav";
import { Hero } from "./(marketing)/_components/hero";
import { Problem } from "./(marketing)/_components/problem";
import { Solution } from "./(marketing)/_components/solution";
import { Architecture } from "./(marketing)/_components/architecture";
import { Reputation } from "./(marketing)/_components/reputation";
import { UseCases } from "./(marketing)/_components/use-cases";
import { UseCasesList } from "./(marketing)/_components/use-case-flow";
import { Roadmap } from "./(marketing)/_components/roadmap";
import { Personas } from "./(marketing)/_components/personas";
import { CTA } from "./(marketing)/_components/cta";
import { Footer } from "./(marketing)/_components/footer";
import { Marquee } from "@/components/ui/marquee";
import { BackendWarmup } from "@/components/backend-warmup";
import { Isolate } from "@/components/isolate";
import { RevealAtRest } from "@/components/ui/reveal-at-rest";
import { RevealOnScroll } from "@/components/ui/reveal-on-scroll";
import { getHeroStats } from "@/lib/public-network-stats";

// The home page's own canonical, https://orizons.xyz (Next writes the root
// without a trailing slash), the same URL the sitemap lists. It is set here,
// not in the root layout, so no other page inherits it.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The hero's network figures are read on the server and the page is
// regenerated at most every five minutes (PUBLIC_STATS_REVALIDATE_S — Next
// needs the literal here). They are complete or absent, never partial: a
// regeneration that cannot read complete figures throws, and Next keeps
// serving the last page it generated; a build retries for about two minutes
// and then renders the hero without them (lib/public-network-stats.ts).
export const revalidate = 300;
// The stats reads are `no-store` so the registry is read afresh on every
// regeneration, never from Next's data cache. `force-static` keeps those
// reads from turning the page dynamic; the page reads no headers, cookies or
// search params, so it gives nothing else up.
export const dynamic = "force-static";
// A regeneration reads the registry twice, 10s apart, when the backend sends
// no sync signal; room for that and a slow read or two.
export const maxDuration = 60;

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
  const stats = await getHeroStats();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {/* Each client-side part of the page sits in a local boundary
          (components/isolate.tsx), so a part that fails never replaces the
          page: the warm-up is simply skipped. */}
      <Isolate name="backend-warmup">
        <BackendWarmup />
      </Isolate>
      {/* The sections are server components; their scroll entrances are the
          `.reveal` class, played by this one observer. If it fails, every
          section is shown at rest rather than left hidden. */}
      <Isolate name="reveal" fallback={<RevealAtRest />}>
        <RevealOnScroll />
      </Isolate>
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
        <Isolate name="use-cases" fallback={<UseCasesList />}>
          <UseCases />
        </Isolate>
        <Roadmap />
        <Personas />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
