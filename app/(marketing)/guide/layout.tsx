import type { ReactNode } from "react";
import { Nav } from "../_components/nav";
import { Footer } from "../_components/footer";

/**
 * The public guides wear the marketing site's nav and footer. Like the home
 * page, the nav and footer sit outside <main> so they stay the banner and
 * contentinfo landmarks, and the layout's "Skip to content" link (#main)
 * lands past the nav. Nothing here reads a wallet or a session: the guides
 * are readable with neither.
 */
export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main id="main" className="relative">
        {children}
      </main>
      <Footer />
    </>
  );
}
