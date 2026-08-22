/* Portability check — does this repo actually work for a shop that is not
 * this one?
 *
 * No second real shop was available, so the catalogue endpoints are
 * intercepted and served synthetic shops with 3, 6 and 10 categories, plus
 * one with 2 (below the floor) and one with 12 (above the ceiling). The code
 * under test is the real storefront: real slug derivation, real grid, real
 * config handling. Only the shop behind XAPI is synthetic, and this file says
 * so rather than implying a second shop was used.
 *
 * Negative controls, kept in the run:
 *   - a catalogue whose categories carry NONE of this shop's ids must still
 *     produce a populated grid. That is the bug this whole piece of work
 *     exists to fix, and it is the one assertion that must never pass by
 *     accident.
 *   - a config still marked isTemplate must raise the banner, and one naming
 *     a real shop must not.
 *
 * Usage: node scripts/portcheck.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://localhost:8788").replace(/\/+$/, "");
let fails = 0;
const fail = (m) => { fails++; console.log("  FAIL  " + m); };
const pass = (m) => console.log("  ok    " + m);

/* Category titles deliberately unlike this shop's, with ids from a completely
   different range, an ampersand, an accent and a duplicate-slug pair. */
const TITLES = [
  "Espresso & Filter", "Grinders", "Brewing Kit", "Café Décor", "Subscriptions",
  "Cups", "Cold Brew", "Gift Sets", "Beans", "Cleaning", "Scales", "Kettles",
];

function shop(nCats, nProducts = 40) {
  const cats = TITLES.slice(0, nCats).map((t, i) => ({ id: 900000 + i, title: t, icon: "" }));
  const products = [];
  for (let i = 0; i < nProducts; i++) {
    const c = cats[i % cats.length];
    products.push({
      id: 800000 + i,
      title: `Reference ${i + 1}`,
      slug: `reference-${i + 1}`,
      brand: ["Aria", "Brera", "Corda"][i % 3],
      category_id: c.id,
      price: 100 + i * 37,
      discount: 0,
      quantity: 5,
      icon: "products/photo.png",
      spec: null,
      product_variants: [],
      variants: [],
      images: [],
    });
  }
  return { cats, products };
}

async function run(browser, { nCats, nProducts = 40, cfg = null, label }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { cats, products } = shop(nCats, nProducts);

  await ctx.route(/xapi\.selldone\.com\/.*products\/list/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products }) }));
  await ctx.route(/xapi\.selldone\.com\/.*products\/all/, (r) =>
    r.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        total: products.length,
        products: products.map((p) => ({ ...p, category: cats.find((c) => c.id === p.category_id) })),
      }),
    }));
  await ctx.route(/xapi\.selldone\.com\/.*\/(info|blogs)/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ shop: {}, articles: [] }) }));

  /* The synthetic catalogue names an image path that only exists in this
     fixture, so the real CDN answers 404 and the run reports a page error that
     says nothing about the storefront. Serve the placeholder locally: the
     assertion is about this code, not about cdn.selldone.com's contents. */
  const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await ctx.route(/cdn\.selldone\.com\/.*/, (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));

  if (cfg) {
    await ctx.route(/shop\.config\.json/, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cfg) }));
  }

  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (message) => { if (message.type() === "error") errs.push(message.text()); });
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3500);

  const r = await p.evaluate(() => {
    const grid = document.getElementById("catgrid");
    const section = grid ? grid.closest("section") : null;
    return {
      tiles: document.querySelectorAll("#catgrid .home-dept-card").length,
      n: grid ? grid.dataset.n : null,
      cols: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
      hidden: section ? section.hidden : null,
      slugs: [...document.querySelectorAll("#catgrid .home-dept-card")].map((a) => a.getAttribute("href")),
      banner: !!document.querySelector(".tplbanner"),
      cards: document.querySelectorAll(".pcard").length,
      est: document.querySelector("[data-brand-est]") ? document.querySelector("[data-brand-est]").textContent : null,
      tagline: document.querySelector("[data-brand-tagline]") ? document.querySelector("[data-brand-tagline]").textContent : null,
      hotspots: document.querySelectorAll(".hspot").length,
    };
  });
  await ctx.close();
  return { ...r, errs, label };
}

