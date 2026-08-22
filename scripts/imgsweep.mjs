/* Image containment sweep.
   Asserts that no <img> renders outside its container's CONTENT box on any
   axis, across every product page plus the shop grid, homepage, cart drawer
   and checkout summary.

   This bug class appeared three times (product cards, tier art, product
   gallery) and each time a spot check passed while the page was still broken,
   because the sample images happened to be square. So this checks every image
   on every page, against the content box rather than the border box.

   usage: node imgsweep.mjs [baseUrl]
*/
import { chromium } from "playwright";
const NL = String.fromCharCode(10);

const BASE = process.argv[2] || "http://localhost:8788";
const local = BASE.includes("localhost");
const page_ = (p) => (local ? p.replace(/^\/(shop|product|checkout)(\?|$)/, "/$1.html$2") : p);

const MEASURE = () => {
  const contentBox = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    const n = (v) => parseFloat(v) || 0;
    return {
      left: r.left + n(s.borderLeftWidth) + n(s.paddingLeft),
      right: r.right - n(s.borderRightWidth) - n(s.paddingRight),
      top: r.top + n(s.borderTopWidth) + n(s.paddingTop),
      bottom: r.bottom - n(s.borderBottomWidth) - n(s.paddingBottom),
    };
  };
  const TOL = 0.5;

  /* A box that declares aspect-ratio must actually render at it. On the broken
     build the gallery image's height attribute stretched .galmain from square
     to 545x1000, so the image never "overflowed" its container — the container
     was simply the wrong shape. Overflow alone would not catch that. */
  const ratioBreaks = [...document.querySelectorAll("*")].filter((el) => {
    const s = getComputedStyle(el);
    if (!s.aspectRatio || s.aspectRatio === "auto") return false;
    const m = s.aspectRatio.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
    if (!m) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const want = parseFloat(m[1]) / parseFloat(m[2]);
    const got = r.width / r.height;
    return Math.abs(got - want) / want > 0.02;
  }).map((el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { kind: "aspect-ratio-broken",
      host: (el.className || el.tagName).toString().split(" ")[0],
      declared: s.aspectRatio,
      rendered: Math.round(r.width) + "x" + Math.round(r.height) };
  });

  const imgs = [...document.images]
    .filter((i) => {
      if (i.hidden) return false;
      const s = getComputedStyle(i);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((i) => {
      const host = i.parentElement;
      const c = contentBox(host), ib = i.getBoundingClientRect();
      const over = {
        top: +(c.top - ib.top).toFixed(1),
        bottom: +(ib.bottom - c.bottom).toFixed(1),
        left: +(c.left - ib.left).toFixed(1),
        right: +(ib.right - c.right).toFixed(1),
      };
      const worst = Math.max(over.top, over.bottom, over.left, over.right);
      return {
        host: (host.className || host.tagName).toString().split(" ")[0],
        nat: i.naturalWidth + "x" + i.naturalHeight,
        img: Math.round(ib.width) + "x" + Math.round(ib.height),
        box: Math.round(c.right - c.left) + "x" + Math.round(c.bottom - c.top),
        over, worst,
        fail: worst > TOL,
      };
    });
  return { imgs, ratioBreaks };
};

const prime = async (p) => {
  await p.evaluate(async () => {
    const s = Math.round(innerHeight * 0.45);
    for (let y = 0; y < document.documentElement.scrollHeight; y += s) {
      scrollTo(0, y); await new Promise((r) => setTimeout(r, 150));
    }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
  });
  await p.waitForFunction(
    () => [...document.images].filter((i) => !i.hidden && i.getBoundingClientRect().width > 0)
      .every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(300);
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript((v) => localStorage.setItem("storefront_bag_v1", v),
  JSON.stringify([{ id: 710152, qty: 1, variantId: 1401322 }, { id: 710265, qty: 2 }]));
const p = await ctx.newPage();

let checked = 0, failed = 0;
const report = (label, res) => {
  const rows = res.imgs, ratio = res.ratioBreaks;
  checked += rows.length;
  const bad = rows.filter((r) => r.fail);
  failed += bad.length + ratio.length;
  const problems = [];
  if (bad.length) problems.push(bad.length + " OVERFLOWING");
  if (ratio.length) problems.push(ratio.length + " ASPECT-RATIO BROKEN");
  const mark = problems.length ? "FAIL" : "ok  ";
  console.log(`  ${mark} ${label.padEnd(34)} ${String(rows.length).padStart(3)} imgs${problems.length ? "  " + problems.join(", ") : ""}`);
  bad.slice(0, 3).forEach((r) =>
    console.log(`        overflow: ${r.host} nat ${r.nat} img ${r.img} box ${r.box} over ${JSON.stringify(r.over)}`));
  ratio.slice(0, 3).forEach((r) =>
    console.log(`        ratio:    ${r.host} declared ${r.declared} rendered ${r.rendered}`));
};

// homepage, cart drawer, shop, checkout
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForSelector("#catgrid .home-dept-card"); await prime(p);
report("home", await p.evaluate(MEASURE));

await p.goto(BASE + "/?open=cart", { waitUntil: "domcontentloaded" });
await p.waitForSelector(".cart.is-open .cart__row"); await p.waitForTimeout(1200);
report("home + cart drawer", await p.evaluate(MEASURE));

await p.goto(BASE + page_("/shop"), { waitUntil: "domcontentloaded" });
await p.waitForSelector("#pgrid .pcard"); await prime(p);
report("shop grid", await p.evaluate(MEASURE));

await p.goto(BASE + page_("/checkout"), { waitUntil: "domcontentloaded" });
await p.waitForSelector("#sumrows .sum__row"); await p.waitForTimeout(1000);
report("checkout summary", await p.evaluate(MEASURE));

// every product page
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForSelector("#catgrid .home-dept-card");
const ids = await p.evaluate(async () => (await import("/shop-data.js")).loadCatalog().then((c) => c.products.map((x) => x.id)));
console.log(`\n  --- ${ids.length} product pages ---`);
for (const id of ids) {
  await p.goto(BASE + page_("/product") + "?id=" + id, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#pdp h1", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(900);
  await p.waitForFunction(() => [...document.images].filter((i) => !i.hidden && i.getBoundingClientRect().width > 0)
    .every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
  const name = await p.evaluate(() => document.querySelector("#pdp h1")?.textContent?.slice(0, 24) || "?");
  report(`${id} ${name}`, await p.evaluate(MEASURE));
}

/* ---- negative control -----------------------------------------------------
   Both assertions run against deliberately broken DOM. If either fails to report
   a problem, the sweep is not measuring and the run aborts — a green result from
   a check that cannot go red is worse than no check at all. */
console.log(NL + "  --- negative control ---");
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForSelector("#catgrid .home-dept-card");
const control = await p.evaluate((src) => {
  const M = eval("(" + src + ")");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:120px;height:120px;padding:4px;";
  const img = document.createElement("img");
  img.src = document.images[0] ? document.images[0].src : "";
  img.style.cssText = "width:400px;height:400px;max-width:none;";
  host.appendChild(img);
  const ratio = document.createElement("div");
  ratio.style.cssText = "position:fixed;left:0;top:220px;width:300px;height:100px;aspect-ratio:1/1;";
  document.body.append(host, ratio);
  const r = M();
  host.remove(); ratio.remove();
  return r;
}, MEASURE.toString());

const sawOverflow = (control.imgs || []).some((i) => i.fail);
const sawRatio = (control.ratioBreaks || []).length > 0;
console.log("  overflowing image detected  : " + (sawOverflow ? "yes" : "NO"));
console.log("  broken aspect-ratio detected: " + (sawRatio ? "yes" : "NO"));
if (!sawOverflow || !sawRatio) {
  console.log(NL + "NEGATIVE CONTROL FAILED — this sweep proves nothing. Aborting.");
  await b.close();
  process.exit(2);
}
console.log("  both assertions can fail, so a pass means something");

await b.close();
console.log(`\n${checked} images checked, ${failed} exceeding their container content box`);
process.exit(failed ? 1 : 0);
