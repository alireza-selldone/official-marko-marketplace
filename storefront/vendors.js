/* Seller directory.
   The roster comes from the live vendors endpoint, so a seller added in the
   backoffice appears here without a code change, and a renamed one or a new
   logo updates on the next load. */

import { loadCatalog, loadVendors, promotionSafeProducts, vendorImg } from "./shop-data.js";
import { esc } from "./app.js";
import { vendorRoster } from "./marketplace-config.js";

/* A logo when the seller has uploaded one, their initial when they have not.
   The initial is a placeholder for a missing asset, not a house style, so it
   should disappear the moment a real mark exists. */
function markHTML(vendor, className) {
  const logo = vendorImg(vendor.icon, 256);
  return logo
    ? `<span class="${className} ${className}--logo"><img src="${esc(logo)}" alt="" width="64" height="64" loading="lazy"></span>`
    : `<span class="${className}">${esc(vendor.name.slice(0, 1))}</span>`;
}

Promise.all([loadCatalog(), loadVendors().catch(() => [])])
  .then(([catalog, liveVendors]) => {
    const directory = document.querySelector("[data-vendor-directory]");
    if (!directory) return;

    const roster = vendorRoster(liveVendors);

    /* The intro used to name two sellers in prose, so adding a third made the
       sentence wrong rather than merely incomplete. Count what is there. */
    const intro = document.querySelector("[data-vendor-intro]");
    if (intro) {
      const names = roster.map((vendor) => vendor.name);
      const list = names.length > 1
        ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
        : names[0] || "";
      intro.textContent = names.length
        ? `${names.length === 1 ? "One store" : `${names.length} focused stores`}, one secure cart. Shop ${list}.`
        : "One secure cart across every seller.";
    }

    directory.innerHTML = roster.map((vendor) => {
      const products = catalog.products.filter((product) => product.vendorSlug === vendor.slug);
      const art = promotionSafeProducts(products).slice(0, 6);
      /* A seller with nothing listed yet is still a real seller. Saying so is
         more use than an empty tile that looks like a rendering fault. */
      const artHTML = art.length
        ? art.map((product) => `<img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" width="300" height="300">`).join("")
        : `<p class="market-vendor__empty">No products listed yet.</p>`;

      return `<article class="market-vendor market-vendor--directory-card market-vendor--${esc(vendor.accent)}">
        <div class="market-vendor__copy">
          <p>${esc(vendor.eyebrow)}</p>
          ${markHTML(vendor, "vendor-directory__mark")}
          <h2>${esc(vendor.name)}</h2>
          <span>${esc(vendor.description)}</span>
          <b>Marketplace seller</b>
          <a href="vendor.html?vendor=${encodeURIComponent(vendor.slug)}">Visit ${esc(vendor.name)}</a>
        </div>
        <div class="market-vendor__art">${artHTML}</div>
      </article>`;
    }).join("");
  })
  .catch((error) => console.error(error));
