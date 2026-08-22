/* Verify the Walmart-style Featured Departments bento and save both required screenshots. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = (process.argv[2] || "http://localhost:8788").replace(/\/+$/, "");
const OUT = resolve("artifacts", "qa");
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
const fail = (message) => { failures++; console.log(`  FAIL  ${message}`); };
const pass = (message) => console.log(`  ok    ${message}`);

for (const [width, height] of [[1440, 900], [375, 812]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE}/?qa=bentocheck`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("[data-bento-tile]").length >= 5, null, { timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll("[data-promo-product]")]
    .every((image) => ["removed", "fallback"].includes(image.dataset.bgStatus)), null, { timeout: 60000 });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => {
    const banned = /\b(?:butt|booty|bum|scrunch|twerk|cheeky|thong|rear|backside|leggings?|jeggings?|bike(?:r)?\s+shorts?|yoga\s+shorts?|workout\s+shorts?|compression\s+shorts?|hot\s+pants?|shorts)\b/i;
    const tiles = [...document.querySelectorAll("[data-bento-tile]")];
    const images = [...document.querySelectorAll("[data-promo-product]")]
      .filter((image) => getComputedStyle(image).display !== "none");
    const clearance = (copy, image) => {
      const a = copy.getBoundingClientRect();
      const b = image.getBoundingClientRect();
      return Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
    };
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      tiles: tiles.length,
      pillButtons: document.querySelectorAll(".home-promo-card__cta--pill").length,
      techTiles: tiles.filter((tile) => tile.dataset.bentoTech === "true").length,
      eyebrows: tiles.map((tile) => tile.querySelector("small")?.textContent.trim()),
      headlines: tiles.map((tile) => tile.querySelector("h3")?.textContent.trim()),
      vendorCopy: tiles.filter((tile) => /\b(?:Alio|Merino)\b/i.test(tile.textContent)).length,
      backgrounds: tiles.map((tile) => getComputedStyle(tile).backgroundImage),
      ornaments: tiles.map((tile) => [
        getComputedStyle(tile, "::before").content,
        getComputedStyle(tile, "::after").content,
      ]),
      images: images.map((image) => {
        const style = getComputedStyle(image);
        return {
          name: image.dataset.promoName,
          status: image.dataset.bgStatus,
          transform: style.transform,
          filter: style.filter,
          shadow: style.boxShadow,
          background: style.backgroundColor,
          clearance: Math.round(clearance(image.closest("[data-bento-tile]").querySelector(".home-promo-card__copy"), image)),
        };
      }),
      bannedNames: images.filter((image) => banned.test(image.dataset.promoName)).map((image) => image.dataset.promoName),
    };
  });

  console.log(`\n  ${width}px`);
  state.overflow === 0 ? pass("no horizontal overflow") : fail(`${state.overflow}px horizontal overflow`);
  state.tiles >= 5 && state.tiles <= 6 ? pass("five retail promo tiles render") : fail(`${state.tiles} tiles rendered`);
  state.pillButtons === 1 ? pass("exactly one tile uses the pill CTA") : fail(`${state.pillButtons} pill CTAs rendered`);
  state.techTiles >= 1 ? pass("the grid includes live technology") : fail("no technology tile rendered");
  new Set(state.eyebrows).size === state.eyebrows.length ? pass("every eyebrow is unique") : fail("an eyebrow repeats");
  state.headlines.every((headline) => /[$€£]\s?\d/.test(headline))
    ? pass("every headline contains a live price hook") : fail("a headline lacks a price hook");
  state.vendorCopy === 0 ? pass("no vendor names appear") : fail("vendor copy appears in a tile");
  state.backgrounds.every((background) => background === "none")
    ? pass("all tile backgrounds are flat solids") : fail("a gradient or photo background remains");
  state.ornaments.every((pair) => pair.every((content) => content === "none"))
    ? pass("no decorative circle ornaments remain") : fail("a pseudo-element ornament remains");
  state.images.every(({ transform, filter, shadow, background }) =>
    transform === "none" && filter === "none" && shadow === "none" && background === "rgba(0, 0, 0, 0)")
    ? pass("cutouts have no rotation, paper card, filter, or shadow") : fail("an image still has collage styling");
  state.images.every(({ status }) => status === "removed")
    ? pass("white JPG backgrounds were removed dynamically") : fail("a promo image background could not be removed");
  state.images.every(({ clearance }) => clearance >= 24)
    ? pass("imagery keeps at least 24px clear of copy") : fail(`copy clearance fell below 24px (${state.images.map(({ clearance }) => clearance).join(", ")})`);
  state.bannedNames.length === 0 ? pass("rear-angle apparel safety filter passes") : fail(`unsafe promo candidates: ${state.bannedNames.join(", ")}`);

  await page.locator("#featured-departments").screenshot({ path: resolve(OUT, `featured-departments-${width}.png`) });
  pass(`section screenshot saved for ${width}px`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)\n` : "\nFeatured Departments checks passed.\n");
process.exit(failures ? 1 : 0);
