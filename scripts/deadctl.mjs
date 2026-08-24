/* Dead-control sweep: every visible button and link must actually do something.

   Wiring is detected by OBSERVING it, not by inferring it. An earlier version
   kept an allowlist of classes and data- attributes it believed the app bound,
   which was wrong in both directions: it missed Search and Account for a year
   (a <button> with no type attribute reports .type === "submit"), and it later
   reported the newsletter Subscribe button as dead after it had been correctly
   wired, because a plain <button type="button"> matches no known convention.
   An allowlist can only ever describe the conventions its author remembered.

   So addEventListener is instrumented before any page script runs, and a
   control counts as wired when a listener exists on it or on any ancestor —
   which is also how event delegation is caught.

   Base URL is argv[2], so this runs against a preview or the live site as well
   as the local dev server: node scripts/deadctl.mjs https://…
*/
import { chromium } from "playwright";

const B = (process.argv[2] || "http://localhost:8788").replace(/\/+$/, "");
const PAGES = [["home","/","#catgrid .home-dept-card"],["shop","/shop.html","#pgrid .pcard"],
                ["product","/product.html?id=711002","#pdp h1"],
                // The checkout renders its panels only after the catalog resolves,
                // so waiting on a static container would report every control on
                // the page as unwired. Wait for a rendered panel.
                ["checkout","/checkout.html","#continueCheckout"],
                ["about","/about-us",".prose"],["terms","/terms",".prose"],
                ["privacy","/privacy",".prose"],["contact","/contact-us",".prose"],
                ["blog","/blog",".post"],
                ["article","/article.html?id=31667","[data-article-body] p"],
                ["brands","/brands.html",".brand-directory a"],
                ["sellers","/vendors.html","[data-vendor-directory] article"],
                ["alio","/vendor.html?vendor=alio","[data-vendor-products] .pcard"],
                ["merino","/vendor.html?vendor=merino","[data-vendor-products] .pcard"]];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
await ctx.addInitScript(v=>localStorage.setItem("storefront_bag_v1",v), JSON.stringify([{id:711002,qty:1,variantId:1406480}]));

/* Runs before page scripts, so every listener the app registers is recorded. */
await ctx.addInitScript(() => {
  const orig = EventTarget.prototype.addEventListener;
  const map = new WeakMap();
  window.__wired = map;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    let s = map.get(this);
    if (!s) map.set(this, (s = new Set()));
    s.add(type);
    return orig.call(this, type, ...rest);
  };
});

const p = await ctx.newPage();
const seen = new Map();
for (const [name,url,ready] of PAGES) {
  await p.goto(B+url,{waitUntil:"domcontentloaded"});
  /* Swallowing this timeout silently made the sweep untrustworthy: a page that
     never hydrated reports every control on it as unwired, and that is
     indistinguishable from a real finding. Under suite load the shop page
     missed its window and produced a phantom "Clear all has no handler". Say so
     instead, so a phantom run is recognisable as one. */
  const hydrated = await p.waitForSelector(ready,{state:"attached",timeout:60000})
    .then(()=>true).catch(()=>false);
  if (!hydrated) console.log(`  WARN  ${name} never reached "${ready}" - findings below are unreliable`);
  await p.waitForTimeout(1200);
  // open the panels too
  await p.evaluate(()=>{document.querySelector('[data-open="cart"]')?.click();});
  await p.waitForTimeout(400);
  const rows = await p.evaluate(() => {
    const out=[];
    const ACT=["click","pointerdown","mousedown","mouseup","keydown","submit"];
    const vis = el => { const s=getComputedStyle(el); const r=el.getBoundingClientRect();
      return s.display!=="none" && s.visibility!=="hidden" && r.width>0 && r.height>0; };
    /* Wired if the element, or anything it bubbles through, listens for an
       activation event. Covers direct binding and delegation alike. */
    const wired = el => {
      for (let n=el; n; n=n.parentElement) {
        if (n.onclick) return true;
        const s = window.__wired?.get(n);
        if (s && ACT.some(t=>s.has(t))) return true;
      }
      /* Deliberately does NOT treat a listener on document or window as
         wiring. app.js binds a global keydown for Escape and tab-trapping, so
         accepting those would mark every button on the site as handled and the
         sweep would never fail again. Document-level delegation would have to
         be recognised some other way; this codebase binds to elements. */
      return false;
    };
    document.querySelectorAll("button, a").forEach(el=>{
      if (!vis(el)) return;
      const tag=el.tagName, cls=(el.className||"").toString().trim().split(/\s+/)[0]||"";
      const label=(el.getAttribute("aria-label")||el.textContent||"").trim().replace(/\s+/g," ").slice(0,34);
      const href=el.getAttribute("href");
      let dead=false, why="";
      if (tag==="A") {
        if (!href || href==="#" || href==="") { dead=true; why="no href"; }
        else if (href.startsWith("#") && !document.querySelector(href) && href!=="#main") { dead=true; why="anchor target missing: "+href; }
      } else {
        // el.type defaults to "submit" for a <button> with no type attribute,
        // which silently exempted almost every button. Read the attribute.
        const typeAttr = (el.getAttribute("type")||"").toLowerCase();
        const realSubmit = typeAttr==="submit" && el.closest("form");
        if (!wired(el) && !realSubmit) { dead=true; why="button with no handler"; }
      }
      if (dead) out.push({tag,cls,label,href:href||"",why});
    });
    return out;
  });
  rows.forEach(r=>{
    const k=`${r.tag}|${r.cls}|${r.label}|${r.why}`;
    if(!seen.has(k)) seen.set(k,{...r,pages:new Set()});
    seen.get(k).pages.add(name);
  });
}
await b.close();
const all=[...seen.values()];
console.log(`  ${all.length} distinct dead controls\n`);
for (const r of all) console.log(`  ${r.tag.padEnd(6)} ${(r.cls||"—").padEnd(16)} ${(r.label||"—").padEnd(36)} ${r.why.padEnd(34)} [${[...r.pages].join(",")}]`);
process.exit(all.length ? 1 : 0);
