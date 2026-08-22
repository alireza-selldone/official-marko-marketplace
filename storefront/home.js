import { loadCatalog, loadTaggedProductIds, money, promotionSafeProducts } from "./shop-data.js";
import { cardHTML, esc } from "./app.js";
import { shopConfig } from "./shop-config.js";

/* ---------- Hero ----------
   Editorial copy paired with the three shipped 1920x1080 stage images. The
   copy is presentation, but every DESTINATION is resolved from the live
   catalog at runtime: a slide declares the kind of shopping it points at and
   `resolveStoryHref()` turns that into a route the current shop actually has.
   Nothing here names a product, a price, a seller or a category count, so a
   cloned shop cannot inherit a link that 404s or a claim that is untrue. */
const HERO_STORIES = [
  {
    id: "performance", kicker: "Men's performance",
    titleLines: ["Built for the", "work. Ready", "for the day."],
    lede: "Performance essentials selected for movement, focus, and every plan after training.",
    label: "Shop men's performance", intent: { audience: "men" },
    background: "assets/hero/marko-mens-performance-hd-v4.webp",
    backgroundAlt: "Athlete training in a modern gym",
  },
  {
    id: "home-cinema", kicker: "Premium home cinema",
    titleLines: ["Upgrade the room", "everyone", "lives in."],
    lede: "Premium viewing selected to make every movie, match, and evening feel bigger.",
    label: "Shop home cinema", intent: { kind: "tech", label: "Home cinema" },
    background: "assets/hero/marko-premium-tv-hd-v4.webp",
    backgroundAlt: "Television in a modern living room",
  },
  {
    id: "kids-play", kicker: "Kids' everyday",
    titleLines: ["Made for play.", "Ready for", "anything."],
    lede: "Comfortable styles picked for busy days, big imaginations, and every adventure.",
    label: "Shop kids", intent: { audience: "kids" },
    background: "assets/hero/marko-kids-play-hd-v4.webp",
    backgroundAlt: "Children playing together in a bright playroom",
  },
];

const TECH_DEPARTMENT = /\b(?:tech|electronic|audio|headphones?|earbuds?|speakers?|display|tvs?|television|monitors?|laptops?|computers?|cameras?|phones?|mobile|gaming)\b/i;
const isTechGroup = (group) => TECH_DEPARTMENT.test(`${group.slug} ${group.name}`);

/* A hero destination only survives if the live catalog can serve it. */
function resolveStoryHref(story, catalog) {
  const { audience, kind, label } = story.intent || {};
  if (audience && catalog?.audiences?.some((row) => row.slug === audience && row.count > 0)) {
    return `shop.html?audience=${encodeURIComponent(audience)}`;
  }
  if (kind === "tech") {
    const slugs = (catalog?.cats || []).filter(isTechGroup).map((row) => row.slug);
    if (slugs.length) {
      return `shop.html?cats=${encodeURIComponent(slugs.join(","))}&label=${encodeURIComponent(label || "Technology")}`;
    }
  }
  return "shop.html";
}

