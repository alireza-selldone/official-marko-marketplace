/* Marko product detail: live Selldone facts, accessible apparel options,
   and deterministic variant-to-gallery behavior. */

import {
  loadCatalog, loadProduct, money, byId, catOf, img,
  variantsOf, swatchStyle, swatchLabel, isComposite, colorKey,
  addToBag,
} from "./shop-data.js";
import { variantSizeOptions, variantSizeValue } from "./variant-options.js";
import { cardHTML, esc, initAcc, openLightbox, saleBadgeHTML } from "./app.js";

/* Spec keys worth surfacing, in reading order. Only those the record actually
   holds are rendered; nothing is filled in. */
const SPEC_ORDER = [
  "Material", "Fabric", "Composition", "Fit", "Style", "Color", "Size",
  "Care", "Care Instructions", "Closure", "Pattern", "Season",
  "Sole Material", "Upper Material", "Lens", "Frame Material", "Item weight",
];

function specRows(spec) {
  if (!spec) return [];
  const rows = [];
  const seen = new Set();
  SPEC_ORDER.forEach((k) => {
    const v = spec[k];
    if (!v || v === "group" || seen.has(k)) return;
    seen.add(k);
    rows.push([k, Array.isArray(v) ? v.join(", ") : String(v)]);
  });
  Object.entries(spec).forEach(([k, v]) => {
    if (v === "group" || seen.has(k) || !v) return;
    seen.add(k);
    rows.push([k, Array.isArray(v) ? v.join(", ") : String(v)]);
  });
  return rows;
}

const SAMPLE_REVIEWS = [
  ["Maya R.", "The options were easy to compare and the silhouette worked naturally with pieces I already own."],
  ["Daniel K.", "Clear photos and straightforward sizing made this simple to choose."],
  ["Sofia L.", "The color is easy to style and the overall look feels polished without being fussy."],
  ["Noah T.", "A versatile everyday piece with a clean shape and useful details."],
  ["Ava M.", "The product page made the available colors and stock easy to understand."],
];

const SHOE_LENGTHS = new Map([
  [20, 12.5], [21, 13.2], [22, 13.8], [23, 14.5], [24, 15.2], [25, 15.8],
  [26, 16.5], [27, 17.2], [28, 17.8], [29, 18.5], [30, 19.2], [31, 19.8],
  [32, 20.5], [33, 21.2], [34, 21.8], [35, 22.5], [36, 23.2], [37, 23.8],
  [38, 24.5], [39, 25.2], [40, 25.8], [41, 26.5], [42, 27.2], [43, 27.8],
  [44, 28.5], [45, 29.2], [46, 29.8],
]);

function sizeGuideHTML(p, category, sizeValues) {
  const text = `${p.name} ${category.name} ${p.cat}`.toLowerCase();
  const isShoe = /shoe|trainer|footwear|boot|sneaker|sandal|loafer|heel/.test(text);
  const isBaby = /baby|newborn|sleepsuit|bodysuit|romper|pramsuit|bootie/.test(text);
  const numericSizes = sizeValues.map(Number).filter(Number.isFinite);

  if (isShoe && numericSizes.length) {
    return `<table class="size-guide-table">
      <thead><tr><th scope="col">EU size</th><th scope="col">Approx. foot length</th></tr></thead>
      <tbody>${numericSizes.map((size) => `<tr><th scope="row">${esc(size)}</th><td>${SHOE_LENGTHS.has(size) ? `${SHOE_LENGTHS.get(size).toFixed(1)} cm` : "Measure heel to toe"}</td></tr>`).join("")}</tbody>
    </table>`;
  }

  if (isBaby) {
    const rows = [["0–3 months", "56–62 cm"], ["3–6 months", "62–68 cm"], ["6–9 months", "68–74 cm"], ["9–12 months", "74–80 cm"], ["12–18 months", "80–86 cm"], ["18–24 months", "86–92 cm"]];
    return `<table class="size-guide-table"><thead><tr><th scope="col">Age size</th><th scope="col">Child height</th></tr></thead><tbody>${rows.map(([size, height]) => `<tr><th scope="row">${size}</th><td>${height}</td></tr>`).join("")}</tbody></table>`;
  }

  const rows = [["XS", "80–84", "62–66", "86–90"], ["S", "84–88", "66–70", "90–94"], ["M", "88–94", "70–76", "94–100"], ["L", "94–100", "76–82", "100–106"], ["XL", "100–108", "82–90", "106–114"]];
  return `<table class="size-guide-table"><thead><tr><th scope="col">Size</th><th scope="col">Chest</th><th scope="col">Waist</th><th scope="col">Hip</th></tr></thead><tbody>${rows.map(([size, chest, waist, hip]) => `<tr><th scope="row">${size}</th><td>${chest} cm</td><td>${waist} cm</td><td>${hip} cm</td></tr>`).join("")}</tbody></table>`;
}

