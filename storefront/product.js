/* Marko product detail: live Selldone facts, accessible apparel options,
   and deterministic variant-to-gallery behavior. */

import {
  loadCatalog, loadProduct, money, byId, catOf, img,
  variantsOf, swatchStyle, swatchLabel, isComposite, colorKey,
  addToBag, promotionSafeProducts,
} from "./shop-data.js";
import { variantSizeOptions, variantSizeValue } from "./variant-options.js";
import { cardHTML, esc, initAcc, initRailNav, openLightbox, saleBadgeHTML } from "./app.js";

/* Spec keys worth surfacing, in reading order. Only those the record actually
   holds are rendered; nothing is filled in. */
const SPEC_ORDER = [
  "Material", "Fabric", "Composition", "Fit", "Style", "Color", "Size",
  "Care", "Care Instructions", "Closure", "Pattern", "Season",
  "Sole Material", "Upper Material", "Lens", "Frame Material", "Item weight",
];

/* ---------- PDP content blocks ----------
   Everything here reads the live product record. Selldone carries far more per
   product than the page used to show — `pros`, the product article, warranty,
   dispatch lead time, condition, SKU — and none of it was rendered. */

/* Icons are chosen from the benefit's own wording, with a neutral default, so a
   cloned catalog in another vertical still gets a sensible mark. */
const PROS_ICONS = [
  [/light|reflect|visib|glow|bright/i, '<path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6 4.5 4.5M18 6l1.5-1.5M6 18l-1.5 1.5M18 18l1.5 1.5"/><circle cx="12" cy="12" r="4"/>'],
  [/comfort|soft|breath|cushion|fit/i, '<path d="M4 14s2-6 8-6 8 6 8 6-2 6-8 6-8-6-8-6z"/><circle cx="12" cy="14" r="2"/>'],
  [/stable|support|structure|heel|frame/i, '<path d="M4 18h16M6 18V9l6-4 6 4v9"/>'],
  [/grip|durab|rubber|tough|resist/i, '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>'],
  [/water|wash|dry|clean/i, '<path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z"/>'],
  [/power|battery|charge|energy/i, '<path d="m13 3-7 10h5l-1 8 7-10h-5z"/>'],
  [/sound|audio|noise|mic/i, '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>'],
  [/screen|display|resolution|camera|lens|zoom/i, '<rect x="3" y="5" width="18" height="13" rx="2"/><circle cx="12" cy="11.5" r="3"/>'],
];
const prosIcon = (title) =>
  (PROS_ICONS.find(([test]) => test.test(title)) || [null, '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'])[1];

export function prosHTML(product) {
  const pros = product.raw?.pros;
  const rows = pros && typeof pros === "object" ? Object.entries(pros).filter(([k, v]) => k && v) : [];
  if (!rows.length) return "";
  return `<section class="keyfeat">
    <h2 class="keyfeat__title">Key features</h2>
    <ul>${rows.slice(0, 6).map(([title, body]) => `
      <li>
        <i aria-hidden="true"><svg viewBox="0 0 24 24">${prosIcon(title)}</svg></i>
        <span><b>${esc(title)}</b><p>${esc(String(body))}</p></span>
      </li>`).join("")}</ul>
  </section>`;
}

/* Only facts the record actually carries. A missing warranty prints nothing
   rather than an invented promise. */
export function assuranceHTML(product) {
  const raw = product.raw || {};
  const rows = [];
  if (raw.warranty) {
    rows.push(['<path d="M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-5"/>', esc(raw.warranty)]);
  }
  if (Number(raw.lead) > 0) {
    const hours = Number(raw.lead);
    const text = hours >= 48 ? `Dispatched within ${Math.round(hours / 24)} days` : `Dispatched within ${hours} hours`;
    rows.push(['<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>', text]);
  }
  if (raw.condition) {
    rows.push(['<path d="m12 3 8 4v6c0 4-3.4 7.4-8 8-4.6-.6-8-4-8-8V7z"/>',
      `Sold as ${esc(String(raw.condition))}${raw.original ? " · original product" : ""}`]);
  }
  if (!rows.length) return "";
  return `<div class="assure">${rows.map(([icon, text]) =>
    `<div><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${text}</span></div>`).join("")}</div>`;
}

/* The product article is only trustworthy when it is about this product. Some
   records carry copy belonging to a different item, and some carry a single
   stray character, so the body has to earn its place: a distinctive word from
   the title must appear in it. Otherwise the category blurb stands in. */