function renderHero() {
  const root = document.querySelector("[data-market-hero]");
  const art = document.querySelector("[data-market-hero-art]");
  const dots = document.querySelector("[data-market-hero-dots]");
  if (!root || !art || !dots) return () => {};

  const stories = HERO_STORIES;
  const params = new URLSearchParams(location.search);
  const requested = Number(params.get("hero") || 1) - 1;
  const autoplay = !params.has("qa") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let active = requested >= 0 && requested < stories.length ? requested : 0;
  let timer;
  let catalog = null;

  const paint = (index, restart = true) => {
    active = (index + stories.length) % stories.length;
    const story = stories[active];
    root.querySelector("[data-hero-kicker]").textContent = story.kicker;
    root.querySelector("[data-hero-title]").innerHTML = story.titleLines.map((line) => `<span>${esc(line)}</span>`).join("");
    root.querySelector("[data-hero-lede]").textContent = story.lede;
    const link = root.querySelector("[data-hero-link]");
    link.textContent = story.label;
    link.href = resolveStoryHref(story, catalog);
    art.innerHTML = `<div class="market-hero__scene"><img src="${esc(story.background)}" alt="${esc(story.backgroundAlt)}" width="1920" height="1080" loading="eager" fetchpriority="high"></div>`;
    dots.querySelectorAll("button").forEach((button, dotIndex) => button.setAttribute("aria-current", String(dotIndex === active)));
    root.dataset.story = story.id;
    if (restart) {
      clearInterval(timer);
      if (autoplay) timer = setInterval(() => paint(active + 1, false), 7000);
    }
  };

  dots.innerHTML = stories.map((story, index) =>
    `<button type="button" aria-label="Show ${esc(story.kicker)} slide" aria-current="${index === active}"></button>`).join("");
  dots.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) paint([...dots.children].indexOf(button));
  });
  root.querySelector("[data-hero-prev]")?.addEventListener("click", () => paint(active - 1));
  root.querySelector("[data-hero-next]")?.addEventListener("click", () => paint(active + 1));
  paint(active);

  /* The catalog arrives after first paint; re-resolving keeps the CTA honest
     without re-rendering the stage and re-triggering the image load. */
  return (loaded) => {
    catalog = loaded;
    const link = root.querySelector("[data-hero-link]");
    if (link) link.href = resolveStoryHref(stories[active], catalog);
  };
}

const titleCase = (value) => String(value || "")
  .replace(/[-_]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

/* Selldone catalog cutouts are often JPGs with white baked into the pixels.
   For promo tiles only, remove near-white pixels that are connected to an
   image edge. This keeps white details inside a product intact, works for a
   cloned catalog, and avoids treating the JPG rectangle as a paper card. */
async function removePromoImageBackground(image) {
  if (!image?.src || image.dataset.bgStatus) return;
  image.dataset.bgStatus = "loading";
  try {
    if (!image.complete || !image.naturalWidth) {
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", reject, { once: true });
      });
    }
    const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    const pixels = frame.data;
    const total = width * height;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    /* Catalog backdrops are not always near-white: a grey studio sweep is
       common, and the original near-white thresholds left it in place, which
       painted a pale rectangle onto the tile. The window is wide enough to
       take a light grey sweep and still narrow enough that the fill stops at
       a product edge. It only ever runs from the border inwards, so light
       greys enclosed by the product are untouched. */
    const canRemove = (index, seed = false) => {
      const offset = index * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (alpha < 12) return true;
      const floor = Math.min(red, green, blue);
      const ceiling = Math.max(red, green, blue);
      return floor >= (seed ? 206 : 184) && ceiling - floor <= (seed ? 26 : 42);
    };
    const enqueue = (index, seed = false) => {
      if (index < 0 || index >= total || visited[index] || !canRemove(index, seed)) return;
      visited[index] = 1;
      queue[tail++] = index;
    };
    for (let x = 0; x < width; x++) { enqueue(x, true); enqueue((height - 1) * width + x, true); }
    for (let y = 0; y < height; y++) { enqueue(y * width, true); enqueue(y * width + width - 1, true); }
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      pixels[index * 4 + 3] = 0;
      if (x) enqueue(index - 1);
      if (x + 1 < width) enqueue(index + 1);
      if (y) enqueue(index - width);
      if (y + 1 < height) enqueue(index + width);
    }
    context.putImageData(frame, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .92));
    if (!blob) throw new Error("Promo cutout conversion failed");
    /* Completing the pass is not the same as succeeding at it. A photograph
       shot against a dark or textured backdrop clears almost nothing, and the
       caller needs to know that so it can try a different product rather than
       place a rectangle on the tile. */
    image.dataset.bgCleared = (tail / total).toFixed(3);
    const original = image.src;
    const objectUrl = URL.createObjectURL(blob);
    image.src = objectUrl;
    image.dataset.originalSrc = original;
    image.dataset.bgStatus = "removed";
    image.addEventListener("error", () => { image.src = original; image.dataset.bgStatus = "fallback"; }, { once: true });
  } catch (error) {
    image.dataset.bgStatus = "fallback";
    console.warn("[marko] could not remove a promotional image background", error);
  }
}