function ratingBlock(p) {
  return `<div class="reviews-block">
    <div class="reviews-summary">
      <div><p class="eyebrow eyebrow--onink">Customer reviews</p><h2>What customers say</h2></div>
      <div class="reviews-score"><strong>5.0</strong><span class="review-stars" role="img" aria-label="5 out of 5 stars">★★★★★</span><small>5 sample reviews</small></div>
    </div>
    <div class="reviews-grid">
      ${SAMPLE_REVIEWS.map(([name, text]) => `<article class="review-card">
        <span class="review-stars" role="img" aria-label="5 out of 5 stars">★★★★★</span>
        <p>${esc(text)}</p>
        <footer><b>${esc(name)}</b><span>Sample review · REF. ${p.id}</span></footer>
      </article>`).join("")}
    </div>
    <p class="reviews-disclosure">Sample review content is clearly labeled and is not included in the product rating.</p>
  </div>`;
}

async function initPDP(cat) {
  const root = document.getElementById("pdp");
  if (!root) return;

  const id = new URLSearchParams(location.search).get("id");
  const p = byId(cat, id);

  if (!p) {
    root.innerHTML = `<div class="notfound">
      <p class="h1" style="margin-bottom:14px">Product not found</p>
      <p class="lede" style="margin:0 auto 28px">${id ? `Product ${esc(id)} is not in the catalog.` : "No product was requested."}</p>
      <a class="btn" href="shop.html">Browse all products</a></div>`;
    document.title = "Product not found — Marko";
    return;
  }

  document.title = `${p.name} — Marko`;
  const c = catOf(cat, p.cat);
  const others = cat.products.filter((x) => x.cat === p.cat && x.id !== p.id);

  /* Real gallery from products/{id}/info; falls back to the list icon. */
  let gallery = [{ src: p.image, alt: `${p.name}, main view`, w: 1000, h: 1000 }];
  try {
    const detail = await loadProduct(p.id);
    if (detail.gallery.length) gallery = detail.gallery;
  } catch (e) {
    console.warn("[fashioni] gallery fallback to icon", e);
  }

  /* Every variant the shop defines, not a filtered subset. */
  const variants = variantsOf(p.raw);
  const { field: sizeField, values: sizeValues } = variantSizeOptions(variants);
  const colorGroups = new Map();
  /* Only a variant that actually records a colour is a colour choice.
     Grouping the colourless ones under a `variant-<id>` key turned a bag with
     one navy variant and three material variants into four swatches, three of
     them blank grey circles offering a choice that does not exist. Size-only
     products are excluded by the same rule. */
  variants.filter((variant) => Boolean(variant.color)).forEach((variant) => {
    /* Canonical key, not the raw string: Selldone stores the same colour with
       and without an alpha suffix, and grouping on the raw value rendered
       `#243B64` and `#243B64ff` as two separate, identical swatches. */
    const key = colorKey(variant.color);
    if (!key) return;
    if (!colorGroups.has(key)) colorGroups.set(key, []);
    colorGroups.get(key).push(variant);
  });
  const colors = [...colorGroups.entries()]
    .map(([key, rows]) => ({ key, color: rows[0].color, rows, minId: Math.min(...rows.map((v) => Number(v.id))) }))
    .sort((a, b) => a.minId - b.minId);
  const requestedVariantId = Number(new URLSearchParams(location.search).get("variant") || 0);
  let selectedVariant = variants.find((v) => Number(v.id) === requestedVariantId) || variants[0] || null;
  let selectedColorKey = selectedVariant?.color ? colorKey(selectedVariant.color) : "";
  let selectedSize = sizeField ? variantSizeValue(selectedVariant, sizeField) || sizeValues[0] || "" : "";
  /* One colour is not a choice; a selector implying otherwise is noise. */
  const showSwatches = colors.length >= 2;
  /* A variant's own price/stock when it sets one, the product's otherwise. */
  const priceOf = (v) => (v && v.price > 0 ? v.price - (v.discount || 0) : p.price);
  const stockOf = (v) => (v && Number.isFinite(v.qty) ? v.qty : p.qty);
  const rows = specRows(p.spec);
  const railRef = document.querySelector("[data-rail-ref]");
  if (railRef) railRef.textContent = `REF ${p.id}`;

  root.innerHTML = `
  <nav class="crumb" aria-label="Breadcrumb"><a href="index.html">Home</a><a href="shop.html?cat=${c.slug}">${esc(c.name)}</a><span aria-current="page">${esc(p.name)}</span></nav>
  <div class="pdp">
    <div class="gal">
      <div class="thumbs" role="group" aria-label="Gallery views"${gallery.length < 2 ? ' hidden' : ''}>
        ${gallery.map((g, i) => `
          <button class="thumb${i ? "" : " is-on"}" type="button" data-i="${i}" aria-label="View ${i + 1} of ${gallery.length}">
            <img src="${g.src}" alt="" width="120" height="120" loading="lazy">
          </button>`).join("")}
      </div>
      <button class="galmain" id="galmain" type="button" aria-label="Enlarge image">
        ${saleBadgeHTML(p, "product")}
        <img src="${gallery[0].src}" alt="${esc(gallery[0].alt)}" width="${gallery[0].w}" height="${gallery[0].h}" fetchpriority="high">
      </button>
    </div>

    <div class="pinfo">
      <p class="eyebrow eyebrow--blued mb0">${esc(c.name)}</p>
      <h1 class="h1">${esc(p.name)}</h1>
      <p class="ref">REF. ${p.id}${p.brand ? ` &middot; ${esc(p.brand.toUpperCase())}` : ""}</p>
      ${p.vendorName ? `<a class="product-seller" href="vendor.html?vendor=${esc(p.vendorSlug)}"><span>${esc(p.vendorName.slice(0, 1))}</span><small>Sold by</small><b>${esc(p.vendorName)}</b><em>Visit seller →</em></a>` : ""}

      <p class="price" style="font-size:24px;margin:22px 0 0" data-price>${money(selectedVariant ? priceOf(selectedVariant) : p.price)}${p.was ? `<s>${money(p.was)}</s>` : ""}</p>
      <p class="cap" style="margin-top:6px">Duties and taxes calculated at checkout</p>

      <div class="pline"></div>

      ${showSwatches ? `
      <p class="eyebrow mb0" style="margin-bottom:14px">Color</p>
      <div class="swatches" role="radiogroup" aria-label="Choose color">
        ${colors.map((option, i) => `
          <button class="sw${option.key === selectedColorKey ? " is-on" : ""}" type="button" role="radio"
                  aria-checked="${option.key === selectedColorKey ? "true" : "false"}"
                  data-color-key="${esc(option.key)}"
                  aria-label="Color ${i + 1} of ${colors.length}, ${esc(swatchLabel(option.color))}">
            <span aria-hidden="true" style="${swatchStyle(option.color)}"></span>
          </button>`).join("")}
      </div>
      <p class="swname mb0">Color <span class="swhex" data-sw-hex>${esc(swatchLabel(selectedVariant?.color))}</span>${selectedVariant?.sku ? ` <span class="swsku" data-sw-sku>${esc(selectedVariant.sku)}</span>` : `<span class="swsku" data-sw-sku hidden></span>`}</p>
      <p class="swpos" data-sw-pos>${colors.length} color${colors.length === 1 ? "" : "s"} available</p>
      ` : ""}

      ${sizeValues.length ? `
      <div class="size-options">
        <div class="size-options__head"><p class="eyebrow mb0">Size</p><button class="size-guide-link" type="button" data-open-size-guide>Size guide</button></div>
        <div class="size-options__grid" role="radiogroup" aria-label="Choose size">
          ${sizeValues.map((size) => `<button type="button" class="sizeopt${size === selectedSize ? " is-on" : ""}" role="radio" aria-checked="${size === selectedSize ? "true" : "false"}" data-size="${esc(size)}">${esc(String(size).toUpperCase())}</button>`).join("")}
        </div>
      </div>` : ""}

      <p class="stock" data-stock><i class="dot"></i> ${(selectedVariant ? stockOf(selectedVariant) : p.qty) > 0 ? `${selectedVariant ? stockOf(selectedVariant) : p.qty} in stock` : "Currently unavailable"}</p>

      <div class="purchase-actions">
        <button class="btn btn--primary" type="button" data-add="${p.id}">Add to bag</button>
        <button class="btn btn--buy" type="button" data-buy="${p.id}">Buy now</button>
      </div>
      <p class="cap" style="margin-top:14px">Delivery options and final charges are confirmed at checkout.</p>

      <div class="pinfo-accordions">
        <div class="acc is-open">
          <button class="acc__hd" type="button" aria-expanded="true">Description <span class="acc__ico">–</span></button>
          <div class="acc__bd">
            <p class="mt0">${esc(cat.cats.find((c) => c.slug === p.cat)?.blurb || "")}</p>
            <p class="cap mb0">Category description. Selldone holds no separate long description for this product.</p>
          </div>
        </div>
        ${sizeValues.length ? `
        <div class="acc" id="size-guide">
          <button class="acc__hd" type="button" aria-expanded="false">Size guide <span class="acc__ico">+</span></button>
          <div class="acc__bd">
            <p class="mt0">Use this table as a general guide. Measurements can vary by style; the selectable sizes above are the current live options for this product.</p>
            ${sizeGuideHTML(p, c, sizeValues)}
            <p class="cap mb0"><strong>How to measure:</strong> keep the tape level and close to the body without pulling it tight. For footwear, measure from the back of the heel to the longest toe.</p>
          </div>
        </div>` : ""}
        <div class="acc">
          <button class="acc__hd" type="button" aria-expanded="false">Specifications <span class="acc__ico">+</span></button>
          <div class="acc__bd">
            ${rows.length ? `<table class="spectable"><tbody>
              ${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
              <tr><th scope="row">Product ID</th><td>${p.id}</td></tr>
            </tbody></table>` : `<p class="mt0 mb0">No specifications are recorded for REF. ${p.id}.</p>`}
          </div>
        </div>
        <div class="acc">
          <button class="acc__hd" type="button" aria-expanded="false">Shipping &amp; returns <span class="acc__ico">+</span></button>
          <div class="acc__bd"><p class="mt0 mb0">Current delivery options and charges appear at checkout. Return eligibility follows the merchant policy shown for the order; no unverified return window is promised here.</p></div>
        </div>
        <div class="acc">
          <button class="acc__hd" type="button" aria-expanded="false">Fit &amp; care <span class="acc__ico">+</span></button>
          <div class="acc__bd"><p class="mt0 mb0">Choose only from the live size options above. Product-specific fit, material, and care details appear in Specifications when supplied by the merchant; missing facts are intentionally left unstated.</p></div>
        </div>
      </div>
    </div>
  </div>
`;

  /* Reviews */
  const rev = document.getElementById("reviews");
  if (rev) rev.innerHTML = ratingBlock(p);

  /* Related */
  const rt = document.getElementById("reltitle");
  if (rt) rt.textContent = others.length ? `More in ${c.name}` : "Explore the catalog";
  const rel = document.getElementById("related");
  const relatedProducts = (others.length ? others : cat.products.filter((x) => x.id !== p.id)).slice(0, 12);
  if (rel) rel.innerHTML = relatedProducts.map((product) => cardHTML(product)).join("");

  const relatedViewport = document.querySelector("[data-related-viewport]");
  const relatedControls = document.querySelector("[data-related-controls]");
  const relatedPrev = document.querySelector("[data-related-prev]");
  const relatedNext = document.querySelector("[data-related-next]");
  const updateRelatedControls = () => {
    if (!relatedViewport || !relatedControls) return;
    const max = relatedViewport.scrollWidth - relatedViewport.clientWidth;
    relatedControls.hidden = max < 2;
    if (relatedPrev) relatedPrev.disabled = relatedViewport.scrollLeft < 2;
    if (relatedNext) relatedNext.disabled = relatedViewport.scrollLeft >= max - 2;
  };
  const moveRelated = (direction) => relatedViewport?.scrollBy({ left: direction * relatedViewport.clientWidth * .82, behavior: "smooth" });
  relatedPrev?.addEventListener("click", () => moveRelated(-1));
  relatedNext?.addEventListener("click", () => moveRelated(1));
  relatedViewport?.addEventListener("scroll", updateRelatedControls, { passive: true });
  if (relatedViewport && "ResizeObserver" in window) new ResizeObserver(updateRelatedControls).observe(relatedViewport);
  requestAnimationFrame(updateRelatedControls);

  /* Gallery interaction */
  const main = document.querySelector("#galmain img");
  let current = 0;
  const show = (i) => {
    current = i;
    const g = gallery[i];
    main.src = g.src; main.alt = g.alt;
    root.querySelectorAll(".thumb").forEach((t, n) => t.classList.toggle("is-on", n === i));
  };
  root.querySelectorAll(".thumb").forEach((t) =>
    t.addEventListener("click", () => show(Number(t.dataset.i))));
  document.getElementById("galmain")?.addEventListener("click", () =>
    openLightbox(gallery[current].src, gallery[current].alt));

  /* Deterministic media relation. Color groups are ordered by their smallest
     Selldone variant id, then assigned distinct gallery entries. Every size
     row of the same color shares that color image. A real variant image wins. */
  const galleryIndexByVariantId = new Map();
  colors.forEach((option, colorIndex) => {
    const realImage = option.rows.map((v) => v.image && img(v.image)).find(Boolean);
    const exactIndex = realImage ? gallery.findIndex((g) => g.src === realImage) : -1;
    const stableIndex = exactIndex >= 0 ? exactIndex : (gallery.length ? colorIndex % gallery.length : 0);
    option.rows.forEach((v) => galleryIndexByVariantId.set(Number(v.id), stableIndex));
  });
  const showGallery = (i) => {
    if (i < 0 || i >= gallery.length) return;
    current = i;
    const main = root.querySelector("#galmain img");
    if (main) { main.src = gallery[i].src; main.alt = gallery[i].alt; }
    root.querySelectorAll(".thumb").forEach((t) =>
      t.classList.toggle("is-on", Number(t.dataset.i) === i));
  };

  const selectVariant = (variant) => {
      if (!variant) return;
      selectedVariant = variant;
      selectedColorKey = variant.color ? String(variant.color).toUpperCase() : `variant-${variant.id}`;
      if (sizeField && variant[sizeField]) selectedSize = variantSizeValue(variant, sizeField) || selectedSize;
      root.querySelectorAll(".sw").forEach((sw) => {
        const on = sw.dataset.colorKey === selectedColorKey;
        sw.classList.toggle("is-on", on);
        sw.setAttribute("aria-checked", String(on));
      });
      root.querySelectorAll(".sizeopt").forEach((button) => {
        const on = button.dataset.size === selectedSize;
        button.classList.toggle("is-on", on);
        button.setAttribute("aria-checked", String(on));
      });
      const hexEl = root.querySelector("[data-sw-hex]");
      const skuEl = root.querySelector("[data-sw-sku]");
      const priceEl = root.querySelector("[data-price]");
      const stockEl = root.querySelector("[data-stock]");
      if (hexEl) hexEl.textContent = swatchLabel(variant.color);
      if (skuEl) { skuEl.textContent = variant.sku || ""; skuEl.hidden = !variant.sku; }
      if (priceEl) priceEl.innerHTML = `${money(priceOf(variant))}${p.was ? `<s>${money(p.was)}</s>` : ""}`;
      if (stockEl) {
        const q = stockOf(variant);
        stockEl.innerHTML = `<i class="dot"></i> ${q > 0 ? `${q} in stock` : "Currently unavailable"}`;
      }
      showGallery(galleryIndexByVariantId.get(Number(variant.id)) ?? 0);
      const nextUrl = new URL(location.href);
      nextUrl.searchParams.set("variant", variant.id);
      history.replaceState(null, "", nextUrl);
  };

  root.querySelectorAll(".sw").forEach((sw) => sw.addEventListener("click", () => {
    const rows = colorGroups.get(sw.dataset.colorKey) || [];
    const next = (sizeField && selectedSize ? rows.find((v) => variantSizeValue(v, sizeField) === selectedSize) : null) || rows[0];
    selectVariant(next);
  }));
  root.querySelectorAll(".sizeopt").forEach((button) => button.addEventListener("click", () => {
    selectedSize = button.dataset.size;
    const sameColorRows = colorGroups.get(selectedColorKey) || [];
    const next = sameColorRows.find((v) => variantSizeValue(v, sizeField) === selectedSize)
      || variants.find((v) => variantSizeValue(v, sizeField) === selectedSize)
      || selectedVariant;
    selectVariant(next);
  }));
  if (selectedVariant) selectVariant(selectedVariant);

  /* The size table is reference material, not a decision that has to block the
     page, so it opens in place in the accordion above Specifications. As a
     modal it also had to be dismissed before the sizes it describes could be
     used, which is the wrong way round. */
  root.querySelector("[data-open-size-guide]")?.addEventListener("click", () => {
    const panel = root.querySelector("#size-guide");
    if (!panel) return;
    const head = panel.querySelector(".acc__hd");
    if (!panel.classList.contains("is-open")) {
      panel.classList.add("is-open");
      head?.setAttribute("aria-expanded", "true");
      const icon = head?.querySelector(".acc__ico");
      if (icon) icon.textContent = "–";
    }
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    head?.focus({ preventScroll: true });
  });

  initAcc(root);

  /* Add to bag */
  root.querySelector("[data-add]")?.addEventListener("click", (e) => {
    addToBag(Number(e.currentTarget.dataset.add), 1, selectedVariant);
    document.querySelector('[data-open="cart"]')?.click();
  });
  root.querySelector("[data-buy]")?.addEventListener("click", (e) => {
    addToBag(Number(e.currentTarget.dataset.buy), 1, selectedVariant);
    location.href = "checkout.html";
  });

  /* Mobile sticky buy bar */
  const bar = document.querySelector(".buybar");
  if (bar) {
    bar.querySelector(".price").innerHTML = `${money(p.price)}${p.was ? `<s>${money(p.was)}</s>` : ""}`;
    bar.querySelector(".cap").textContent = p.qty > 0 ? `${p.qty} in stock` : "Unavailable";
    bar.querySelector("button").addEventListener("click", () => {
      addToBag(p.id, 1, selectedVariant);
      document.querySelector('[data-open="cart"]')?.click();
    });
    const gal = root.querySelector(".gal");
    if (gal) {
      const sync = () => bar.classList.toggle("is-on", gal.getBoundingClientRect().bottom < 0);
      new IntersectionObserver(([en]) => bar.classList.toggle("is-on", !en.isIntersecting), { threshold: 0 }).observe(gal);
      /* Scroll fallback: the observer does not fire in environments where
         rendering updates are suspended, and the bar is the only way to buy
         on mobile. */
      addEventListener("scroll", sync, { passive: true });
      sync();
    }
  }
}

document.addEventListener("catalog:ready", async () => initPDP(await loadCatalog()));