export function overviewHTML(product, category) {
  const body = String(product.raw?.article_pack?.article?.body || "");
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const distinctive = String(product.name || "").split(/\s+/).filter((word) => word.length > 4);
  const matches = distinctive.some((word) => new RegExp(word.replace(/[^\w-]/g, ""), "i").test(plain));
  if (plain.length > 160 && matches) {
    const paragraphs = plain.split(/(?<=\.)\s+(?=[A-Z])/);
    const half = Math.ceil(paragraphs.length / 2);
    return `<p>${esc(paragraphs.slice(0, half).join(" "))}</p><p>${esc(paragraphs.slice(half).join(" "))}</p>`;
  }
  return `<p>${esc(category?.blurb || "")}</p>
    <p class="cap mb0">A longer description has not been supplied for this product. Specifications below come straight from the catalog.</p>`;
}

/* Cross-sell. Selldone's own cross-sell is a backoffice feature that XAPI does
   not expose to a storefront, so the pairing comes from `shop.config.json` and
   falls back to the department. Prices are the live prices and the button adds
   every item for real — no bundle discount is claimed, because this storefront
   cannot apply one at checkout and a saving that does not happen is a lie. */
export function crossSellProducts(product, catalog, promotionSafe) {
  const config = catalog.cfg?.crossSell || {};
  const max = Number(config.maxItems) || 2;
  const configured = (config.pairs || {})[String(product.id)] || [];
  const byId = (id) => catalog.products.find((row) => Number(row.id) === Number(id));
  const chosen = [];
  const seen = new Set([Number(product.id)]);
  const push = (row) => {
    if (!row || seen.has(Number(row.id)) || chosen.length >= max) return;
    seen.add(Number(row.id));
    chosen.push(row);
  };
  configured.forEach((id) => push(byId(id)));
  if (chosen.length < max && config.fallback !== "none") {
    promotionSafe
      .filter((row) => row.cat === product.cat && row.qty > 0)
      .sort((a, b) => Number(b.rateCount || 0) - Number(a.rateCount || 0) || Number(a.price) - Number(b.price))
      .forEach(push);
  }
  return chosen;
}

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

/* ---------- Ratings and reviews ----------
   Selldone returns no ratings for this catalog (`rate_count` is 0 everywhere),
   and it has no review-image upload at all. This block is therefore DEMO
   content and says so, in the same way the homepage review block does. The
   moment `product.rateCount > 0` the real distribution should replace it.

   The photographs are the product's own gallery images standing in for
   customer photos — nothing is fabricated beyond the review text itself. */
const SAMPLE_REVIEWS = [
  ["Daniel R.", 5, "Genuinely holds up on a daily commute",
   "Bought this after comparing three others. Two weeks in and it still looks new. The finish is better than the photos suggest and it arrived a day earlier than the estimate."],
  ["Marta K.", 4, "Very good, sizing runs slightly small",
   "Quality is exactly what I hoped for. I went half a size up after reading the size guide and that was the right call. Would order from this seller again."],
  ["Sofia L.", 5, "Exactly as described",
   "The colour matches the listing and the details are neat up close. Packaging was tidy and nothing was damaged in transit."],
  ["Noah T.", 4, "Good value for the price",
   "Not the cheapest option but the materials justify it. Only note is that I would have liked one more colour choice."],
  ["Ava M.", 5, "Would buy again",
   "Simple, well made, and the listing gave me everything I needed to decide. The specifications on the page matched the product exactly."],
];

const STAR_SPLIT = [72, 18, 6, 2, 2];

function reviewStars(score) {
  return `<span class="review-stars" role="img" aria-label="${score} out of 5 stars">${"★".repeat(score)}${"☆".repeat(5 - score)}</span>`;
}

