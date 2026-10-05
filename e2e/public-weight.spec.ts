/**
 * What the public pages must not download.
 *
 * Reviewers judge the site by these pages, often on a phone. Their sections
 * are server components with CSS entrances, so the motion library the console
 * animates with has no business in their scripts; and the wallet kit and the
 * Stellar SDK load only when someone actually connects a wallet. Either one
 * slipping back into a layout these pages share is a silent regression of
 * every public page at once, which is what this spec is for.
 *
 * Under `next dev` a chunk defines each module it carries under the module's
 * path, as a key: `"(app-pages-browser)/./node_modules/<pkg>/…": …`. A lazy
 * `import()` names the path too, but only as an escaped string inside the
 * importer's code, so it does not count: the wallet provider names the kit
 * that way, to fetch it on connect.
 */
import { test, expect, type Page } from "@playwright/test";
import { mockApi } from "./mocks";

const PUBLIC_PAGES = [
  "/",
  "/evidence",
  "/demo",
  "/guide",
  "/guide/list-your-agent",
  "/litepaper",
] as const;

/** Packages the public pages never load. */
const NOT_ON_PUBLIC_PAGES = [
  "framer-motion",
  "@creit.tech/stellar-wallets-kit",
  "@stellar/stellar-sdk",
  "@stellar/freighter-api",
] as const;

/** Whether a dev chunk's text defines a module of `pkg`. */
function defines(text: string, pkg: string): boolean {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`"\\([^)"]*\\)/\\./node_modules/${escaped}/[^"]*":`).test(
    text,
  );
}

/** Every script the page fetched, settled, with its text. */
async function scriptsOf(page: Page, path: string) {
  const scripts: { url: string; text: Promise<string> }[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    scripts.push({
      url: response.url(),
      text: response.text().catch(() => ""),
    });
  });
  await mockApi(page);
  await page.goto(path);
  await expect(page.locator("main#main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  return Promise.all(
    scripts.map(async (s) => ({ url: s.url, text: await s.text })),
  );
}

test.describe("public page weight", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} loads no motion library, wallet kit or SDK`, async ({
      page,
    }) => {
      const scripts = await scriptsOf(page, path);
      expect(scripts.length).toBeGreaterThan(0);

      const found = scripts.flatMap(({ url, text }) =>
        NOT_ON_PUBLIC_PAGES.filter((pkg) => defines(text, pkg)).map(
          (pkg) => `${pkg} in ${new URL(url).pathname}`,
        ),
      );
      expect(found).toEqual([]);
    });
  }
});