/* Not every catalog photograph cuts out cleanly: an image whose backdrop is a
   light grey studio sweep rather than near-white survives the flood fill and
   would render as a pale rectangle sitting on the tile. Promotional placements
   may not use a paper card to hide that, so the tile swaps in the next ranked
   candidate from the same department instead and tries again. A tile that
   exhausts its candidates keeps the last one rather than emptying the grid. */
const CUTOUT_MIN_CLEARED = .1;

async function ensurePromoCutout(image) {
  let alternates = [];
  try { alternates = JSON.parse(image.dataset.promoAlts || "[]"); } catch { alternates = []; }
  const original = { src: image.getAttribute("src"), name: image.dataset.promoName };
  let best = null;
  for (let attempt = 0; ; attempt++) {
    await removePromoImageBackground(image);
    const cleared = Number(image.dataset.bgCleared || 0);
    const worked = image.dataset.bgStatus === "removed" && cleared >= CUTOUT_MIN_CLEARED;
    if (worked) return;
    if (!best || cleared > best.cleared) {
      best = { cleared, src: attempt ? alternates[attempt - 1].src : original.src, name: image.dataset.promoName };
    }
    if (attempt >= alternates.length) {
      /* Nothing in this department separates cleanly. Keep whichever candidate
         came closest and mark it, so QA reports a real fallback rather than a
         success that visibly is not one. */
      delete image.dataset.bgStatus;
      image.dataset.promoName = best.name;
      image.src = best.src;
      await removePromoImageBackground(image);
      if (Number(image.dataset.bgCleared || 0) < CUTOUT_MIN_CLEARED) image.dataset.bgStatus = "fallback";
      return;
    }
    const next = alternates[attempt];
    delete image.dataset.bgStatus;
    image.dataset.promoName = next.name;
    image.src = next.src;
  }
}

function preparePromoCutouts(root) {
  root.querySelectorAll("[data-promo-product]").forEach(ensurePromoCutout);
}

/* ---------- Ranking ---------- */
const discountRate = (product) => (product.was > product.price ? (product.was - product.price) / product.was : 0);
const salesScore = (product) => Number(product.raw?.sells ?? product.raw?.sold ?? product.raw?.sales_count ?? product.raw?.orders_count ?? 0);
const productScore = (product) => salesScore(product) * 1000 + Number(product.rateCount || 0) * 10 + Number(product.rate || 0) + discountRate(product);
const rankedProducts = (products) => [...products].sort((left, right) => productScore(right) - productScore(left) || Number(right.id) - Number(left.id));
const sellableProducts = (catalog) => {
  const stocked = catalog.products.filter((product) => product.qty > 0 || product.variants?.some((variant) => variant.qty > 0));
  return stocked.length >= 6 ? stocked : catalog.products;
};

function categoryGroups(catalog, products) {
  return catalog.cats.map((category) => {
    const rows = products.filter((product) => product.cat === category.slug);
    return { ...category, products: rankedProducts(rows) };
  }).filter((category) => category.products.length)
    .sort((left, right) => right.products.length - left.products.length || left.name.localeCompare(right.name));
}

/* A module that cannot be filled honestly is removed rather than padded. */
const dropModule = (element) => element?.closest(".home-module")?.remove();

/* ---------- Modules ---------- */
function renderRail(root, products, clearanceIds) {
  root.innerHTML = products.map((product) => cardHTML(product, {
    badge: clearanceIds.has(Number(product.id)) ? "Clearance" : "",
  })).join("");
}

