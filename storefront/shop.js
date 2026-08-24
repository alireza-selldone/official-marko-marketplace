/* Marko — shop listing.
   Ported from design-reference/shop.html + initShop(), extended with the
   brand filter. All data live from XAPI. */

import { loadCatalog, money, catOf } from "./shop-data.js";
import { cardHTML, esc } from "./app.js";
import { compareVariantSizes } from "./variant-options.js";

if (new URLSearchParams(location.search).get("view") === "brands") {
  location.replace("brands.html");
}

const lg = Math.log10;

/* Paging. The filters always run over the WHOLE catalogue; only how much of the
   result is painted is paged. Unpaged, the mobile listing ran past 30,000px,
   which is roughly forty screens of scrolling to reach the footer —
   and the footer now carries seven real destinations. Deliberately a button and
   not infinite scroll, which would take the footer away entirely. */
const PAGE = 24;

function initShop(cat) {
  const grid = document.getElementById("pgrid");
  const filters = document.getElementById("filters");
  const more = document.querySelector("[data-more]");
  const moreBtn = document.querySelector("[data-more-btn]");
  const moreCap = document.querySelector("[data-more-cap]");
  let shown = PAGE;
  if (!grid) return;

  /* Catalogue rhythm: title first, then a full-width filter bar. Each group's
     controls are collected into one `.fgroup__panel` so a group is a single
     box to open — the price group alone has four sibling controls, and without
     a wrapper each one had to be positioned individually in CSS. */
  document.querySelector(".listhd")?.after(filters);
  filters.querySelectorAll(".fgroup").forEach((group) => {
    const heading = group.querySelector("h4");
    if (!heading) return;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "filter-trigger";
    trigger.innerHTML = `<span>${heading.textContent}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>`;
    trigger.setAttribute("aria-expanded", "false");
    heading.replaceWith(trigger);

    const panel = document.createElement("div");
    panel.className = "fgroup__panel";
    while (trigger.nextSibling) panel.appendChild(trigger.nextSibling);
    group.appendChild(panel);

    trigger.addEventListener("click", () => {
      filters.querySelectorAll(".fgroup.is-open").forEach((open) => {
        if (open !== group) {
          open.classList.remove("is-open");
          open.querySelector(".filter-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
      const expanded = group.classList.toggle("is-open");
      trigger.setAttribute("aria-expanded", String(expanded));
    });
  });
  /* Clicking away closes an open group, which a dropdown bar needs and an
     always-open sidebar never did. */
  document.addEventListener("click", (event) => {
    if (event.target.closest(".fgroup") || !filters.querySelector(".fgroup.is-open")) return;
    filters.querySelectorAll(".fgroup.is-open").forEach((open) => {
      open.classList.remove("is-open");
      open.querySelector(".filter-trigger")?.setAttribute("aria-expanded", "false");
    });
  });

  const params = new URLSearchParams(location.search);
  const presetCat = params.get("cat");
  const presetCats = new Set([
    ...(presetCat ? [presetCat] : []),
    ...(params.get("cats") || "").split(",").map((value) => value.trim()).filter(Boolean),
  ]);
  const presetLabel = params.get("label");
  const presetBrand = params.get("brand");
  const presetAudience = params.get("audience");
  /* MK-018 — a seller is a real filter, so "View all" on a vendor page has
     somewhere to go. Without it the control could only ever point back at the
     twelve-card rail the visitor was already looking at. */
  const presetVendor = params.get("vendor");
  const matchesPresetAudience = (product) => {
    if (!presetAudience) return true;
    if (presetAudience === "kids") {
      return ["girls", "boys"].some((audience) => product.audiences?.includes(audience));
    }
    if (presetAudience === "adults") {
      return ["women", "men"].some((audience) => product.audiences?.includes(audience));
    }
    return product.audiences?.includes(presetAudience);
  };
  const contextualProducts = cat.products.filter((product) =>
    matchesPresetAudience(product) &&
    (!presetCats.size || presetCats.has(product.cat)) &&
    (!presetVendor || product.vendorSlug === presetVendor) &&
    (!presetBrand || product.brand === presetBrand));

  /* ---- Filter 1: collection ---- */
  const catBox = document.getElementById("catfilters");
  catBox.innerHTML = cat.cats.map((c) => `
    <label class="check">
      <input type="checkbox" value="${c.slug}"${presetCats.has(c.slug) ? " checked" : ""}>
      ${esc(c.name)}
    </label>`).join("");

  /* Size facets belong to the current audience/category/brand context. Building
     them from the whole catalog made Girls inherit adult materials and internal
     legacy tokens from unrelated products. */
  const sizeBox = document.getElementById("sizefilters");
  const sizes = [...new Set(contextualProducts.flatMap((p) => p.sizes || []))]
    .sort(compareVariantSizes);
  sizeBox.innerHTML = sizes.map((size) => `
    <label class="check">
      <input type="checkbox" value="${esc(size)}">${esc(size)}
    </label>`).join("");

  /* ---- Filter 4: brand ---- */
  const brandBox = document.getElementById("brandfilters");
  brandBox.innerHTML = cat.brands.map((b) => `
    <label class="check">
      <input type="checkbox" value="${esc(b.name)}"${presetBrand === b.name ? " checked" : ""}>
      ${esc(b.name)}
    </label>`).join("");

  /* ---- Filter 2: price, logarithmic ----
     most references sit in the lower decade against a six-figure ceiling. On a
     linear track they occupy the first eighth and the control is unusable. */
  const LO = Math.max(cat.lo, 0.01), HI = Math.max(cat.hi, LO);
  const span = lg(HI) - lg(LO);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const toVal = (pos) => span === 0 ? LO : Math.pow(10, lg(LO) + (Number(pos) / 100) * span);
  const toPos = (value) => span === 0 ? 0 : ((lg(clamp(value, LO, HI)) - lg(LO)) / span) * 100;

  const lo = document.getElementById("plo");
  const hi = document.getElementById("phi");
  const out = document.getElementById("pout");
  const outLo = document.getElementById("poutlo");
  const outHi = document.getElementById("pouthi");
  const manualLo = document.getElementById("pmin");
  const manualHi = document.getElementById("pmax");
  const rangeBox = document.getElementById("price-range");
  const sort = document.getElementById("sort");
  const stock = document.getElementById("instock");
  const count = document.getElementById("count");
  const title = document.getElementById("listtitle");
  const intro = document.getElementById("listintro");
  const crumbTitle = document.getElementById("crumbtitle");

  [manualLo, manualHi].forEach((field) => {
    field.min = String(Math.floor(LO));
    field.max = String(Math.ceil(HI));
  });

  function paintPrice(syncFields = true) {
    const a = toVal(lo.value), b = toVal(hi.value);
    const minPrice = Math.floor(a), maxPrice = Math.ceil(b);
    const minText = money(minPrice), maxText = money(maxPrice);
    rangeBox.style.setProperty("--range-start", `${lo.value}%`);
    rangeBox.style.setProperty("--range-end", `${hi.value}%`);
    outLo.textContent = minText;
    outHi.textContent = maxText;
    out.textContent = `Price from ${minText} to ${maxText}`;
    lo.setAttribute("aria-valuetext", minText);
    hi.setAttribute("aria-valuetext", maxText);
    lo.style.zIndex = Number(lo.value) > 88 ? "4" : "3";
    hi.style.zIndex = Number(hi.value) < 12 ? "4" : "3";
    if (syncFields) {
      manualLo.value = String(minPrice);
      manualHi.value = String(maxPrice);
      manualLo.closest(".price-field")?.classList.remove("is-invalid");
      manualHi.closest(".price-field")?.classList.remove("is-invalid");
    }
    return { a, b };
  }

  function render({ syncPriceFields = true } = {}) {
    const picked = [...catBox.querySelectorAll("input:checked")].map((i) => i.value);
    const pickedSizes = [...sizeBox.querySelectorAll("input:checked")].map((i) => i.value);
    const brands = [...brandBox.querySelectorAll("input:checked")].map((i) => i.value);
    const { a, b } = paintPrice(syncPriceFields);
    const atFloor = Number(lo.value) === 0, atCeil = Number(hi.value) === 100;

    const list = cat.products.filter((p) =>
      (!picked.length || picked.includes(p.cat)) &&
      matchesPresetAudience(p) &&
      (!presetVendor || p.vendorSlug === presetVendor) &&
      (!pickedSizes.length || pickedSizes.some((size) => p.sizes?.includes(size))) &&
      (!brands.length || brands.includes(p.brand)) &&
      (atFloor || p.price >= a) && (atCeil || p.price <= b) &&
      (!stock.checked || p.qty > 0));

    if (sort.value === "low") list.sort((x, y) => x.price - y.price);
    if (sort.value === "high") list.sort((x, y) => y.price - x.price);
    if (sort.value === "new") list.sort((x, y) =>
      String(y.raw.created_at || "").localeCompare(String(x.raw.created_at || "")) || y.id - x.id);

    const one = picked.length === 1 ? catOf(cat, picked[0]) : null;
    const audience = cat.audiences?.find((item) => item.slug === presetAudience);
    const audienceTitle = presetAudience === "kids" ? "Kids"
      : presetAudience === "adults" ? "Women & Men"
      : audience?.title;
    const vendorName = presetVendor
      ? cat.products.find((product) => product.vendorSlug === presetVendor)?.vendorName || presetVendor
      : "";
    const pageName = one?.name || presetLabel || audienceTitle || presetBrand || vendorName || "All products";
    title.textContent = pageName;
    if (crumbTitle) crumbTitle.textContent = pageName === "All products" ? "Products" : pageName;
    if (intro) intro.textContent = one ? one.blurb
      : audienceTitle ? `Styles selected for ${audienceTitle.toLowerCase()}.`
      : presetBrand ? `Explore ${presetBrand}.`
      : vendorName ? `Everything listed by ${vendorName} on Marko.`
      : "Browse the full Marko marketplace.";
    count.textContent = list.length ? "Available products" : "No products found";
    if (shown > list.length) shown = Math.max(PAGE, Math.ceil(list.length / PAGE) * PAGE);
    document.title = `${pageName} — Marko`;

    if (list.length) {
      const page = list.slice(0, shown);
      grid.className = "pgrid";
      grid.innerHTML = page.map((product) => cardHTML(product)).join("");
      more.hidden = page.length >= list.length;
      if (!more.hidden) {
        moreBtn.textContent = "Load more";
        moreCap.textContent = "";
      }
    } else {
      more.hidden = true;
      /* Never a blank page: offer three real references either side of the band. */
      const near = [...cat.products]
        .sort((x, y) => Math.abs(x.price - (a + b) / 2) - Math.abs(y.price - (a + b) / 2))
        .slice(0, 3);
      grid.className = "";
      grid.innerHTML = `<div class="empty">
        <p class="h3" style="margin-bottom:8px">Nothing in this range</p>
        <p class="cap" style="margin-bottom:28px">Widen the price band or clear a filter. These sit closest to what you asked for.</p>
        <div class="pgrid" style="text-align:left">${near.map((product) => cardHTML(product)).join("")}</div>
      </div>`;
    }
  }

  /* Any filter change resets paging: staying on page 3 of a set the reader just
     narrowed would hide results they had asked to see. */
  const reset = () => { shown = PAGE; render(); };
  const onSliderInput = (event) => {
    if (event.target === lo && Number(lo.value) > Number(hi.value)) lo.value = hi.value;
    if (event.target === hi && Number(hi.value) < Number(lo.value)) hi.value = lo.value;
    reset();
  };
  [lo, hi].forEach((el) => el.addEventListener("input", onSliderInput));
  [sort, stock].forEach((el) => el.addEventListener("input", reset));

  const applyManual = (field, slider, isMinimum, commit = false) => {
    if (field.value.trim() === "") {
      field.closest(".price-field")?.classList.toggle("is-invalid", !commit);
      if (commit) paintPrice(true);
      return;
    }
    let value = Number(field.value);
    const other = toVal(isMinimum ? hi.value : lo.value);
    const floor = isMinimum ? LO : other;
    const ceiling = isMinimum ? other : HI;
    const valid = Number.isFinite(value) && value >= floor && value <= ceiling;
    field.closest(".price-field")?.classList.toggle("is-invalid", !valid);
    if (!valid && !commit) return;
    value = clamp(Number.isFinite(value) ? value : (isMinimum ? LO : HI), floor, ceiling);
    slider.value = String(toPos(value));
    shown = PAGE;
    render({ syncPriceFields: commit });
  };
  manualLo.addEventListener("input", () => applyManual(manualLo, lo, true));
  manualHi.addEventListener("input", () => applyManual(manualHi, hi, false));
  manualLo.addEventListener("change", () => applyManual(manualLo, lo, true, true));
  manualHi.addEventListener("change", () => applyManual(manualHi, hi, false, true));

  rangeBox.addEventListener("click", (event) => {
    if (event.target.closest(".dual-range__input")) return;
    const rect = rangeBox.getBoundingClientRect();
    const pos = clamp(((event.clientX - rect.left - 8) / Math.max(1, rect.width - 16)) * 100, 0, 100);
    const slider = Math.abs(pos - Number(lo.value)) <= Math.abs(pos - Number(hi.value)) ? lo : hi;
    slider.value = String(pos);
    onSliderInput({ target: slider });
    slider.focus();
  });
  moreBtn.addEventListener("click", () => {
    const before = grid.querySelectorAll(".pcard").length;
    shown += PAGE;
    render();
    // Move focus to the first newly-revealed card so the keyboard does not jump
    // back to the top of the listing.
    grid.querySelectorAll(".pcard")[before]?.focus();
  });
  catBox.addEventListener("change", reset);
  sizeBox.addEventListener("change", reset);
  brandBox.addEventListener("change", reset);
  document.getElementById("clear")?.addEventListener("click", () => {
    catBox.querySelectorAll("input").forEach((i) => (i.checked = false));
    sizeBox.querySelectorAll("input").forEach((i) => (i.checked = false));
    brandBox.querySelectorAll("input").forEach((i) => (i.checked = false));
    lo.value = 0; hi.value = 100; stock.checked = false; sort.value = "new";
    render();
  });

  document.getElementById("filters")?.classList.remove("is-pending");
  render();
}

document.addEventListener("catalog:ready", async () => initShop(await loadCatalog()));
