import type { MetadataRoute } from "next";
import { SITE_URL, guidePath } from "@/lib/guide/display";
import { loadAllGuides } from "@/lib/guide/load";
import { DEMO_PATH } from "@/lib/demo/display";
import { loadDemo } from "@/lib/demo/load";
import { EVIDENCE_PATH } from "@/lib/evidence/display";
import { loadEvidence } from "@/lib/evidence/load";

const base = SITE_URL;

// /app is deliberately absent: the console is robots-noindexed, and
// advertising a noindexed route in the sitemap is contradictory. The public
// guides are listed, each dated by its own `updated` frontmatter rather than
// the build time, so a rebuild does not claim every guide changed. /demo is
// listed in both states (unpublished, it says how to verify each deliverable);
// once published it is dated by the video, not the build. /evidence is
// dated by its snapshot's as-of day, the day its evidence was last checked.
export default function sitemap(): MetadataRoute.Sitemap {
  const guides = loadAllGuides();
  const demo = loadDemo();
  const evidence = loadEvidence();
  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...(guides.length
      ? [
          {
            url: `${base}/guide`,
            changeFrequency: "monthly" as const,
            priority: 0.6,
          },
        ]
      : []),
    {
      url: `${base}${DEMO_PATH}`,
      ...(demo.status === "published"
        ? { lastModified: new Date(`${demo.video.published_at}T00:00:00Z`) }
        : {}),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    },
    {
      url: `${base}${EVIDENCE_PATH}`,
      lastModified: new Date(`${evidence.snapshot.as_of}T00:00:00Z`),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    ...guides.map((guide) => ({
      url: `${base}${guidePath(guide.slug)}`,
      lastModified: new Date(`${guide.meta.updated}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