function renderDeals(products, clearanceIds) {
  const root = document.querySelector("[data-home-deals]");
  if (!root) return;
  const discounted = rankedProducts(products.filter((product) => product.was > product.price));
  /* "Today's best prices" is a claim. With too few live discounts to support
     it the section is removed, not filled with full-price stock. */
  if (discounted.length < 4) { dropModule(root); return; }
  renderRail(root, discounted.slice(0, 6), clearanceIds);
}

function renderBrandProducts(catalog, products, clearanceIds) {
  const root = document.querySelector("[data-home-brand-products]");
  if (!root) return;
  const chosen = [];
  const used = new Set();
  [...catalog.brands].sort((a, b) => Number(b.count) - Number(a.count)).forEach((brand) => {
    const product = rankedProducts(products.filter((item) => item.brand === brand.name))[0];
    if (product && !used.has(product.id) && chosen.length < 6) { chosen.push(product); used.add(product.id); }
  });
  rankedProducts(products).forEach((product) => {
    if (!used.has(product.id) && chosen.length < 6) { chosen.push(product); used.add(product.id); }
  });
  if (!chosen.length) { dropModule(root); return; }
  renderRail(root, chosen, clearanceIds);
}

function renderSavings(groups, clearanceIds) {
  const root = document.querySelector("[data-home-savings-groups]");
  if (!root) return;
  const discounted = groups
    .map((group) => ({ ...group, offerProducts: group.products.filter((product) => product.was > product.price) }))
    .filter((group) => group.offerProducts.length >= 4)
    .sort((left, right) => right.offerProducts.length - left.offerProducts.length);
  if (discounted.length < 2) { dropModule(root); return; }
  root.innerHTML = discounted.slice(0, 4).map((group) => `
    <article class="home-savings-panel">
      <header><b>${esc(group.name)}</b><a href="shop.html?cat=${encodeURIComponent(group.slug)}">View all</a></header>
      <div>${group.offerProducts.slice(0, 4).map((product) => cardHTML(product, {
        compact: true,
        badge: clearanceIds.has(Number(product.id)) ? "Clearance" : "",
      })).join("")}</div>
    </article>`).join("");
}

function renderLineup(groups, clearanceIds) {
  const group = groups.find((item) => item.products.length >= 4) || groups[0];
  const productsRoot = document.querySelector("[data-home-lineup-products]");
  if (!group || !productsRoot) { dropModule(productsRoot); return; }
  const title = document.querySelector("[data-home-lineup-title]");
  const kicker = document.querySelector("[data-home-lineup-kicker]");
  const link = document.querySelector("[data-home-lineup-link]");
  const featureRoot = document.querySelector("[data-home-lineup-feature]");
  const href = `shop.html?cat=${encodeURIComponent(group.slug)}`;
  if (title) title.textContent = `The ${group.name.toLowerCase()} lineup`;
  if (kicker) kicker.textContent = "Featured department";
  if (link) link.href = href;
  productsRoot.innerHTML = group.products.slice(0, 3).map((product) => cardHTML(product, {
    badge: clearanceIds.has(Number(product.id)) ? "Clearance" : "",
  })).join("");
  const feature = group.products[3] || group.products[0];
  const from = Number(group.from) || Number(feature.range?.from) || Number(feature.price);
  if (featureRoot) {
    featureRoot.innerHTML = `<a href="${href}">
      <div>
        <small>Featured department</small>
        <h3>${esc(group.name)} worth a closer look</h3>
        <span>Shop now</span>
        <b>Starting at <strong>${money(from)}</strong></b>
      </div>
      <figure><img src="${esc(feature.image)}" alt="" loading="lazy" width="760" height="560"></figure>
    </a>`;
  }
}

const DEPARTMENT_TILE_CAP = 8;

