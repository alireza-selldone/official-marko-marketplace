import { loadCatalog, loadTaggedProductIds, money, promotionSafeProducts } from "./shop-data.js";
import { esc } from "./app.js";
import { shopConfig } from "./shop-config.js";

const HERO_STORIES = [
  {
    id: "performance", kicker: "Men's performance", title: "Built for the work. Ready for the day.",
    titleLines: ["Built for the", "work. Ready", "for the day."],
    lede: "Performance essentials selected for movement, focus, and every plan after training.",
    label: "Shop men's performance", href: "shop.html?audience=men&cats=activewear%2Cfootwear%2Csunglasses&label=Men%27s%20performance",
    background: "assets/hero/marko-mens-performance-hd-v4.webp",
    backgroundAlt: "Male athlete training in a premium modern gym",
  },
  {
    id: "home-cinema", kicker: "Premium home cinema", title: "Upgrade the room everyone lives in.",
    titleLines: ["Upgrade the room", "everyone", "lives in."],
    lede: "Premium viewing selected to make every movie, match, and evening feel bigger.",
    label: "Shop this TV", href: "product.html?id=710829&variant=1405623",
    background: "assets/hero/marko-premium-tv-hd-v4.webp",
    backgroundAlt: "Premium television in a modern living room",
  },
  {
    id: "kids-play", kicker: "Kids' everyday", title: "Made for play. Ready for anything.",
    titleLines: ["Made for play.", "Ready for", "anything."],
    lede: "Comfortable styles picked for busy days, big imaginations, and every adventure.",
    label: "Shop kids", href: "shop.html?audience=kids",
    background: "assets/hero/marko-kids-play-hd-v4.webp",
    backgroundAlt: "Children playing together in a bright wholesome playroom",
  },
];

function renderHero() {
  const root = document.querySelector("[data-market-hero]");
  const art = document.querySelector("[data-market-hero-art]");
  const dots = document.querySelector("[data-market-hero-dots]");
  if (!root || !art || !dots) return;
  const stories = HERO_STORIES;
  const requestedSlide = Number(new URLSearchParams(location.search).get("hero") || 1) - 1;
  const autoplay = !new URLSearchParams(location.search).has("qa") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let active = requestedSlide >= 0 && requestedSlide < stories.length ? requestedSlide : 0;
  let timer;
  const paint = (index, restart = true) => {
    active = (index + stories.length) % stories.length;
    const story = stories[active];
    root.querySelector("[data-hero-kicker]").textContent = story.kicker;
    root.querySelector("[data-hero-title]").innerHTML = story.titleLines.map((line) => `<span>${esc(line)}</span>`).join("");
    root.querySelector("[data-hero-lede]").textContent = story.lede;
    const link = root.querySelector("[data-hero-link]");
    link.textContent = story.label;
    link.href = story.href;
    art.innerHTML = `<div class="market-hero__scene"><img src="${esc(story.background)}" alt="${esc(story.backgroundAlt)}" width="1920" height="1080" loading="eager" fetchpriority="high"></div>`;
    dots.querySelectorAll("button").forEach((button, dotIndex) => button.setAttribute("aria-current", String(dotIndex === active)));
    root.dataset.story = story.id;
    if (restart) {
      clearInterval(timer);
      if (autoplay) timer = setInterval(() => paint(active + 1, false), 7000);
    }
  };
  dots.innerHTML = stories.map((story, index) => `<button type="button" aria-label="Show ${esc(story.kicker)} slide" aria-current="${index === active}"></button>`).join("");
  dots.addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) paint([...dots.children].indexOf(button)); });
  paint(active);

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
    const canRemove = (index, seed = false) => {
      const offset = index * 4;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (alpha < 12) return true;
      const floor = Math.min(red, green, blue);
      const ceiling = Math.max(red, green, blue);
      return floor >= (seed ? 235 : 210) && ceiling - floor <= (seed ? 24 : 38);
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

function preparePromoCutouts(root) {
  root.querySelectorAll("[data-promo-product]").forEach(removePromoImageBackground);
}

const discountRate = (product) => product.was > product.price ? (product.was - product.price) / product.was : 0;
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
    return { ...category, products: rankedProducts(rows), count: rows.length || Number(category.count) || 0 };
  }).filter((category) => category.products.length)
    .sort((left, right) => right.products.length - left.products.length || left.name.localeCompare(right.name));
}

const productPriceHTML = (product) => {
  const price = product.range?.varies ? `From ${money(product.range.from)}` : money(product.price);
  return `<strong${product.was ? ' class="is-saving"' : ""}>${product.was ? "Now " : ""}${price}</strong>${product.was ? `<s>${money(product.was)}</s>` : ""}`;
};

