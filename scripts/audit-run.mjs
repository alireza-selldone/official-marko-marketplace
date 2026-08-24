import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* _audit.js is deliberately NOT deployed — it must not be publicly reachable —
   so importing it from the page only works locally. Injecting its source
   instead lets the same checks run against any deployment without shipping the
   harness. The `export` keyword is stripped so it evaluates as a plain script. */
const AUDIT_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "storefront", "_audit.js"),
  "utf8",
).replace(/^export\s+/gm, "");
/* Base URL is argv[2], so this runs against a preview or the live site
   as well as the local dev server: node scripts/audit-run.mjs https://… */

const BASE = (process.argv[2] || "http://localhost:8788").replace(/\/+$/, "");
const PAGES=[["home","/","#catgrid .home-dept-card"],["shop","/shop.html","#pgrid .pcard"],
             ["product","/product.html?id=711002","#pdp h1"],["checkout","/checkout.html","#continueCheckout"],
             ["about","/about-us",".prose h2"],["terms","/terms",".prose h2"],
             ["privacy","/privacy",".prose h2"],["contact","/contact-us",".prose h2"],
             ["blog","/blog",".post"],["article","/article.html?id=31667","[data-article-body] p"],
             ["brands","/brands.html",".brand-directory a"],
             ["sellers","/vendors.html","[data-vendor-directory] article"],
             ["alio","/vendor.html?vendor=alio","[data-vendor-products] .pcard"],
             ["merino","/vendor.html?vendor=merino","[data-vendor-products] .pcard"]];
const WIDTHS=[1440,1024,768,390];
const BAG=JSON.stringify([{id:711002,qty:1,variantId:1406480}]);
const b=await chromium.launch();
let allPass=true; const rows=[];

/* Each BrowserContext starts with an empty HTTP cache, so every third-party
   response was refetched for all eleven widths and the run crawled — over an
   hour. Two offenders: the four Google Font families, and the catalogue, since
   each of the 88 page loads calls XAPI twice and Selldone throttles ~176
   requests in a few minutes. Both are replayed from an in-process cache.

   Caching the catalogue also makes the matrix deterministic: the first request
   is real, and every width afterwards measures layout against identical data
   rather than against whatever the shop returned that minute. */
const fontCache=new Map();
async function cacheThirdParty(ctx){
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|xapi\.selldone\.com/,async(route)=>{
    const url=route.request().url();
    if(!fontCache.has(url)){
      // Cache successes only. Memoising a failure replays one unlucky fetch
      // into all 110 states: a single throttled font 404 failed the whole
      // matrix while the site was healthy, and the font it blamed changed
      // run to run because a different request lost the race each time.
      // A miss here costs one refetch; a poisoned entry costs the run.
      let entry=null;
      try{
        const res=await route.fetch();
        if(res.status()<400){
          const headers={...res.headers()};
          // body() is already decoded; leaving these would describe it wrongly.
          delete headers["content-encoding"]; delete headers["content-length"];
          entry={status:res.status(),headers,body:await res.body()};
        }
      }catch{/* transient: fall through to a live request */}
      if(!entry){ await route.fallback(); return; }
      fontCache.set(url,entry);
    }
    await route.fulfill(fontCache.get(url));
  });
}

for(const w of WIDTHS){
  // one context per width, so no scroll/localStorage state leaks between them
  const ctx=await b.newContext({viewport:{width:w,height:w===390?844:w===768?1024:900}});
  await cacheThirdParty(ctx);
  await ctx.addInitScript(v=>localStorage.setItem("storefront_bag_v1",v),BAG);
  for(const [name,url,ready] of PAGES){
    const p=await ctx.newPage();
    const errs=[]; p.on("console",m=>{if(m.type()==="error")errs.push(m.text());});
    p.on("requestfailed",r=>errs.push("REQFAIL "+r.url()));
    await p.goto(BASE+url,{waitUntil:"domcontentloaded"});
    await p.waitForSelector(ready,{timeout:20000,state:"attached"});
    // networkidle can never settle if a third-party font/XAPI socket lingers;
    // it defaults to 30s per page, which wedges an 88-state matrix.
    await p.waitForLoadState("networkidle",{timeout:6000}).catch(()=>{});
    await p.evaluate(async()=>{const s=Math.round(innerHeight*.6);
      for(let y=0;y<document.documentElement.scrollHeight;y+=s){scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}
      scrollTo(0,0);await new Promise(r=>setTimeout(r,300));});
    await p.waitForTimeout(300);
    // The font check reads FontFace.status, so it has to run after loading
    // settles or it measures the race instead of the page. Bounded: a genuinely
    // missing font must still fail the check rather than hang the matrix.
    await p.evaluate(()=>Promise.race([document.fonts.ready,
      new Promise(r=>setTimeout(r,5000))])).catch(()=>{});
    const r=await p.evaluate((src)=>{ eval(src); return audit(); }, AUDIT_SRC);
    if(errs.length) r.failures.push({check:"console-or-request-error",detail:errs.slice(0,3)});
    r.pass=r.failures.length===0;
    if(!r.pass) allPass=false;
    const row=`${name.padEnd(9)} ${String(w).padStart(5)}  ${r.pass?"pass":"FAIL "+JSON.stringify(r.failures).slice(0,180)}`;
    rows.push(row); console.log("  "+row);  // stream, so a stall is visible where it happens
    await p.close();
  }
  await ctx.close();
}
await b.close();
const fails=rows.filter(r=>r.includes("FAIL")).length;
// Count the rows actually run. This said "ALL 44 PASS" from when the matrix was
// four pages, and kept saying it after it grew to eight.
console.log(allPass?`\nALL ${rows.length} PASS`:`\n${fails} FAILURE(S) of ${rows.length}`);
process.exit(allPass?0:1);