function renderDepartments(groups) {
  const root = document.querySelector("[data-home-departments]");
  if (!root) return;
  const shown = groups.slice(0, DEPARTMENT_TILE_CAP);
  /* The track width follows the live department count so a small catalog gets
     full-width tiles instead of narrow ones padded out by empty columns. */
  root.style.setProperty("--dept-cols", String(shown.length));
  root.dataset.n = String(shown.length);
  root.innerHTML = shown.map((group) =>
    `<a class="home-dept-card" href="shop.html?cat=${encodeURIComponent(group.slug)}">
      <span><img src="${esc(group.image || group.products[0]?.image)}" alt="" loading="lazy" width="200" height="200"></span>
      <b>${esc(group.name)}</b>
    </a>`).join("");
}

/* ---------- Promotional grid ----------
   Five live departments. The tall tile carries a considered pair; every other
   tile carries one deliberately chosen subject rather than a scatter of
   cutouts. Headlines take their price hook from the live catalog. */
const mosaicEyebrows = ["Picked for today", "Just in", "Smart value", "Trending now", "More to explore"];
const POSTER_COUNTS = [2, 1, 1, 1, 1];

function chooseMosaicGroups(groups) {
  const tech = groups.filter(isTechGroup);
  const nonTech = groups.filter((group) => !tech.includes(group));
  const chosen = [];
  const add = (group) => { if (group && !chosen.includes(group)) chosen.push(group); };
  add(nonTech[0] || groups[0]);
  nonTech.slice(1, 4).forEach(add);
  add(tech[0]);
  groups.forEach((group) => { if (chosen.length < 5) add(group); });
  /* Technology keeps a tile whenever the live catalog has one, rather than
     letting a high-volume fashion department consume all five. */
  if (tech[0] && chosen.length >= 5) {
    const priorIndex = chosen.indexOf(tech[0]);
    if (priorIndex >= 0) chosen.splice(priorIndex, 1);
    chosen.splice(4, 0, tech[0]);
  }
  return chosen.slice(0, 5);
}

/* Department name on one line, live price hook on the next. A single
   consistent construction reads as a designed system rather than five
   differently-phrased sentences, and it keeps every tile to two short lines
   whatever the department is called. The price is always live. */
