import { loadCatalog, loadVendors, promotionSafeProducts } from "./shop-data.js";
import { cardHTML, esc, initRailNav } from "./app.js";
import { MARKETPLACE_VENDORS } from "./marketplace-config.js";

const requested = new URLSearchParams(location.search).get("vendor")?.toLowerCase() || "";
const fallback = MARKETPLACE_VENDORS[requested];

/* MK-015 — an unknown seller is not a seller.
   The page used to fall back to Alio for any unrecognised slug while leaving
   the wrong slug in the URL, so a mistyped or retired seller silently showed
   somebody else's catalogue under somebody else's name. That is a data
   integrity fault, not a cosmetic one: every price, product and department on
   the page would have belonged to a vendor the visitor did not ask for. */
function renderUnknownVendor(slug) {
  document.title = "Seller not found — Marko Marketplace";
  const main = document.querySelector("main");
  if (!main) return;
  main.innerHTML = `
    <section class="section">
      <div class="wrap pgcol notfound-vendor">
        <p class="eyebrow eyebrow--blued">Marketplace seller</p>
        <h1 class="h1">We could not find that seller</h1>
        <p class="lede">${slug
          ? `No seller is listed at <b>${esc(slug)}</b>. It may have been renamed, or the link may be incomplete.`
          : "No seller was named in this link."}</p>
        <div class="notfound-vendor__actions">
          <a class="market-button" href="vendors.html">Browse all sellers</a>
          <a class="market-button market-button--ghost" href="shop.html">Shop all products</a>
        </div>
      </div>
    </section>`;
}

/* MK-020 — department discovery has to survive a large seller.
   Merino carries fifteen departments and the flat grid ran to 1,702px on a
   phone. The first row and a half stay visible and the rest expand on request,
   which keeps every department reachable without making the page a scroll. */
const DEPARTMENTS_VISIBLE = 8;

function renderDepartments(grid, categories) {
  if (!grid) return;
  grid.innerHTML = categories.map((category, index) => `
    <a href="shop.html?cat=${encodeURIComponent(category.slug)}"${index >= DEPARTMENTS_VISIBLE ? ' data-department-extra hidden' : ""}>
      <span><img src="${esc(category.image)}" alt="" loading="lazy" width="300" height="300"></span>
      <b>${esc(category.name)}</b>
    </a>`).join("");

  const toggle = document.querySelector("[data-department-toggle]");
  if (!toggle) return;
  const extra = [...grid.querySelectorAll("[data-department-extra]")];
  if (!extra.length) { toggle.hidden = true; return; }
  toggle.hidden = false;
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    extra.forEach((tile) => { tile.hidden = open; });
    toggle.setAttribute("aria-expanded", String(!open));
    toggle.textContent = open ? "Show all departments" : "Show fewer departments";
    if (open) grid.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (!fallback) {
  renderUnknownVendor(requested);
} else {
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

    /* MK-018 — "View all" reaches the full seller catalogue.
       It used to point at `#vendor-products`, the same twelve-card rail the
       visitor was already looking at, so the control promised more and
       delivered the current scroll position. */
    document.querySelectorAll("[data-vendor-all-link]").forEach((link) => {
      link.href = `shop.html?vendor=${encodeURIComponent(fallback.slug)}`;
      link.textContent = `View all from ${vendor.name}`;
    });

    const art = document.querySelector("[data-vendor-hero-art]");
    if (art) art.innerHTML = promoProducts.slice(0, 6).map((product, index) => `<a class="vendor-hero__product vendor-hero__product--${index + 1}" href="product.html?id=${product.id}"><img src="${esc(product.image)}" alt="${esc(product.name)}" width="420" height="420"><span>${esc(product.name)}</span></a>`).join("");

    renderDepartments(document.querySelector("[data-vendor-categories]"), categories);

    /* MK-017 — the rails are operable.
       Content existed but there was no visible control, no role, no label and
       no keyboard path, so a horizontal rail was reachable by mouse drag or
       trackpad alone. */
    /* MK-001 — the seller rails are curated selections, so they are
       promotional placements and go through the eligibility guard. They used
       the raw product list, which is how three rear-angle shorts photographs
       and a bikini reached "Popular at Alio" while the homepage was clean.
       The products stay available in the seller's full listing behind
       "View all", which is an ordinary listing and not a promotion. */
    const featured = document.querySelector("[data-vendor-products]");
    if (featured) {
      featured.innerHTML = promoProducts.slice(0, 12).map((product) => cardHTML(product)).join("");
      initRailNav(featured, document.querySelector('[data-rail-nav="vendor-featured"]'), `Featured products from ${vendor.name}`);
    }
    const more = document.querySelector("[data-vendor-more]");
    if (more) {
      more.innerHTML = promoProducts.slice(12, 24).map((product) => cardHTML(product)).join("");
      initRailNav(more, document.querySelector('[data-rail-nav="vendor-more"]'), `More products from ${vendor.name}`);
    }
  }).catch((error) => {
    console.error(error);
    const description = document.querySelector("[data-vendor-description]");
    if (description) description.textContent = "This seller could not be loaded. Please try again shortly.";
  });
}
