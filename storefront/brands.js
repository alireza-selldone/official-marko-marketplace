import { loadCatalog, promotionSafeProducts } from "./shop-data.js";
import { esc } from "./app.js";

const brandHref = (name) => `shop.html?brand=${encodeURIComponent(name)}`;
const initialOf = (name) => (String(name).trim()[0] || "#").toUpperCase();

function initBrands(cat) {
  const brands = [...cat.brands].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const productMap = new Map(brands.map((brand) => [
    brand.name,
    promotionSafeProducts(cat.products.filter((product) => product.brand === brand.name)),
  ]));
  const summary = document.querySelector("[data-brand-summary]");
  const featured = document.querySelector("[data-featured-brands]");
  const alphabet = document.querySelector("[data-brand-alphabet]");
  const directory = document.querySelector("[data-brand-directory]");
  const status = document.querySelector("[data-brand-status]");
  const search = document.querySelector("[data-brand-search]");

  if (summary) summary.textContent = "Explore brands available across the marketplace.";
  if (!brands.length) {
    directory.innerHTML = `<div class="brand-empty"><h2>No brands yet</h2><p>Brand names will appear here as soon as products include them.</p><a class="btn btn--line" href="shop.html">Browse all products</a></div>`;
    if (search) search.disabled = true;
    return;
  }

  const popular = [...cat.brands].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 4);
  featured.innerHTML = popular.map((brand) => {
    const products = productMap.get(brand.name) || [];
    const product = products[0];
    return `<a class="brand-feature" href="${brandHref(brand.name)}">
      <span class="brand-feature__art">${product ? `<img src="${esc(product.image)}" alt="${esc(product.name)}" width="520" height="520">` : ""}</span>
      <span class="brand-feature__copy"><strong>${esc(brand.name)}</strong><small>Explore the collection</small></span>
    </a>`;
  }).join("");

  const render = (query = "") => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = brands.filter((brand) => brand.name.toLocaleLowerCase().includes(needle));
    const groups = new Map();
    matches.forEach((brand) => {
      const initial = initialOf(brand.name);
      if (!groups.has(initial)) groups.set(initial, []);
      groups.get(initial).push(brand);
    });

    alphabet.hidden = Boolean(needle);
    alphabet.innerHTML = [...groups.keys()].map((initial) =>
      `<a href="#brand-${encodeURIComponent(initial)}" aria-label="Brands beginning with ${esc(initial)}">${esc(initial)}</a>`).join("");
    status.textContent = needle ? `Matching “${query.trim()}”` : "Browse A to Z";

    directory.innerHTML = matches.length ? [...groups.entries()].map(([initial, items]) => `
      <section class="brand-group" id="brand-${esc(initial)}" aria-labelledby="brand-heading-${esc(initial)}">
        <h2 id="brand-heading-${esc(initial)}">${esc(initial)}</h2>
        <div class="brand-group__links">${items.map((brand) => `
          <a href="${brandHref(brand.name)}"><span>${esc(brand.name)}</span></a>`).join("")}</div>
      </section>`).join("") : `<div class="brand-empty"><h2>No matching brands</h2><p>Try a shorter name or browse the full A–Z directory.</p></div>`;
  };

  search?.addEventListener("input", () => render(search.value));
  render();
}

document.addEventListener("catalog:ready", async () => initBrands(await loadCatalog()));