function mosaicHeadline(group) {
  const livePrices = group.products
    .map((product) => Number(product.range?.from || product.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const from = livePrices.length ? money(Math.min(...livePrices)) : "";
  return `${esc(group.name)}${from ? `<em>from ${esc(from)}</em>` : ""}`;
}

function renderMosaic(groups) {
  const root = document.querySelector("[data-home-mosaic]");
  if (!root) return;
  const chosen = chooseMosaicGroups(groups);
  if (chosen.length < 5) { dropModule(root); return; }
  root.innerHTML = chosen.map((group, index) => {
    const posterCount = POSTER_COUNTS[index];
    const posterProducts = group.products.slice(0, posterCount);
    /* Reserve the rest of the department as cutout fallbacks, so a photograph
       that will not separate from its backdrop can be replaced at runtime.
       Each poster gets its own slice so a tile with two subjects cannot fall
       back to the same product twice. */
    const alternatesFor = (posterIndex) => group.products
      .slice(posterCount + posterIndex * 4, posterCount + posterIndex * 4 + 4)
      .map((product) => ({ src: product.image, name: product.name }));
    const ctaClass = index === 0 ? "home-promo-card__cta home-promo-card__cta--pill" : "home-promo-card__cta";
    return `<a class="home-promo-card home-promo-card--${index + 1}" data-bento-tile data-bento-tech="${isTechGroup(group)}" href="shop.html?cat=${encodeURIComponent(group.slug)}">
      <div class="home-promo-card__copy">
        <small>${esc(mosaicEyebrows[index])}</small>
        <h3>${mosaicHeadline(group)}</h3>
        <span class="${ctaClass}">Shop now</span>
      </div>
      <span class="home-poster-art" aria-hidden="true">${posterProducts.map((product, productIndex) =>
        `<img class="home-poster-product home-poster-product--${productIndex + 1}" data-promo-product data-promo-name="${esc(product.name)}" data-promo-alts="${esc(JSON.stringify(alternatesFor(productIndex)))}" crossorigin="anonymous" src="${esc(product.image)}" alt="" loading="eager" fetchpriority="low" width="680" height="560">`).join("")}</span>
    </a>`;
  }).join("");
  preparePromoCutouts(root);
}

/* ---------- Loading and failure states ---------- */
const skeletonCards = (count, compact = false) => Array.from({ length: count }, () =>
  `<span class="home-skeleton-card${compact ? " home-skeleton-card--compact" : ""}"><i></i><b></b><small></small></span>`).join("");

function renderLoadingLayout() {
  const set = (selector, html) => { const node = document.querySelector(selector); if (node) node.innerHTML = html; };
  set("[data-home-deals]", skeletonCards(6));
  set("[data-home-brand-products]", skeletonCards(6));
  set("[data-home-lineup-products]", skeletonCards(3));
  set("[data-home-departments]", skeletonCards(8, true));
  set("[data-home-savings-groups]", Array.from({ length: 4 }, () => `<span class="home-skeleton-panel"></span>`).join(""));
  set("[data-home-mosaic]", Array.from({ length: 5 }, (_, index) => `<span class="home-skeleton-promo home-promo-card--${index + 1}"></span>`).join(""));
}

function renderCatalogUnavailable(catalog) {
  const root = document.querySelector("[data-home-departments]");
  const categories = (catalog?.cfg?.categories || []).slice(0, DEPARTMENT_TILE_CAP);
  if (root && categories.length) {
    root.style.setProperty("--dept-cols", String(categories.length));
    root.dataset.n = String(categories.length);
    root.innerHTML = categories.map((category) =>
      `<a class="home-dept-card home-dept-card--text" href="shop.html?cat=${encodeURIComponent(category.slug)}">
        <span>${esc(titleCase(category.slug).slice(0, 1))}</span><b>${esc(titleCase(category.slug))}</b>
      </a>`).join("");
  } else if (root) {
    /* No live departments and no configured fallback: a section heading over an
       empty grid is worse than no section, so the whole block goes. */
    const section = root.closest("section");
    if (section) section.hidden = true;
  }
  /* Every module that would otherwise sit on a spinner forever is removed, so
     a slow or unavailable catalog degrades to a navigable page. */
  ["[data-home-deals]", "[data-home-brand-products]", "[data-home-savings-groups]",
    "[data-home-mosaic]", "[data-home-lineup-products]"].forEach((selector) => {
    dropModule(document.querySelector(selector));
  });
  const message = document.querySelector("[data-catalog-error]");
  if (message) {
    message.hidden = false;
    message.textContent = "Live products are temporarily unavailable. The marketplace will refresh them automatically.";
  }
}

function renderMarketplaceModules(catalog, clearanceIds = new Set()) {
  const products = promotionSafeProducts(sellableProducts(catalog));
  const groups = categoryGroups(catalog, products);
  if (!products.length || !groups.length) { renderCatalogUnavailable(catalog); return; }
  renderDepartments(groups);
  renderDeals(products, clearanceIds);
  renderMosaic(groups);
  renderLineup(groups, clearanceIds);
  renderBrandProducts(catalog, products, clearanceIds);
  renderSavings(groups, clearanceIds);
}

renderLoadingLayout();
const onCatalogReady = renderHero();

loadCatalog().then(async (catalog) => {
  onCatalogReady(catalog);
  let clearanceIds = new Set();
  try {
    clearanceIds = new Set(await loadTaggedProductIds("clearance"));
  } catch (error) {
    console.warn("[marko] clearance tags are temporarily unavailable; no clearance badges will be shown", error);
  }
  renderMarketplaceModules(catalog, clearanceIds);
}).catch(async (error) => {
  console.error(error);
  renderCatalogUnavailable({ cfg: await shopConfig() });
  const message = document.querySelector("[data-catalog-error]");
  if (message) {
    message.hidden = false;
    message.textContent = "The live catalog could not be loaded. Please try again shortly.";
  }
});