function merchCard(product, { compact = false, badge = "" } = {}) {
  return `<article class="home-merch-card${compact ? " home-merch-card--compact" : ""}" data-home-product="${product.id}">
    <a href="product.html?id=${product.id}" aria-label="${esc(product.name)}">
      <figure>${badge ? `<em>${esc(badge)}</em>` : ""}<span class="home-merch-card__heart" aria-hidden="true">♡</span><img src="${esc(product.image)}" alt="" loading="lazy" width="440" height="440"></figure>
      <span class="home-merch-card__action">${product.variants?.length ? "Options" : "View item"}</span>
      <span class="home-merch-card__price">${productPriceHTML(product)}</span>
      <span class="home-merch-card__name">${esc(product.name)}</span>
    </a>
  </article>`;
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
  root.innerHTML = chosen.map((product) => merchCard(product, {
    badge: clearanceIds.has(Number(product.id)) ? "Clearance" : "",
  })).join("");
}

function renderSavings(groups) {
  const root = document.querySelector("[data-home-savings-groups]");
  if (!root) return;
  const discounted = groups.map((group) => ({ ...group, offerProducts: group.products.filter((product) => product.was) }))
    .filter((group) => group.offerProducts.length >= 2)
    .sort((left, right) => right.offerProducts.length - left.offerProducts.length);
  const source = discounted.length >= 3 ? discounted : groups.filter((group) => group.products.length >= 2);
  root.innerHTML = source.slice(0, 5).map((group) => {
    const products = (group.offerProducts?.length ? group.offerProducts : group.products).slice(0, 4);
    const badge = group.offerProducts?.length ? "Saving" : "Featured";
    return `<article class="home-savings-panel"><header><b>${esc(group.name)}</b><a href="shop.html?cat=${encodeURIComponent(group.slug)}">View all</a></header><div>${products.map((product) => merchCard(product, { compact: true, badge })).join("")}</div></article>`;
  }).join("");
}

function renderLineup(groups) {
  const group = groups.find((item) => item.products.length >= 4) || groups[0];
  if (!group) return;
  const title = document.querySelector("[data-home-lineup-title]");
  const kicker = document.querySelector("[data-home-lineup-kicker]");
  const link = document.querySelector("[data-home-lineup-link]");
  const productsRoot = document.querySelector("[data-home-lineup-products]");
  const featureRoot = document.querySelector("[data-home-lineup-feature]");
  const href = `shop.html?cat=${encodeURIComponent(group.slug)}`;
  if (title) title.textContent = `The ${group.name.toLowerCase()} lineup`;
  if (kicker) kicker.textContent = "Featured department";
  if (link) link.href = href;
  if (productsRoot) productsRoot.innerHTML = group.products.slice(0, 3).map((product) => merchCard(product)).join("");
  const feature = group.products[3] || group.products[0];
  if (featureRoot) featureRoot.innerHTML = `<a href="${href}"><div><small>Featured department</small><h3>${esc(group.name)}<br>worth a closer look</h3><span>Shop now</span></div><b>From<strong>${money(group.from || feature.price)}</strong></b><img src="${esc(feature.image)}" alt="" loading="lazy" width="760" height="560"></a>`;
}

function renderDepartments(groups) {
  const root = document.querySelector("[data-home-departments]");
  if (!root) return;
  root.innerHTML = groups.slice(0, 10).map((group) => `<a class="home-dept-card" href="shop.html?cat=${encodeURIComponent(group.slug)}"><span><img src="${esc(group.image || group.products[0]?.image)}" alt="" loading="lazy" width="180" height="150"></span><b>${esc(group.name)}</b></a>`).join("");
}

const TECH_DEPARTMENT = /\b(?:tech|electronic|audio|headphones?|earbuds?|speakers?|display|tvs?|television|monitors?|laptops?|computers?|cameras?|phones?|mobile|gaming)\b/i;
const mosaicEyebrows = ["Picked for today", "Just in", "Smart value", "Trending now", "More to explore"];

function chooseMosaicGroups(groups) {
  const tech = groups.filter((group) => TECH_DEPARTMENT.test(`${group.slug} ${group.name}`));
  const nonTech = groups.filter((group) => !tech.includes(group));
  const chosen = [];
  const add = (group) => { if (group && !chosen.includes(group)) chosen.push(group); };
  add(nonTech[0] || groups[0]);
  nonTech.slice(1, 4).forEach(add);
  add(tech[0]);
  groups.forEach((group) => { if (chosen.length < 5) add(group); });
  /* The right-hand tall tile represents technology whenever the live catalog
     contains it, rather than allowing high-volume fashion to consume all five. */
  if (tech[0] && chosen.length >= 5) {
    const priorIndex = chosen.indexOf(tech[0]);
    if (priorIndex >= 0) chosen.splice(priorIndex, 1);
    chosen.splice(4, 0, tech[0]);
  }
  return chosen.slice(0, 5);
}

