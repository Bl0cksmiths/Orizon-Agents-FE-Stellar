/**
 * The chamfered outline border (`CyberBorder` in components/ui/button.tsx).
 *
 * The outline variant used to draw its border with `border-*`. A CSS border
 * runs only along the box's four sides, so `clip-cyber` cut it off at the two
 * chamfered corners and left the diagonals bare: the outline looked torn,
 * top-right and bottom-left. The border is now a 1px ring clipped to the
 * chamfered shape itself.
 *
 * Asserted two ways, on each outline control the public pages show:
 *
 *   - the structure: no CSS border colour of its own, and a ring child whose
 *     clip-path is the even-odd ring;
 *   - the pixels: the diagonals are painted about as strongly as the straight
 *     top edge. A screenshot is decoded here (8-bit PNG, inflated with
 *     node:zlib) rather than compared with a stored baseline, which would
 *     differ by font hinting from one machine to the next while this
 *     measures only the border.
 */
import { inflateSync } from "node:zlib";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { mockApi, mockWallet } from "./mocks";

test.use({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

type Image = { width: number; height: number; rgba: Uint8Array };

/** Decodes a Playwright screenshot: 8-bit RGB or RGBA, not interlaced. */
function decodePng(png: Buffer): Image {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect(body[8], "bit depth").toBe(8);
      expect(body[12], "interlace").toBe(0);
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      expect(channels, "colour type").toBeGreaterThan(0);
    } else if (type === "IDAT") {
      data.push(body);
    }
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) {
        out[(y * width + x) * 4 + k] = line[x * channels + k];
      }
      out[(y * width + x) * 4 + 3] = 255;
    }
    prev.set(line);
  }
  return { width, height, rgba: out };
}

/**
 * How violet the strongest pixel near (x, y) is: blue over green, which is
 * near zero on the dark page and high on the border's #B026FF.
 */
function violetNear(img: Image, x: number, y: number): number {
  let best = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = Math.min(img.width - 1, Math.max(0, Math.round(x) + dx));
      const py = Math.min(img.height - 1, Math.max(0, Math.round(y) + dy));
      const i = (py * img.width + px) * 4;
      best = Math.max(best, img.rgba[i + 2] - img.rgba[i + 1]);
    }
  }
  return best;
}

/**
 * The border's strength on its straight top edge, and at points along both
 * diagonal cuts — in device pixels, from a screenshot of the control alone.
 */
async function borderStrength(control: Locator, cut: number) {
  // A page screenshot clipped to the control: an element screenshot of a
  // link here came back as bare page background.
  const box = await control.boundingBox();
  if (!box) throw new Error("the control has no box");
  const img = decodePng(await control.page().screenshot({ clip: box }));
  const s =
    img.width /
    (await control.evaluate((el) => el.getBoundingClientRect().width));
  const w = img.width;
  const h = img.height;
  const c = cut * s;
  const inset = 0.7 * s; // half a CSS pixel in from the cut, on the ring
  const top = violetNear(img, w / 2, inset);
  const diagonals: number[] = [];
  for (const t of [0.3, 0.5, 0.7]) {
    // top-right: from (w - c, 0) to (w, c); bottom-left: (c, h) to (0, h - c)
    diagonals.push(violetNear(img, w - c + t * c - inset, t * c + inset));
    diagonals.push(violetNear(img, c - t * c + inset, h - t * c - inset));
  }
  return { top, diagonals };
}

async function expectUnbrokenBorder(control: Locator, cut: 12 | 8) {
  await expect(control).toBeVisible();
  // The marketing sections fade in with framer-motion, which
  // a screenshot does not wait for: wait until nothing above the control
  // is still see-through.
  await expect
    .poll(() =>
      control.evaluate((el) => {
        let opacity = 1;
        for (let n: Element | null = el; n; n = n.parentElement) {
          opacity *= Number(getComputedStyle(n).opacity);
        }
        return opacity;
      }),
    )
    .toBe(1);
  // Structure: the CSS border is only a transparent spacer, and the ring is
  // the even-odd polygon.
  const structure = await control.evaluate((el) => {
    const ring = el.querySelector<HTMLElement>(":scope > [data-cyber-border]");
    return {
      borderColor: getComputedStyle(el).borderTopColor,
      borderWidth: getComputedStyle(el).borderTopWidth,
      ringClip: ring ? getComputedStyle(ring).clipPath : null,
    };
  });
  expect(structure.borderColor).toBe("rgba(0, 0, 0, 0)");
  expect(structure.borderWidth).toBe("1px");
  expect(structure.ringClip).toContain("evenodd");
  expect(structure.ringClip).toContain(`${cut}px`);

  // Pixels: each diagonal is painted at least half as strongly as the top.
  const { top, diagonals } = await borderStrength(control, cut);
  expect(top, "the straight top edge is painted").toBeGreaterThan(60);
  for (const d of diagonals) expect(d).toBeGreaterThanOrEqual(top * 0.5);
}

async function settle(page: Page) {
  // Out of the way of every control, so nothing is measured mid-hover.
  await page.mouse.move(1, 899);
  await page.evaluate(() => document.fonts.ready);
}

test.describe("outline border on the chamfered corners", () => {
  test("the nav's Connect Wallet", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await settle(page);
    await expectUnbrokenBorder(
      page.getByRole("banner").getByRole("button", { name: "Connect Wallet" }),
      12,
    );
  });

  test("the hero's See how it works", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await settle(page);
    await expectUnbrokenBorder(
      page.getByRole("main").getByRole("link", { name: /see how it works/i }),
      12,
    );
  });

  test("the closing call to action", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const cta = page
      .getByRole("main")
      .locator('a[href="/app/agents"]')
      .filter({ has: page.locator("[data-cyber-border]") });
    await cta.scrollIntoViewIfNeeded();
    await settle(page);
    await expectUnbrokenBorder(cta, 12);
  });

  test("the not-found page's way home", async ({ page }) => {
    await page.goto("/no-such-page");
    await settle(page);
    const home = page
      .locator('a[href="/"]')
      .filter({ has: page.locator("[data-cyber-border]") });
    await expectUnbrokenBorder(home, 12);
  });

  test("a connected wallet's address, at the small cut", async ({ page }) => {
    await mockWallet(page);
    await mockApi(page);
    await page.goto("/");
    const address = page.getByRole("banner").getByRole("button", { name: /◆/ });
    await expect(address).toBeVisible();
    await settle(page);
    await expectUnbrokenBorder(address, 8);
  });

  test("brightens on hover, as the border did", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await settle(page);
    const button = page
      .getByRole("banner")
      .getByRole("button", { name: "Connect Wallet" });
    const ring = button.locator("> [data-cyber-border]");
    await expect(ring).toHaveCSS("background-color", "rgba(176, 38, 255, 0.6)");
    await button.hover();
    await expect(ring).toHaveCSS("background-color", "rgb(176, 38, 255)");
  });
});
