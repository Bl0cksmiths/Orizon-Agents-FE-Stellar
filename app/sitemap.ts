import type { MetadataRoute } from "next";
import { SITE_URL, guidePath } from "@/lib/guide/display";
import { loadAllGuides } from "@/lib/guide/load";

const base = SITE_URL;

// /app is deliberately absent: the console is robots-noindexed, and
// advertising a noindexed route in the sitemap is contradictory. The public
// guides are listed, each dated by its own `updated` frontmatter rather than
// the build time, so a rebuild does not claim every guide changed.
export default function sitemap(): MetadataRoute.Sitemap {
  const guides = loadAllGuides();
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
    ...guides.map((guide) => ({
      url: `${base}${guidePath(guide.slug)}`,
      lastModified: new Date(`${guide.meta.updated}T00:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