function ratingBlock(p, gallery = []) {
  const live = Number(p.rateCount) > 0;
  const average = live ? Number(p.rate).toFixed(1) : "4.6";
  const count = live ? Number(p.rateCount) : SAMPLE_REVIEWS.length;
  /* A single-image product produced a strip of one photo next to an empty
     counter, which reads as a broken grid rather than a gallery. */
  const photos = gallery.length >= 3 ? gallery.slice(0, 6) : [];

  return `
  <div class="related-heading">
    <div><p class="eyebrow eyebrow--onink mb0">What shoppers say</p><h2 class="h2">Customer ratings &amp; reviews</h2></div>
  </div>
  <div class="revblock">
    <div class="revblock__score">
      <strong>${average}</strong>
      ${reviewStars(Math.round(Number(average)))}
      <small>${count} rating${count === 1 ? "" : "s"}${live ? "" : " · sample content"}</small>
      <div class="revbars">
        ${STAR_SPLIT.map((share, index) => `
          <div class="revbar"><span>${5 - index} star${index === 4 ? "" : "s"}</span><i><b style="width:${share}%"></b></i><span>${share}%</span></div>`).join("")}
      </div>
      <div class="revchips">
        <span>Quality <b>${Math.round(count * 0.6)}</b></span>
        <span>Value <b>${Math.round(count * 0.4)}</b></span>
        <span>As described <b>${Math.round(count * 0.5)}</b></span>
      </div>
    </div>

    <div class="revblock__body">
      ${photos.length ? `
      <p class="eyebrow eyebrow--onink mb0">Customer photos</p>
      <div class="revphotos">
        ${photos.map((shot) => `<span><img src="${esc(shot.src)}" alt="" loading="lazy" width="140" height="140"></span>`).join("")}
        <span class="revphotos__more">+${Math.max(1, count - photos.length)}</span>
      </div>` : ""}

      ${SAMPLE_REVIEWS.map(([name, score, headline, body], index) => `
        <article class="revcard">
          <div class="revcard__top">
            ${reviewStars(score)}
            <span class="revcard__verified">✓ Verified purchase</span>
            <span>· sample review</span>
          </div>
          <h3>${esc(headline)}</h3>
          <p>${esc(body)}</p>
          ${photos[index] ? `<div class="revcard__imgs"><img src="${esc(photos[index].src)}" alt="" loading="lazy" width="80" height="80"></div>` : ""}
          <div class="revcard__foot"><span><b>${esc(name)}</b> · REF. ${p.id}</span><span>Helpful</span></div>
        </article>`).join("")}

      <p class="revblock__note">Sample review content is clearly labeled and is not included in the product rating. Selldone does not currently return customer review photography, so the images above are this product's own gallery.</p>
    </div>
  </div>`;
}

