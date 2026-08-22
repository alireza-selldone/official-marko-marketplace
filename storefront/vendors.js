import { loadCatalog, loadVendors } from "./shop-data.js";
import { esc } from "./app.js";
import { MARKETPLACE_VENDORS } from "./marketplace-config.js";

Promise.all([loadCatalog(), loadVendors().catch(() => [])]).then(([catalog, liveVendors]) => {
  const liveById = new Map(liveVendors.map((vendor) => [Number(vendor.id), vendor]));
  const directory = document.querySelector("[data-vendor-directory]");
  directory.innerHTML = Object.values(MARKETPLACE_VENDORS).map((fallback) => {
    const vendor = { ...fallback, ...(liveById.get(fallback.id) || {}) };
    const products = catalog.products.filter((product) => product.vendorSlug === fallback.slug);
    return `<article class="market-vendor market-vendor--directory-card market-vendor--${fallback.accent}"><div class="market-vendor__copy"><p>${esc(fallback.eyebrow)}</p><span class="vendor-directory__mark">${esc(vendor.name[0])}</span><h2>${esc(vendor.name)}</h2><span>${esc(vendor.description || fallback.description)}</span><b>${products.length} products · ${new Set(products.map((product) => product.cat)).size} departments</b><a href="vendor.html?vendor=${fallback.slug}">Visit ${esc(vendor.name)}</a></div><div class="market-vendor__art">${products.slice(0, 6).map((product) => `<img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" width="300" height="300">`).join("")}</div></article>`;
  }).join("");
  document.querySelectorAll("[data-product-total]").forEach((element) => { element.textContent = catalog.products.length; });
}).catch((error) => console.error(error));