function mosaicHeadline(group, index) {
  const livePrices = group.products
    .map((product) => Number(product.range?.from || product.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const from = livePrices.length ? money(Math.min(...livePrices)) : "";
  const name = group.name;
  const lowerName = name.toLocaleLowerCase();
  const patterns = [
    `${name} from ${from}`,
    `Prices start at ${from} for ${lowerName}`,
    `${name} picks from ${from}`,
    `Get ${lowerName} from ${from}`,
    `Discover ${lowerName} from ${from}`,
  ];
  return patterns[index] || `${name} from ${from}`;
}

function renderMosaic(groups) {
  const root = document.querySelector("[data-home-mosaic]");
  if (!root) return;
  root.innerHTML = chooseMosaicGroups(groups).map((group, index) => {
    const posterProductCounts = [3, 2, 1, 1, 3];
    const posterProducts = group.products.slice(0, posterProductCounts[index]);
    const isTech = TECH_DEPARTMENT.test(`${group.slug} ${group.name}`);
    const ctaClass = index === 0 ? "home-promo-card__cta home-promo-card__cta--pill" : "home-promo-card__cta";
    return `<a class="home-promo-card home-promo-card--${index + 1}" data-bento-tile data-bento-tech="${isTech}" href="shop.html?cat=${encodeURIComponent(group.slug)}"><div class="home-promo-card__copy"><small>${esc(mosaicEyebrows[index])}</small><h3>${esc(mosaicHeadline(group, index))}</h3><span class="${ctaClass}">Shop now</span></div><span class="home-poster-art" aria-hidden="true">${posterProducts.map((product, productIndex) => `<img class="home-poster-product home-poster-product--${productIndex + 1}" data-promo-product data-promo-name="${esc(product.name)}" crossorigin="anonymous" src="${esc(product.image)}" alt="" loading="eager" fetchpriority="low" width="680" height="560">`).join("")}</span></a>`;
  }).join("");
  preparePromoCutouts(root);
}

const skeletonCards = (count, compact = false) => Array.from({ length: count }, () => `<span class="home-skeleton-card${compact ? " home-skeleton-card--compact" : ""}"><i></i><b></b><small></small></span>`).join("");

function renderLoadingLayout() {
  const brand = document.querySelector("[data-home-brand-products]");
  const savings = document.querySelector("[data-home-savings-groups]");
  const lineup = document.querySelector("[data-home-lineup-products]");
  const departments = document.querySelector("[data-home-departments]");
  const mosaic = document.querySelector("[data-home-mosaic]");
  if (brand) brand.innerHTML = skeletonCards(6);
  if (savings) savings.innerHTML = Array.from({ length: 5 }, () => `<span class="home-skeleton-panel">${skeletonCards(4, true)}</span>`).join("");
  if (lineup) lineup.innerHTML = skeletonCards(3);
  if (departments) departments.innerHTML = skeletonCards(10, true);
  if (mosaic) mosaic.innerHTML = Array.from({ length: 5 }, (_, index) => `<span class="home-skeleton-promo home-promo-card--${index + 1}"></span>`).join("");
}

function renderCatalogUnavailable(catalog) {
  const root = document.querySelector("[data-home-departments]");
  const categories = catalog?.cfg?.categories || [];
  if (root && categories.length) root.innerHTML = categories.slice(0, 10).map((category) => `<a class="home-dept-card home-dept-card--text" href="shop.html?cat=${encodeURIComponent(category.slug)}"><span>${esc(titleCase(category.slug).slice(0, 1))}</span><b>${esc(titleCase(category.slug))}</b></a>`).join("");
  const message = document.querySelector("[data-catalog-error]");
  if (message) { message.hidden = false; message.textContent = "Live products are temporarily unavailable. The marketplace will refresh them automatically."; }
}

function renderMarketplaceModules(catalog, clearanceIds = new Set()) {
  const products = promotionSafeProducts(sellableProducts(catalog));
  const groups = categoryGroups(catalog, products);
  if (!products.length || !groups.length) { renderCatalogUnavailable(catalog); return; }
  renderBrandProducts(catalog, products, clearanceIds);
  renderSavings(groups);
  renderLineup(groups);
  renderDepartments(groups);
  renderMosaic(groups);
}

renderLoadingLayout();
renderHero();

loadCatalog().then(async (catalog) => {
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
  if (message) { message.hidden = false; message.textContent = "The live catalog could not be loaded. Please try again shortly."; }
});