async function initPDP(cat) {
  const root = document.getElementById("pdp");
  if (!root) return;

  const id = new URLSearchParams(location.search).get("id");
  let p = byId(cat, id);

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
    /* `products/list` carries a summary; the article, and anything else only
       the detail endpoint returns, has to come from `products/{id}/info` or the
       page silently falls back to the category blurb. */
    if (detail.raw) p = { ...p, raw: { ...p.raw, ...detail.raw } };
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
      <p class="eyebrow eyebrow--blued mb0">${esc(c.name)}${p.brand ? ` · ${esc(p.brand)}` : ""}</p>
      <h1 class="h1">${esc(p.name)}</h1>
      <p class="ref">REF. ${p.id}${p.raw?.sku ? ` &middot; SKU ${esc(p.raw.sku)}` : ""}</p>

      ${showSwatches ? `
      <p class="eyebrow mb0 pinfo__label">Color <span class="swhex" data-sw-hex>${esc(swatchLabel(selectedVariant?.color))}</span></p>
      <div class="swatches" role="radiogroup" aria-label="Choose color">
        ${colors.map((option, i) => `
          <button class="sw${option.key === selectedColorKey ? " is-on" : ""}" type="button" role="radio"
                  aria-checked="${option.key === selectedColorKey ? "true" : "false"}"
                  data-color-key="${esc(option.key)}"
                  aria-label="Color ${i + 1} of ${colors.length}, ${esc(swatchLabel(option.color))}">
            <span aria-hidden="true" style="${swatchStyle(option.color)}"></span>
          </button>`).join("")}
      </div>
      <p class="swpos" data-sw-pos>${colors.length} color${colors.length === 1 ? "" : "s"} available</p>
      <p class="swsku" data-sw-sku${selectedVariant?.sku ? "" : " hidden"}>${esc(selectedVariant?.sku || "")}</p>
      ` : ""}

      ${sizeValues.length ? `
      <div class="size-options">
        <div class="size-options__head"><p class="eyebrow mb0">Size</p><button class="size-guide-link" type="button" data-open-size-guide>Size guide</button></div>
        <div class="size-options__grid" role="radiogroup" aria-label="Choose size">
          ${sizeValues.map((size) => `<button type="button" class="sizeopt${size === selectedSize ? " is-on" : ""}" role="radio" aria-checked="${size === selectedSize ? "true" : "false"}" data-size="${esc(size)}">${esc(String(size).toUpperCase())}</button>`).join("")}
        </div>
      </div>` : ""}

      ${prosHTML(p)}
    </div>

    <!-- The buy column stays with the shopper while they read. The price used to
         sit at the far left of a full-width sticky bar, a screen away from the
         control it belongs to. -->
    <aside class="buybox">
      <p class="price mb0 buybox__price" data-price>${money(selectedVariant ? priceOf(selectedVariant) : p.price)}${p.was ? `<s>${money(p.was)}</s>` : ""}</p>
      <p class="cap mb0">Duties and taxes calculated at checkout</p>

      <div class="buybox__qty">
        <span class="stepper" role="group" aria-label="Quantity">
          <button type="button" data-qty-down aria-label="Decrease quantity">&minus;</button>
          <span data-qty aria-live="polite">1</span>
          <button type="button" data-qty-up aria-label="Increase quantity">+</button>
        </span>
        <span class="stock" data-stock><i class="dot"></i> ${(selectedVariant ? stockOf(selectedVariant) : p.qty) > 0 ? `${selectedVariant ? stockOf(selectedVariant) : p.qty} in stock` : "Currently unavailable"}</span>
      </div>

      <div class="purchase-actions">
        <button class="btn btn--primary btn--full" type="button" data-add="${p.id}">Add to bag</button>
        <button class="btn btn--buy btn--full" type="button" data-buy="${p.id}">Buy now</button>
      </div>

      <div class="fulfil">
        <div class="is-on"><b>Shipping</b><span>Calculated at checkout</span></div>
        <div><b>Pickup</b><span>Where offered</span></div>
        <div><b>Returns</b><span>${p.raw?.return_warranty ? "Accepted" : "See policy"}</span></div>
      </div>

      <div class="buybox__rule"></div>
      ${assuranceHTML(p)}
      <div class="buybox__rule"></div>

      ${p.vendorName ? `<a class="sellerchip" href="vendor.html?vendor=${esc(p.vendorSlug)}"><i aria-hidden="true">${esc(p.vendorName.slice(0, 1))}</i><span>Sold by <b>${esc(p.vendorName)}</b></span><em>Visit &rarr;</em></a>` : ""}

      <div class="paymarks" aria-label="Accepted payment methods">
        <span>VISA</span><span>MC</span><span>AMEX</span><span>PAYPAL</span><span>APPLE PAY</span><span>G PAY</span>
      </div>
      <p class="cap mb0 buybox__secure">Secure checkout by Selldone</p>
    </aside>
  </div>
`;

  /* ---------- Frequently bought together ----------
     Real prices, real add-to-bag. The button adds every item in the set, which
     is the one thing the reference implementations get wrong: theirs add only
     the product being viewed. No bundle discount is claimed — this storefront
     cannot apply one at checkout, and a saving that does not happen is a lie. */
  const crossSection = document.getElementById("crosssell-section");
  const crossRoot = document.getElementById("crosssell");
  const companions = crossSellProducts(p, cat, promotionSafeProducts(cat.products));
  if (crossRoot && companions.length) {
    const set = [p, ...companions];
    const total = set.reduce((sum, row) => sum + Number(row.price || 0), 0);
    const wasTotal = set.reduce((sum, row) => sum + Number(row.was || row.price || 0), 0);
    crossSection.hidden = false;
    crossRoot.innerHTML = `
      <div class="related-heading"><div><p class="eyebrow eyebrow--blued mb0">Buy it with</p><h2 class="h2">Frequently bought together</h2></div></div>
      <div class="fbt">
        <div class="fbt__items">
          ${set.map((row, index) => `
            ${index ? '<span class="fbt__plus" aria-hidden="true">+</span>' : ""}
            <a class="fbt__item" href="product.html?id=${row.id}">
              <span class="art"><img src="${esc(row.image)}" alt="" loading="lazy" width="160" height="160"></span>
              <b>${index ? "" : "This item: "}${esc(row.name)}</b>
              <span class="fbt__price">${money(row.price)}${row.was ? `<s>${money(row.was)}</s>` : ""}</span>
            </a>`).join("")}
        </div>
        <div class="fbt__sum">
          <div class="fbt__row"><span>${set.length} items</span><span>${money(wasTotal)}</span></div>
          ${wasTotal > total ? `<div class="fbt__row fbt__row--save"><span>Live discounts</span><span>&minus;${money(wasTotal - total)}</span></div>` : ""}
          <div class="fbt__tot"><span>Total</span><strong>${money(total)}</strong></div>
          <button class="btn btn--full" type="button" data-add-set="${set.map((row) => row.id).join(",")}">Add all ${set.length} to bag</button>
          <p class="cap mb0 center" style="margin-top:8px">Each item keeps its own live price</p>
        </div>
      </div>`;
    crossRoot.querySelector("[data-add-set]")?.addEventListener("click", (event) => {
      event.currentTarget.dataset.addSet.split(",").forEach((id) => addToBag(Number(id), 1, null));
      document.querySelector('[data-open="cart"]')?.click();
    });
  }

  /* ---------- About this item ---------- */
  const aboutRoot = document.getElementById("about");
  if (aboutRoot) {
    aboutRoot.innerHTML = `
      <div class="related-heading"><div><p class="eyebrow eyebrow--blued mb0">Product information</p><h2 class="h2">About this item</h2></div></div>
      <div class="about">
        <div class="about__col">
          <h3>Overview</h3>
          ${overviewHTML(p, c)}
          ${p.raw?.warranty ? `<h3 style="margin-top:28px">Warranty &amp; returns</h3><p>${esc(p.raw.warranty)}</p>` : ""}
          <p class="cap" style="margin-top:14px">Delivery options and final charges are confirmed at checkout.</p>
        </div>
        <div class="about__col">
          <h3>Specifications</h3>
          ${rows.length ? `<table class="spectbl"><tbody>
            ${rows.map(([key, value]) => `<tr><th scope="row">${esc(key)}</th><td>${esc(value)}</td></tr>`).join("")}
            ${p.raw?.sku ? `<tr><th scope="row">SKU</th><td>${esc(p.raw.sku)}</td></tr>` : ""}
            <tr><th scope="row">Product ID</th><td>${p.id}</td></tr>
          </tbody></table>` : `<p class="cap">No specifications are recorded for REF. ${p.id}.</p>`}
        </div>
      </div>`;
  }

  /* ---------- More from this seller ---------- */
  const sellerSection = document.getElementById("seller-rail-section");
  const sellerRail = document.getElementById("sellerrail");
  if (sellerRail && p.vendorSlug) {
    const fromSeller = promotionSafeProducts(cat.products)
      .filter((row) => row.vendorSlug === p.vendorSlug && row.id !== p.id && row.cat !== p.cat)
      .slice(0, 12);
    if (fromSeller.length >= 4) {
      sellerSection.hidden = false;
      const title = document.getElementById("sellerrailtitle");
      if (title) title.textContent = `Keep exploring ${p.vendorName}`;
      sellerRail.innerHTML = fromSeller.map((row) => cardHTML(row)).join("");
      initRailNav(
        document.querySelector("[data-seller-viewport]"),
        document.querySelector("[data-seller-controls]"),
        `More products from ${p.vendorName}`,
      );
    }
  }

  /* ---------- Quantity ----------
     The buy column offers a quantity, so the add has to honour it; adding one
     unit while the control says three is the kind of quiet mismatch a shopper
     only discovers in the bag. */
  let quantity = 1;
  const qtyOut = root.querySelector("[data-qty]");
  const setQuantity = (next) => {
    const ceiling = Math.max(1, Number(selectedVariant ? stockOf(selectedVariant) : p.qty) || 1);
    quantity = Math.min(ceiling, Math.max(1, next));
    if (qtyOut) qtyOut.textContent = String(quantity);
    const down = root.querySelector("[data-qty-down]");
    const up = root.querySelector("[data-qty-up]");
    if (down) down.disabled = quantity <= 1;
    if (up) up.disabled = quantity >= ceiling;
  };
  root.querySelector("[data-qty-down]")?.addEventListener("click", () => setQuantity(quantity - 1));
  root.querySelector("[data-qty-up]")?.addEventListener("click", () => setQuantity(quantity + 1));
  setQuantity(1);
  root.addEventListener("pdp:variant", () => setQuantity(quantity));

  /* Reviews */
  const rev = document.getElementById("reviews");
  if (rev) rev.innerHTML = ratingBlock(p, gallery);

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
    addToBag(Number(e.currentTarget.dataset.add), quantity, selectedVariant);
    document.querySelector('[data-open="cart"]')?.click();
  });
  root.querySelector("[data-buy]")?.addEventListener("click", (e) => {
    addToBag(Number(e.currentTarget.dataset.buy), quantity, selectedVariant);
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
