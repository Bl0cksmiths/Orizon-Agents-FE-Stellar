import { Isolate } from "@/components/isolate";
import { NavBar } from "./nav/nav-bar";
import { StaticNav } from "./nav/static-nav";

/**
 * The marketing site's top bar, shared by the home page and the public pages.
 *
 * The bar is the pages' one shared piece of client-side chrome, so it sits in
 * a local boundary: if it fails, a plain bar of links takes its place and the
 * page's content stays. Without one, its failure would reach the route's
 * error screen and replace the page.
 */
export function Nav() {
  return (
    <Isolate name="nav" fallback={<StaticNav />}>
      <NavBar />
    </Isolate>
  );
}
