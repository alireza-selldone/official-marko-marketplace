import { loadCatalog, loadVendors } from "./shop-data.js";
import { cardHTML, esc } from "./app.js";
import { MARKETPLACE_VENDORS } from "./marketplace-config.js";

const HERO_STORIES = [
  { kicker: "One marketplace. Two specialist sellers.", title: "Everything your day needs.", lede: "Fresh fashion from Alio and practical technology from Merino, together in one easy shop.", label: "Shop all products", href: "shop.html", vendors: ["alio", "merino"] },
  { kicker: "Alio fashion", title: "New looks, ready to move.", lede: "Everyday style, activewear, footwear, and accessories selected for real life.", label: "Visit Alio", href: "vendor.html?vendor=alio", vendors: ["alio"] },
  { kicker: "Merino technology", title: "Smarter gear. Better days.", lede: "Useful electronics for work, entertainment, creating, and life on the go.", label: "Visit Merino", href: "vendor.html?vendor=merino", vendors: ["merino"] },
];

const interleave = (left, right, limit = 12) => {
  const rows = [];
  for (let index = 0; rows.length < limit && (left[index] || right[index]); index += 1) {
    if (left[index]) rows.push(left[index]);
    if (right[index] && rows.length < limit) rows.push(right[index]);
  }
  return rows;
};

function renderHero(catalog) {
  const root = document.querySelector("[data-market-hero]");
  const art = document.querySelector("[data-market-hero-art]");
  const dots = document.querySelector("[data-market-hero-dots]");
  if (!root || !art || !dots) return;
  let active = 0;
  let timer;
  const paint = (index, restart = true) => {
    active = (index + HERO_STORIES.length) % HERO_STORIES.length;
    const story = HERO_STORIES[active];
    const vendorPools = story.vendors.map((vendor) =>
      catalog.products.filter((product) => product.vendorSlug === vendor && product.qty > 0),
    );
    const pool = vendorPools.length === 2
      ? interleave(vendorPools[0], vendorPools[1], vendorPools[0].length + vendorPools[1].length)
      : vendorPools[0];
    const start = active * 5;
    const picks = [pool[start], pool[start + 2], pool[start + 4]].filter(Boolean);
    root.querySelector("[data-hero-kicker]").textContent = story.kicker;
    root.querySelector("[data-hero-title]").textContent = story.title;
    root.querySelector("[data-hero-lede]").textContent = story.lede;
    const link = root.querySelector("[data-hero-link]");
    link.textContent = story.label;
    link.href = story.href;
    art.innerHTML = picks.map((product, productIndex) => `<a class="market-hero__product market-hero__product--${productIndex + 1}" href="product.html?id=${product.id}"><img src="${esc(product.image)}" alt="${esc(product.name)}" width="520" height="520"><span>${esc(product.name)}</span></a>`).join("");
    dots.querySelectorAll("button").forEach((button, dotIndex) => button.setAttribute("aria-current", String(dotIndex === active)));
    root.dataset.story = story.vendors.length === 1 ? story.vendors[0] : "market";
    if (restart) { clearInterval(timer); timer = setInterval(() => paint(active + 1, false), 7000); }
  };
  dots.innerHTML = HERO_STORIES.map((story, index) => `<button type="button" aria-label="Show ${esc(story.kicker)}" aria-current="${index === 0}"></button>`).join("");
  dots.addEventListener("click", (event) => { const button = event.target.closest("button"); if (button) paint([...dots.children].indexOf(button)); });
  paint(0);
}

function renderCategories(catalog) {
  const grid = document.getElementById("catgrid");
  if (!grid) return;
  if (catalog.cats.length < 3) {
    grid.closest("section").hidden = true;
    return;
  }
  const fashion = catalog.cats.filter((category) => catalog.products.some((product) => product.cat === category.slug && product.vendorSlug === "alio"));
  const electronics = catalog.cats.filter((category) => catalog.products.some((product) => product.cat === category.slug && product.vendorSlug === "merino"));
  const specialist = interleave(fashion, electronics, 12);
  const specialistIds = new Set(specialist.map((category) => category.id));
  const generic = catalog.cats.filter((category) => !specialistIds.has(category.id));
  const limit = specialist.length ? 12 : 8;
  grid.innerHTML = [...specialist, ...generic].slice(0, limit).map((category) => `<a class="market-cat" href="shop.html?cat=${encodeURIComponent(category.slug)}"><span><img src="${esc(category.image)}" alt="" loading="lazy" width="280" height="280"></span><b>${esc(category.name)}</b><small>${category.count} products</small></a>`).join("");
}

function renderVendors(catalog, publicVendors) {
  const grid = document.querySelector("[data-vendor-cards]");
  if (!grid) return;
  const publicById = new Map(publicVendors.map((vendor) => [Number(vendor.id), vendor]));
  grid.innerHTML = Object.values(MARKETPLACE_VENDORS).map((fallback) => {
    const vendor = { ...fallback, ...(publicById.get(fallback.id) || {}) };
    const products = catalog.products.filter((product) => product.vendorSlug === fallback.slug);
    return `<article class="market-vendor market-vendor--${fallback.accent}"><div class="market-vendor__copy"><p>${esc(fallback.eyebrow)}</p><h3>${esc(vendor.name)}</h3><span>${esc(vendor.description || fallback.description)}</span><b>${products.length} products · ${new Set(products.map((product) => product.cat)).size} departments</b><a href="vendor.html?vendor=${fallback.slug}">Shop this seller</a></div><div class="market-vendor__art">${products.slice(0, 4).map((product) => `<img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" width="280" height="280">`).join("")}</div></article>`;
  }).join("");
}

function renderRails(catalog) {
  const alio = catalog.products.filter((product) => product.vendorSlug === "alio" && product.qty > 0);
  const merino = catalog.products.filter((product) => product.vendorSlug === "merino" && product.qty > 0);
  const arrivals = document.getElementById("arrivals");
  if (arrivals) arrivals.innerHTML = interleave(alio, merino, 12).map(cardHTML).join("");
  const deals = document.querySelector("[data-market-deals]");
  if (deals) {
    const discounted = catalog.products.filter((product) => product.was && product.qty > 0);
    const rows = (discounted.length >= 8 ? discounted : interleave(merino.slice(12), alio.slice(12), 10)).slice(0, 10);
    deals.innerHTML = rows.map(cardHTML).join("");
  }
}

function renderAudience(catalog) {
  const grid = document.querySelector("[data-audience-grid]");
  if (!grid) return;
  grid.innerHTML = catalog.audiences.filter((audience) => audience.count > 0).slice(0, 5).map((audience) => `<a href="shop.html?audience=${audience.slug}"><img src="${esc(audience.image)}" alt="${esc(audience.title)}" loading="lazy" width="420" height="420"><span><b>${esc(audience.title)}</b><small>${audience.count} products</small></span></a>`).join("");
}

Promise.all([loadCatalog(), loadVendors().catch(() => [])]).then(([catalog, vendors]) => {
  renderHero(catalog); renderCategories(catalog); renderVendors(catalog, vendors); renderRails(catalog); renderAudience(catalog);
  document.querySelectorAll("[data-product-total]").forEach((element) => { element.textContent = catalog.products.length; });
}).catch((error) => {
  console.error(error);
  const message = document.querySelector("[data-catalog-error]");
  if (message) { message.hidden = false; message.textContent = "The live catalog could not be loaded. Please try again shortly."; }
});
