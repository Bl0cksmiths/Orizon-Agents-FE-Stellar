/**
 * Every link the marketing nav offers, in one typed place.
 *
 * The desktop bar shows two menus and one promoted link; the mobile sheet
 * shows the same links as two headed sections, with the promoted link leading
 * the second. Both read from here, so a link added once appears in both.
 */

import { EVIDENCE_PATH } from "@/lib/evidence/display";
import { LIST_YOUR_AGENT_PATH } from "@/lib/guide/display";
import { LITEPAPER_PATH } from "@/lib/litepaper/paths.mjs";

export type NavLink = {
  href: string;
  label: string;
  /** One line under the label, in the menus and the sheet. */
  description: string;
  /**
   * The path this link is the page for, and every page beneath it — "/guide"
   * marks the Guide current on every guide. Absent for the section links on
   * the home page, which are never "the page".
   */
  section?: string;
};

export type NavGroup = {
  id: "platform" | "resources";
  label: string;
  links: readonly NavLink[];
};

// Rooted at "/" so they also work from the public pages, which share this
// nav; on the home page they still just scroll.
export const PLATFORM: NavGroup = {
  id: "platform",
  label: "Platform",
  links: [
    {
      href: "/#solution",
      label: "Product",
      description: "Three layers, one coordinated agent network",
    },
    {
      href: "/#architecture",
      label: "Architecture",
      description: "The five modules every execution flows through",
    },
    {
      href: "/#reputation",
      label: "Reputation",
      description: "Trust scored from settled USDC, not stars",
    },
    {
      href: "/#use-cases",
      label: "Use cases",
      description: "Real intents composed into agent chains",
    },
    {
      href: "/#roadmap",
      label: "Roadmap",
      description: "From MVP to a digital labor market",
    },
  ],
};

/** Shown on its own in the desktop bar: the one page operators come for. */
export const GUIDE: NavLink = {
  href: LIST_YOUR_AGENT_PATH,
  label: "Guide",
  description: "List your agent on Orizon, step by step",
  section: "/guide",
};

export const RESOURCES: NavGroup = {
  id: "resources",
  label: "Resources",
  links: [
    {
      href: EVIDENCE_PATH,
      label: "Evidence",
      description: "Each deliverable linked to its proof on Stellar",
      section: EVIDENCE_PATH,
    },
    {
      href: LITEPAPER_PATH,
      label: "Litepaper",
      description: "The protocol in full, as PDF, web page or Markdown",
      section: LITEPAPER_PATH,
    },
  ],
};

/** The desktop bar's menus, in order; the Guide link follows them. */
export const MENUS: readonly NavGroup[] = [PLATFORM, RESOURCES];

/** The mobile sheet's sections: the Guide leads Resources there. */
export const SHEET_SECTIONS: readonly NavGroup[] = [
  PLATFORM,
  { ...RESOURCES, links: [GUIDE, ...RESOURCES.links] },
];

/** Whether `link` is the page at `pathname`, or a page beneath it. */
export function isCurrent(link: NavLink, pathname: string | null): boolean {
  if (!link.section || !pathname) return false;
  return pathname === link.section || pathname.startsWith(`${link.section}/`);
}

/** Whether any of a menu's links is the current page. */
export function groupIsCurrent(
  group: NavGroup,
  pathname: string | null,
): boolean {
  return group.links.some((link) => isCurrent(link, pathname));
}
