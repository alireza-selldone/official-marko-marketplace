import { loadCatalog, loadVendors, promotionSafeProducts } from "./shop-data.js";
import { cardHTML, esc } from "./app.js";
import { MARKETPLACE_VENDORS } from "./marketplace-config.js";

const requested = new URLSearchParams(location.search).get("vendor")?.toLowerCase();
const fallback = MARKETPLACE_VENDORS[requested] || MARKETPLACE_VENDORS.alio;

Promise.all([loadCatalog(), loadVendors().catch(() => [])]).then(([catalog, liveVendors]) => {
  const live = liveVendors.find((vendor) => Number(vendor.id) === fallback.id) || {};
  const vendor = { ...fallback, ...live };
  const products = catalog.products.filter((product) => product.vendorSlug === fallback.slug);
  const promoProducts = promotionSafeProducts(products);
  const categories = catalog.cats.filter((category) => products.some((product) => product.cat === category.slug));
  document.body.dataset.vendorAccent = fallback.accent;
  document.title = `${vendor.name} — Marko Marketplace`;

  const set = (selector, value) => { const element = document.querySelector(selector); if (element) element.textContent = value; };
  set("[data-vendor-eyebrow]", fallback.eyebrow);
  set("[data-vendor-initial]", vendor.name.slice(0, 1));
  set("[data-vendor-name]", vendor.name);
  set("[data-vendor-description]", vendor.description || fallback.description);
  set("[data-vendor-category-title]", `${vendor.name} departments.`);
  set("[data-vendor-product-title]", `Popular at ${vendor.name}.`);
  set("[data-vendor-story-title]", fallback.slug === "alio" ? "Style for real life." : "Technology that earns its place.");
  set("[data-vendor-story-copy]", fallback.slug === "alio" ? "Alio brings together wearable color, comfortable fits, active essentials, footwear, and accessories across every age group." : "Merino focuses on useful electronics for home, work, content creation, entertainment, and travel — all with live Marko inventory.");

  const allLink = document.querySelector("[data-vendor-all-link]");
  if (allLink) allLink.href = `vendor.html?vendor=${fallback.slug}#vendor-products`;

  const art = document.querySelector("[data-vendor-hero-art]");
  if (art) art.innerHTML = promoProducts.slice(0, 6).map((product, index) => `<a class="vendor-hero__product vendor-hero__product--${index + 1}" href="product.html?id=${product.id}"><img src="${esc(product.image)}" alt="${esc(product.name)}" width="420" height="420"><span>${esc(product.name)}</span></a>`).join("");

  const categoryGrid = document.querySelector("[data-vendor-categories]");
  if (categoryGrid) categoryGrid.innerHTML = categories.map((category) => `<a href="shop.html?cat=${encodeURIComponent(category.slug)}"><span><img src="${esc(category.image)}" alt="" loading="lazy" width="300" height="300"></span><b>${esc(category.name)}</b></a>`).join("");

  const featured = document.querySelector("[data-vendor-products]");
  if (featured) featured.innerHTML = products.slice(0, 12).map((product) => cardHTML(product)).join("");
  const more = document.querySelector("[data-vendor-more]");
  if (more) more.innerHTML = products.slice(12, 24).map((product) => cardHTML(product)).join("");
}).catch((error) => {
  console.error(error);
  document.querySelector("[data-vendor-description]").textContent = "This seller could not be loaded. Please try again shortly.";
});