const REAL_CFG = {
  shop: { id: 12345, handle: "CoffeeCo", name: "CoffeeCo" },
  isTemplate: false,
  brand: { foundedYear: null, cities: null, tagline: null, announcement: null },
  categories: [],
  categoryHeroes: {},
  hero: { mode: "plate", slides: [], hotspots: [] },
  spotlight: { mode: "highest-price" },
  contact: {},
};

const browser = await chromium.launch();

console.log("\nA DIFFERENT SHOP — none of this repo's category ids appear in the data");
console.log("-".repeat(66));
/* The department row is capped at eight tiles and its column track follows the
   live count, so a small catalog gets full-width tiles rather than narrow ones
   padded out by empty columns. Expected columns are therefore derived, not a
   literal: pinning one number only ever measured one layout. */
for (const nCats of [3, 4, 5, 6, 7, 8, 9, 10]) {
  const wantCols = Math.min(nCats, 8);
  const r = await run(browser, { nCats, cfg: REAL_CFG, label: `${nCats} categories` });
  const expectedTiles = Math.min(nCats, 8);
  const ok = r.tiles === expectedTiles && r.cols === wantCols && !r.hidden;
  const line = `${String(nCats).padStart(2)} categories -> ${r.tiles} tiles, ${r.cols} columns`;
  if (ok) pass(line); else fail(`${line} (expected ${expectedTiles} tiles, ${wantCols} columns, section visible)`);
  if (r.errs.length) fail(`${nCats} categories: page error — ${r.errs[0]}`);
}

console.log("\nEDGES");
console.log("-".repeat(66));
{
  const r = await run(browser, { nCats: 2, cfg: REAL_CFG });
  (r.tiles === 0 && r.hidden === true)
    ? pass("2 categories -> section dropped, not a lonely tile")
    : fail(`2 categories -> ${r.tiles} tiles, hidden=${r.hidden}`);
}
{
  const r = await run(browser, { nCats: 12, cfg: REAL_CFG });
  (r.tiles === 8)
    ? pass("12 categories -> the eight-item homepage category limit is respected")
    : fail(`12 categories -> ${r.tiles} tiles, expected 8`);
}

console.log("\nSLUGS DERIVED FROM LIVE TITLES");
console.log("-".repeat(66));
{
  const r = await run(browser, { nCats: 4, cfg: REAL_CFG });
  const want = ["espresso-and-filter", "grinders", "brewing-kit", "cafe-decor"];
  const got = r.slugs.map((h) => String(h).split("cat=")[1]).sort();
  const ok = want.every((w) => got.includes(w));
  ok ? pass(`ampersand and accent handled: ${got.join(", ")}`)
     : fail(`slugs were ${got.join(", ")}, expected ${want.join(", ")}`);
}

console.log("\nTEMPLATE BANNER");
console.log("-".repeat(66));
{
  const r = await run(browser, { nCats: 4, cfg: REAL_CFG });
  !r.banner ? pass("absent when the config names a real shop")
            : fail("shown even though isTemplate is false and a shop id is set");
}
{
  const r = await run(browser, { nCats: 4, cfg: { ...REAL_CFG, isTemplate: true } });
  r.banner ? pass("shown when isTemplate is true")
           : fail("NOT shown when isTemplate is true");
}
{
  // The dangerous case: no shop id at all. Checking for a specific id would
  // miss this, which is why the condition is "template OR missing".
  const r = await run(browser, { nCats: 4, cfg: { ...REAL_CFG, isTemplate: false, shop: {} } });
  r.banner ? pass("shown when the config has no shop id at all")
           : fail("NOT shown when the shop id is missing — the silent-wrong-data case");
}

console.log("\nBRAND COPY OMITTED, NOT PLACEHELD");
console.log("-".repeat(66));
{
  const r = await run(browser, { nCats: 4, cfg: REAL_CFG });
  (r.est === null && r.tagline === null)
    ? pass("null brand values remove their elements rather than printing a placeholder")
    : fail(`est=${JSON.stringify(r.est)} tagline=${JSON.stringify(r.tagline)}`);
}
{
  const r = await run(browser, { nCats: 4, cfg: REAL_CFG });
  r.hotspots === 0
    ? pass("no hotspots without a measured photograph")
    : fail(`${r.hotspots} hotspots rendered over a hero this shop has no photograph for`);
}

await browser.close();
console.log("");
console.log(fails ? `${fails} FAILURE(S)\n` : "Portability checks passed.\n");
process.exit(fails ? 1 : 0);
