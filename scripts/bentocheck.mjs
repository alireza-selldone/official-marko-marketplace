/* Verify the homepage promotional grid and save both required screenshots.
 *
 * The grid has two modes and the check covers whichever one is live:
 *
 *   editorial — the shop configured artwork in `shop.config.json`. The
 *     photograph fills the tile, so the assertions are about coverage: the
 *     image box matches the tile box, nothing is letterboxed, and a scrim
 *     carries the copy. This is the mode Marko ships.
 *
 *   catalog — no artwork configured. The tile falls back to a cut-out product
 *     from its department on a flat field, which is all a bare catalog can
 *     honestly offer. Here the old rules still apply: the cutout must actually
 *     have had its background removed, and it must keep clear of the copy.
 *
 * Assertions that hold in BOTH modes are the ones that were never about
 * layout: five tiles, one pill CTA, live technology present, unique eyebrows,
 * a live price hook in every headline, no vendor names, and no rear-angle
 * apparel.
 *
 * Usage: node scripts/bentocheck.mjs [baseUrl]
 */
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
  const mode = await page.evaluate(() => document.querySelector("[data-home-mosaic]")?.dataset.mosaicMode);
  if (mode === "catalog") {
    await page.waitForFunction(() => [...document.querySelectorAll("[data-promo-product]")]
      .every((image) => ["removed", "fallback"].includes(image.dataset.bgStatus)), null, { timeout: 60000 });
  } else {
    await page.waitForFunction(() => [...document.querySelectorAll(".home-promo-card__art")]
      .every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 60000 });
  }
  await page.waitForTimeout(300);

  const state = await page.evaluate(() => {
    const banned = /\b(?:butt|booty|bum|scrunch|twerk|cheeky|thong|rear|backside|leggings?|jeggings?|bike(?:r)?\s+shorts?|yoga\s+shorts?|workout\s+shorts?|compression\s+shorts?|hot\s+pants?|shorts)\b/i;
    const tiles = [...document.querySelectorAll("[data-bento-tile]")];
    const cutouts = [...document.querySelectorAll("[data-promo-product]")]
      .filter((image) => getComputedStyle(image).display !== "none");
    const clearance = (copy, image) => {
      const a = copy.getBoundingClientRect();
      const b = image.getBoundingClientRect();
      return Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
    };
    return {
      mode: document.querySelector("[data-home-mosaic]")?.dataset.mosaicMode,
      overflow: document.documentElement.scrollWidth - innerWidth,
      tiles: tiles.length,
      pillButtons: document.querySelectorAll(".home-promo-card__cta--pill").length,
      techTiles: tiles.filter((tile) => tile.dataset.bentoTech === "true").length,
      eyebrows: tiles.map((tile) => tile.querySelector("small")?.textContent.trim()),
      headlines: tiles.map((tile) => tile.querySelector("h3")?.textContent.trim()),
      vendorCopy: tiles.filter((tile) => /\b(?:Alio|Merino)\b/i.test(tile.textContent)).length,
      backgrounds: tiles.map((tile) => getComputedStyle(tile).backgroundImage),
      /* Editorial: the photograph must cover the tile, not sit letterboxed
         inside it, and it must have loaded. */
      art: tiles.map((tile) => {
        const image = tile.querySelector(".home-promo-card__art");
        if (!image) return null;
        const a = image.getBoundingClientRect();
        const b = tile.getBoundingClientRect();
        return {
          fit: getComputedStyle(image).objectFit,
          loaded: image.complete && image.naturalWidth > 0,
          natural: [image.naturalWidth, image.naturalHeight],
          covers: Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1,
          veil: !!tile.querySelector(".home-promo-card__veil"),
          alt: image.getAttribute("alt") ?? "",
        };
      }),
      cutouts: cutouts.map((image) => {
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
      bannedNames: [
        ...cutouts.map((image) => image.dataset.promoName || ""),
        ...tiles.map((tile) => tile.querySelector(".home-promo-card__art")?.getAttribute("alt") || ""),
      ].filter((name) => banned.test(name)),
    };
  });

  console.log(`\n  ${width}px  (${state.mode} mode)`);
  state.overflow === 0 ? pass("no horizontal overflow") : fail(`${state.overflow}px horizontal overflow`);
  state.tiles === 5 ? pass("five promo tiles render") : fail(`${state.tiles} tiles rendered`);
  state.pillButtons === 1 ? pass("exactly one tile uses the pill CTA") : fail(`${state.pillButtons} pill CTAs rendered`);
  state.techTiles >= 1 ? pass("the grid includes live technology") : fail("no technology tile rendered");
  new Set(state.eyebrows).size === state.eyebrows.length ? pass("every eyebrow is unique") : fail("an eyebrow repeats");
  state.headlines.every((headline) => /[$€£]\s?\d/.test(headline))
    ? pass("every headline carries a live price hook") : fail("a headline lacks a price hook");
  state.vendorCopy === 0 ? pass("no vendor names appear") : fail("vendor copy appears in a tile");
  state.bannedNames.length === 0
    ? pass("rear-angle apparel safety filter passes") : fail(`unsafe promo subjects: ${state.bannedNames.join(", ")}`);

  if (state.mode === "editorial") {
    const art = state.art;
    art.every(Boolean) ? pass("every tile carries its own artwork") : fail("a tile has no artwork");
    art.filter(Boolean).every((row) => row.loaded)
      ? pass("all artwork loaded") : fail("a tile's artwork failed to load");
    art.filter(Boolean).every((row) => row.fit === "cover" && row.covers)
      ? pass("artwork fills each tile edge to edge") : fail("a tile's artwork is letterboxed or does not cover");
    /* Small tiles render near 400x340 at 1440 and the tall one is larger, so
       900px on the long edge is the floor for a crisp 2x render. */
    art.filter(Boolean).every((row) => Math.max(...row.natural) >= 900)
      ? pass("all artwork is at least 900px on its long edge")
      : fail(`artwork below 900px: ${art.filter(Boolean).map((row) => row.natural.join("x")).join(", ")}`);
    art.filter(Boolean).every((row) => row.veil)
      ? pass("copy sits on a legibility scrim") : fail("a tile's copy has no scrim behind it");
    art.filter(Boolean).every((row) => row.alt.trim().length > 0)
      ? pass("every tile's artwork is described") : fail("a tile's artwork has an empty alt");
  } else {
    state.backgrounds.every((background) => background === "none")
      ? pass("all tile fields are flat solids") : fail("a gradient or photo background remains");
    state.cutouts.every(({ transform, filter, shadow, background }) =>
      transform === "none" && filter === "none" && shadow === "none" && background === "rgba(0, 0, 0, 0)")
      ? pass("cutouts have no rotation, paper card, filter, or shadow") : fail("a cutout still has collage styling");
    state.cutouts.every(({ status }) => status === "removed")
      ? pass("cutout backgrounds were removed dynamically") : fail("a cutout background could not be removed");
    state.cutouts.every(({ clearance }) => clearance >= 24)
      ? pass("cutouts keep at least 24px clear of copy")
      : fail(`copy clearance fell below 24px (${state.cutouts.map(({ clearance }) => clearance).join(", ")})`);
  }

  await page.locator("#featured-departments").screenshot({ path: resolve(OUT, `featured-departments-${width}.png`) });
  pass(`section screenshot saved for ${width}px`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)\n` : "\nPromotional grid checks passed.\n");
process.exit(failures ? 1 : 0);
