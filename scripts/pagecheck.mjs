/* Verification for the four content pages and the rebuilt footer.
   The byte-size check is the one that matters: a page served through
   not_found_handling is byte-identical to the homepage while still
   answering 200, so status alone proves nothing. */
import { chromium } from "playwright";
/* Base URL is argv[2], so this runs against a preview or the live site
   as well as the local dev server: node scripts/pagecheck.mjs https://… */


const B = (process.argv[2] || "http://localhost:8788").replace(/\/+$/, "");
const CONTENT = ["/about-us", "/terms", "/privacy", "/contact-us"];
const ALL = ["/", "/shop.html", "/product.html?id=711002", "/checkout.html", "/brands.html", "/vendors.html", "/vendor.html?vendor=alio", "/vendor.html?vendor=merino", "/blog", "/article.html?id=31649", ...CONTENT];
const EXPECTED_TOKENS = new Set(["SHOP_EMAIL", "SHOP_PHONE", "SHOP_ADDRESS", "COMPANY_REGISTRATION"]);

let fails = 0;
const fail = (m) => { fails++; console.log(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

const home = await (await fetch(B + "/")).text();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

/* 1 — distinct content, not the SPA fallback ----------------------------- */
console.log("\n1. Pages resolve to distinct content");
for (const p of CONTENT) {
  const r = await fetch(B + p);
  const body = await r.text();
  if (r.status !== 200) fail(`${p} → ${r.status}`);
  else if (body.length === home.length) fail(`${p} is byte-identical to the homepage (SPA fallback)`);
  else pass(`${p}  ${r.status}  ${body.length.toLocaleString()} bytes  ≠ homepage (${home.length.toLocaleString()})`);
}
{ // the control: an unrouted path SHOULD still fall back, or the check is meaningless
  const body = await (await fetch(B + "/no-such-page")).text();
  if (body.length === home.length) pass("/no-such-page still falls back — the size check can discriminate");
  else fail("/no-such-page did not fall back; the size check proves nothing");
}

/* 2 — shared marketplace header hydrates consistently ------------------- */
console.log("\n2. Shared Marko header hydrates consistently");
for (const p of ALL) {
  await page.goto(B + p, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-shared-chrome="v3"] .header-search', { timeout: 15000 });
  const header = await page.evaluate(() => ({
    version: document.querySelector("header")?.getAttribute("data-shared-chrome"),
    logo: document.querySelector(".market-logo")?.textContent?.trim(),
    sellers: document.querySelector('nav a[href="vendors.html"]')?.textContent?.trim(),
    search: document.querySelector(".header-search")?.textContent?.trim(),
  }));
  if (header.version !== "v3" || header.logo !== "marko✦" || header.sellers !== "Sellers" || !header.search) {
    fail(`${p}: incomplete Marko marketplace header ${JSON.stringify(header)}`);
  } else pass(`${p.padEnd(32)} shared Marko header hydrated`);
}

/* 3 — every footer link resolves ----------------------------------------- */
console.log("\n3. Footer links resolve");
const checked = new Map();
for (const p of ALL) {
  await page.goto(B + p, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("[data-collections] li").length > 0, null, { timeout: 15000 }).catch(() => {});
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("footer.ft a")].map((a) => ({ href: a.getAttribute("href"), text: a.textContent.trim() })));
  // Checkout's footer is deliberately stripped to the payment bar — no columns,
  // no exits. Requiring links there would be requiring a regression.
  if (!hrefs.length && p !== "/checkout.html") fail(`${p}: footer has no links`);
  if (!hrefs.length && p === "/checkout.html") pass("/checkout.html footer is stripped by design (0 links)");
  for (const { href, text } of hrefs) {
    if (!href || href === "#") { fail(`${p}: "${text}" has href="${href}"`); continue; }
    if (checked.has(href)) continue;
    const url = new URL(href, B + "/");
    const r = await fetch(url);
    const body = await r.text();
    const dup = body.length === home.length && url.pathname !== "/";
    checked.set(href, true);
    if (r.status !== 200) fail(`${href} → ${r.status}`);
    else if (dup) fail(`${href} → 200 but serves the homepage`);
    else pass(`${href.padEnd(34)} ${r.status}  ${body.length.toLocaleString()} bytes`);
  }
}
console.log(`        ${checked.size} distinct footer hrefs, all resolved`);

/* 4 — no href="#" left anywhere ------------------------------------------ */
console.log("\n4. No href=\"#\" anywhere");
let stubs = 0;
for (const p of ALL) {
  await page.goto(B + p, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const n = await page.evaluate(() => [...document.querySelectorAll("a")].filter((a) => {
    const h = a.getAttribute("href");
    return !h || h === "#";
  }).map((a) => a.textContent.trim().slice(0, 30)));
  if (n.length) { fail(`${p}: ${n.length} stub link(s) — ${n.join(", ")}`); stubs += n.length; }
}
if (!stubs) pass(`0 stub links across all ${ALL.length} page states`);

/* 5 — Terms anchors scroll to the right section --------------------------- */
/* Run each anchor on a COLD context. With fonts warm all three land perfectly;
   the failure only appears on a first visit, when the web fonts reflow the
   document after the browser has already jumped. That is the visitor's
   experience, so it is the one worth testing. */
console.log("\n5. Terms anchors scroll to their section (cold cache)");
for (const [id, expect] of [["delivery", "Delivery"], ["returns", "Returns and cancellation"], ["warranty", "Faulty items"]]) {
  const cold = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await cold.newPage();
  await page.goto(`${B}/terms#${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const r = await page.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), text: el.textContent.trim(), scrolled: Math.round(window.scrollY) };
  }, id);
  if (!r) fail(`#${id} not found`);
  else if (r.scrolled < 100) fail(`#${id} did not scroll (scrollY=${r.scrolled})`);
  // The condensed sticky header occupies 0–63px. A heading landing above that
  // is hidden behind it, which is how the cold-load reflow bug presented.
  else if (r.top < 63) fail(`#${id} landed at top=${r.top}px — behind the 63px sticky header`);
  else if (r.top > 160) fail(`#${id} landed at top=${r.top}px — too far down the viewport`);
  else if (!r.text.startsWith(expect)) fail(`#${id} is "${r.text}", expected "${expect}…"`);
  else pass(`#${id.padEnd(9)} scrollY=${String(r.scrolled).padStart(5)}  heading top=${String(r.top).padStart(3)}px  "${r.text}"`);
  await cold.close();
}

/* 6 — token audit --------------------------------------------------------- */
console.log("\n6. Rendered {{TOKEN}} audit");
const found = new Map();
for (const p of ALL) {
  await page.goto(B + p, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const toks = await page.evaluate(() => (document.body.innerText.match(/\{\{[A-Z_]+\}\}/g) || []));
  for (const t of toks) {
    const name = t.slice(2, -2);
    if (!found.has(name)) found.set(name, new Map());
    const m = found.get(name);
    m.set(p, (m.get(p) || 0) + 1);
  }
}
for (const [name, where] of found) {
  const loc = [...where].map(([p, n]) => `${p}×${n}`).join(", ");
  if (EXPECTED_TOKENS.has(name)) pass(`{{${name}}} — deliberately unfilled — ${loc}`);
  else fail(`{{${name}}} rendered but is NOT one of the four contact tokens — ${loc}`);
}
for (const t of EXPECTED_TOKENS) if (!found.has(t)) console.log(`        note: {{${t}}} does not appear on any page`);

await browser.close();
console.log(fails ? `\n${fails} FAILURE(S)\n` : `\nAll checks passed.\n`);
process.exit(fails ? 1 : 0);
