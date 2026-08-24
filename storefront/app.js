/* Marko — storefront UI.
   Ported from design-reference/app.js. Behaviour is the prototype's; the data
   behind it is live Selldone, including customer login and checkout hand-off. */

import {
  loadCatalog, money, img, catOf, byId,
  swatchStyle, swatchLabel, isComposite, isPromotionSafeProduct,
  readBag, addToBag, removeFromBag, bagCount, bagLines, bagSubtotal,
  subscribe, loadOrders,
} from "./shop-data.js";
import { storefrontAuth } from "../shared/auth-client.js";
import { shopConfig, isUnconfigured } from "./shop-config.js";

let CAT = null;

function saleEndOf(p) {
  const end = p?.saleEndsAt || p?.raw?.dis_end || p?.dis_end || "";
  const timestamp = Date.parse(end);
  return Number.isFinite(timestamp) && timestamp > Date.now() ? { end, timestamp } : null;
}

/* A countdown is an urgency signal, so it only earns space while the deadline
   is actually near. Selldone discount windows are routinely months long, and
   rendering "ends in 60d" on every discounted card turned the grid into noise
   and said nothing true about urgency. */
const SALE_URGENCY_WINDOW = 7 * 24 * 60 * 60 * 1000;

export function saleBadgeHTML(p, context = "card") {
  const sale = saleEndOf(p);
  const active = p?.was || (Number(p?.discount) > 0 && (!p?.dis_start || Date.now() >= Date.parse(p.dis_start)));
  if (!active || !sale) return "";
  if (sale.timestamp - Date.now() > SALE_URGENCY_WINDOW) return "";
  return `<span class="sale-countdown sale-countdown--${context}" data-sale-end="${esc(sale.end)}" role="status" aria-label="Timed sale ends at ${esc(sale.end)}">
    <b>Ends in</b><span data-sale-timer>--:--:--</span>
  </span>`;
}

function startSaleCountdowns() {
  const tick = () => {
    const now = Date.now();
    document.querySelectorAll("[data-sale-end]").forEach((badge) => {
      const remaining = Math.max(0, Date.parse(badge.dataset.saleEnd) - now);
      if (!remaining) {
        badge.remove();
        return;
      }
      const totalSeconds = Math.floor(remaining / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const pad = (value) => String(value).padStart(2, "0");
      const timer = badge.querySelector("[data-sale-timer]");
      if (timer) timer.textContent = `${days ? `${pad(days)}d ` : ""}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    });
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- Shared storefront chrome ----------
   Every public page uses one header and footer contract. Older standalone
   pages still carry equivalent static markup as a no-JS fallback; this
   replacement runs before any header behavior is wired, so the live interface
   is identical everywhere and future chrome changes have one source. */
const SHARED_PLATFORM_BAR_HTML = `<div class="sdbar" data-shared-platform="v1">
  <p class="sdbar__in"><svg class="sdbar__hx" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.7 4.4 13a4.8 4.8 0 0 1 6.8-6.8l.8.8.8-.8A4.8 4.8 0 1 1 19.6 13Z"/></svg><span class="sdbar__made">Made with</span><a href="https://selldone.com" rel="noopener">Selldone</a></p>
</div>`;

const SHARED_HEADER_HTML = `<header class="hdr fashioni-header market-header" data-shared-chrome="v3">
  <div class="topbar"><span class="topbar__long" data-announce-long>Free pickup · Easy returns · Secure checkout</span><span class="topbar__short" data-announce-short>Easy returns · Secure checkout</span></div>
  <div class="market-primary">
    <button class="market-menu-toggle" type="button" data-open="nav" aria-label="Open menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <a class="logo market-logo" href="index.html" aria-label="Marko home">marko<span aria-hidden="true">✦</span></a>
    <a class="market-location" href="shop.html"><small>How do you want your items?</small><b>Delivery or pickup</b></a>
    <button class="header-search" type="button" data-open="search" aria-label="Search everything at Marko"><span>Search everything at Marko</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/></svg></button>
    <div class="hdr__tools"><div class="hdr__act">
      <button class="iconbtn market-account" type="button" data-open="account" aria-label="Account"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg><span><small>Sign in</small><b>Account</b></span></button>
      <button class="iconbtn" type="button" data-open="cart" aria-label="Open bag, 0 items"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span class="cartdot" data-cart-count hidden>0</span></button>
    </div></div>
  </div>
  <div class="fashioni-navrow market-navrow"><nav class="nav audience-nav" aria-label="Main">
    <a class="market-departments" href="shop.html" data-nav-panel="departments" aria-haspopup="true" aria-expanded="false">☰ Departments</a><a href="shop.html?cats=activewear%2Cfootwear%2Cdresses-and-one-pieces%2Ctops-and-t-shirts%2Csunglasses%2Cbags-and-accessories%2Cshorts%2Cjackets-and-layers&amp;label=Fashion" data-nav-panel="fashion" aria-haspopup="true" aria-expanded="false">Fashion</a><a href="shop.html?cats=laptop%2Cmonitors%2Ctvs%2Cheadphones%2Cearbuds&amp;label=Electronics" data-nav-panel="electronics" aria-haspopup="true" aria-expanded="false">Electronics</a><a href="shop.html?audience=women" data-nav-panel="women" aria-haspopup="true" aria-expanded="false">Women</a><a href="shop.html?audience=men" data-nav-panel="men" aria-haspopup="true" aria-expanded="false">Men</a><a href="shop.html?audience=kids" data-nav-panel="kids" aria-haspopup="true" aria-expanded="false">Kids</a><a href="brands.html" data-nav-panel="brands" aria-haspopup="true" aria-expanded="false">Brands</a>
  </nav><div class="mega-overlay" data-mega-overlay></div><div class="mega" aria-hidden="true"><div class="mega__grid" id="megagrid"></div></div></div>
</header>`;

const SHARED_FOOTER_HTML = `<footer class="ft ink market-footer"><div class="wrap"><div class="ft__cols"><div class="ft__col ft__brand"><p class="logo market-logo">marko<span>✦</span></p><p class="lede" data-brand-tagline>Everything you need, from people you can trust.</p></div><div class="ft__col ft__departments"><h4>Departments</h4><div class="ft__links-split" data-collections></div></div><div class="ft__col"><h4>Shop</h4><ul><li><a href="vendors.html">Our sellers</a></li><li><a href="brands.html">Brands</a></li></ul></div><div class="ft__col"><h4>Customer care</h4><ul><li><a href="/about-us">About Marko</a></li><li><a href="/terms#delivery">Delivery</a></li><li><a href="/terms#returns">Returns</a></li><li><a href="/contact-us">Contact us</a></li></ul></div></div><div class="ft__bar"><span>© 2026 Marko Marketplace</span><span>Secure commerce by Selldone</span></div></div></footer>`;

const SHARED_OVERLAYS_HTML = `<div class="drawer ink" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true"><div class="drawer__top"><span class="eyebrow">Menu</span><button class="xbtn" type="button" data-close>Close</button></div><nav data-drawer-nav aria-label="Mobile"></nav></div>
<aside class="cart" role="dialog" aria-modal="true" aria-label="Shopping bag" aria-hidden="true"><div class="cart__hd"><span class="eyebrow mb0" data-cart-label>Your bag · 0</span><button class="xbtn" type="button" data-close>Close</button></div><div class="cart__body" data-cart-body></div><div class="cart__ft" data-cart-foot hidden><div class="sum__tot"><span class="eyebrow mb0">Subtotal</span><span class="price" data-cart-total>$0</span></div><a class="btn btn--full" href="checkout.html">Checkout</a><p class="cap center">Delivery, taxes, and payment are confirmed by Selldone.</p></div></aside>
<aside class="sheet sheet--search" role="dialog" aria-modal="true" aria-label="Search products" aria-hidden="true"><div class="sheet__hd"><span class="eyebrow mb0">Search Marko</span><button class="xbtn" type="button" data-close>Close</button></div><div class="sheet__pad"><label class="sr" for="q">Search products</label><input id="q" type="search" autocomplete="off" placeholder="Product, brand, or category" data-search-input data-autofocus /><p class="cap" data-search-count></p></div><div class="sheet__body" data-search-results></div></aside>
<aside class="sheet sheet--account" role="dialog" aria-modal="true" aria-label="Account" aria-hidden="true"><div class="sheet__hd"><span class="eyebrow mb0">Account</span><button class="xbtn" type="button" data-close>Close</button></div><div class="sheet__body" data-account-body></div></aside>
<div class="scrim"></div>`;

function initSharedChrome() {
  document.querySelector(".page")?.classList.add("fashioni-page");

  const header = document.querySelector("header.hdr,header.cohdr");
  if (header && header.dataset.sharedChrome !== "v3") {
    header.outerHTML = SHARED_HEADER_HTML;
  }

  const liveHeader = document.querySelector("header.hdr,header.cohdr");
  const platformBar = document.querySelector(".sdbar");
  if (platformBar) platformBar.outerHTML = SHARED_PLATFORM_BAR_HTML;
  else liveHeader?.insertAdjacentHTML("beforebegin", SHARED_PLATFORM_BAR_HTML);

  const footer = document.querySelector("footer.ft");
  if (footer) footer.outerHTML = SHARED_FOOTER_HTML;

  if (!document.querySelector(".drawer")) {
    document.body.insertAdjacentHTML("beforeend", SHARED_OVERLAYS_HTML);
  }
}

/* ---------- Shared card ----------
   One card for every surface: shop grid, homepage rails, savings panels,
   related strips and seller pages. A module that needs a denser card passes
   `compact` rather than forking the markup, which is what previously let the
   homepage and the shop drift into two different cards.

   Reading order is price → name → brand, because that is the order a shopper
   scans a retail grid in. The badge is derived from live data only: a real
   `clearance` tag supplied by the caller, otherwise a discount the catalog
   actually carries. There is no decorative "New in" flag. */
const savingsBadge = (p) => {
  if (!(Number(p.was) > Number(p.price))) return "";
  const percent = Math.round(((p.was - p.price) / p.was) * 100);
  return percent >= 5 ? `Save ${percent}%` : "";
};

export function cardHTML(p, { compact = false, badge = "" } = {}) {
  const saleBadge = saleBadgeHTML(p);
  const flag = badge || savingsBadge(p);
  /* Same rule as the product page: a single colour is not a choice, so a card
     with one swatch shows none. Keeps the grid from implying variety that the
     catalog does not have. */
  const distinctColors = [...new Set(p.colors || [])];
  /* Five is what fits on one line of a rail card. A sixth wrapped the row and
     made that one card 44px taller than every other card beside it, which is
     the unequal-height defect the vendor audit measured. The remainder is
     counted rather than dropped silently, and the product page shows them all. */
  const SWATCH_SLOTS = 5;
  const overflowColors = Math.max(0, distinctColors.length - SWATCH_SLOTS);
  const shownColors = overflowColors
    ? distinctColors.slice(0, SWATCH_SLOTS - 1)
    : distinctColors.slice(0, SWATCH_SLOTS);
  const colors = compact || distinctColors.length < 2 ? [] : shownColors.map((color) => {
    const variants = (p.variants || []).filter((variant) => String(variant.color).toUpperCase() === String(color).toUpperCase());
    const imageVariant = variants.find((variant) => variant.image) || variants[0];
    return { color, variantId: imageVariant?.id || "", image: imageVariant?.image ? img(imageVariant.image) : p.image };
  });
  const priceNow = p.range?.varies
    ? `<span class="price__from">from</span> ${money(p.range.from)}`
    : money(p.price);
  return `<article class="pcard${compact ? " pcard--compact" : ""}${saleBadge ? " has-timed-sale" : ""}" data-card-product="${p.id}">
    <a class="pcard__link" href="product.html?id=${p.id}">
      <div class="pcard__art">
        ${flag ? `<span class="pcard__badge">${esc(flag)}</span>` : ""}
        ${saleBadge}
        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy" width="500" height="500" data-card-image>
      </div>
      <p class="price mb0 pcard__price"><span class="price__now">${priceNow}</span>${p.was ? `<s>${money(p.was)}</s>` : ""}</p>
      <span class="pcard__name">${esc(p.name)}</span>
      <p class="pcard__meta">${esc(p.brand || p.catName)}</p>
    </a>
    ${colors.length
      ? `<span class="pcard__swatches" role="radiogroup" aria-label="Choose a color for ${esc(p.name)}">${colors.map((option, index) => `<button class="pcard__swatch${index ? "" : " is-on"}" type="button" role="radio" aria-checked="${index ? "false" : "true"}" aria-label="${esc(swatchLabel(option.color))}" data-card-color="${esc(String(option.color))}" data-card-variant="${option.variantId}" data-card-image-src="${esc(option.image)}"><span aria-hidden="true" style="${swatchStyle(option.color)}"></span></button>`).join("")}${overflowColors ? `<span class="pcard__swatch-more">+${overflowColors}</span>` : ""}</span>`
      /* MK-016 — the slot exists even when the product has no colours, so a
         rail of cards keeps one shared bottom edge instead of stepping wherever
         a swatch row happens to appear. It reserves height only when a sibling
         card in the same group actually has swatches; see the `:has` rule. */
      : `<span class="pcard__swatches" aria-hidden="true"></span>`}
  </article>`;
}

function initCardSwatches() {
  const onSwatchClick = (event) => {
    const swatch = event.target.closest(".pcard__swatch");
    if (!swatch) return;
    event.preventDefault();
    event.stopPropagation();
    const card = swatch.closest("[data-card-product]");
    const cardImage = card?.querySelector("[data-card-image]");
    const productLink = card?.querySelector(".pcard__link");
    const mappedImage = swatch.dataset.cardImageSrc;
    if (mappedImage && cardImage) {
      cardImage.src = mappedImage;
      cardImage.alt = `${cardImage.alt.split(", ")[0]}, ${swatch.getAttribute("aria-label")}`;
    }
    card?.querySelectorAll(".pcard__swatch").forEach((button) => {
      const selected = button === swatch;
      button.classList.toggle("is-on", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    if (productLink && swatch.dataset.cardVariant) {
      const target = new URL(productLink.href, location.href);
      target.searchParams.set("variant", swatch.dataset.cardVariant);
      productLink.href = `${target.pathname.split("/").pop()}${target.search}`;
    }
  };

  const bind = (root = document) => root.querySelectorAll(".pcard__swatches:not([data-swatch-wired])").forEach((group) => {
    group.dataset.swatchWired = "true";
    group.addEventListener("click", onSwatchClick);
  });
  bind();
  new MutationObserver((records) => {
    if (records.some((record) => record.addedNodes.length)) bind();
  }).observe(document.body, { childList: true, subtree: true });
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Template banner ----------
   Fires on "still the template OR no shop id at all" — never on a specific
   shop id. The storefront has no fallback shop any more, so an empty config
   produces an empty catalogue rather than someone else's; either way the
   operator needs telling, loudly, before they show it to a customer.

   Amber, the same #E0A800 on #FFF8E1 as the setup banner and the
   sign-in callout: one amber across the site means one category of message —
   this is scaffolding, not the shop speaking. Above everything, including the
   platform credit, because it is the most important thing on the page until
   it goes away. */
async function initTemplateBanner() {
  const cfg = await shopConfig();
  if (!isUnconfigured(cfg)) return;
  const name = cfg.shop?.name || "the template";
  const el = document.createElement("div");
  el.className = "tplbanner";
  el.setAttribute("role", "status");
  el.innerHTML = `<p class="tplbanner__in">
    <b>These are sample products from the ${esc(name)} template, not yours.</b>
    <span>Ask your agent to add your products to make this site your own.</span>
  </p>`;
  document.body.insertBefore(el, document.body.firstChild);
}

/* ---------- Brand copy ----------
   Founding year, cities, tagline and the announcement line all come from the
   config. Where the shop has no equivalent the element is REMOVED, not filled
   with a placeholder: an empty rail label is invisible, whereas "EST. ----"
   is a lie with a hyphen in it. */
async function fillBrandCopy() {
  const cfg = await shopConfig();
  const b = cfg.brand || {};

  const set = (sel, text) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (text) el.textContent = text;
      else el.remove();
    });
  };

  set("[data-brand-est]", b.foundedYear ? `EST. ${b.foundedYear}` : "");
  set("[data-announce-long]", b.announcement || "");
  set("[data-announce-short]", b.announcementShort || b.announcement || "");

  // Tagline and cities are two sentences; either can be absent on its own.
  const line = [b.tagline, b.cities ? `${b.cities}.` : ""].filter(Boolean).join(" ");
  set("[data-brand-tagline]", line);

  // Checkout's hand-delivery line names the cities where it is offered. With
  // no cities configured it stays "By appointment" rather than naming nowhere.
  document.querySelectorAll("[data-brand-cities-line]").forEach((el) => {
    el.textContent = b.cities ? `By appointment, ${b.cities} only` : "By appointment";
  });

  fillContactDetails(cfg);
}

/* Merchant identity and contact, on the same terms as the brand copy above: a
   value the config does not carry removes its row rather than printing a
   placeholder, so a clone that has not filled these in shows a shorter list
   instead of a list of lies.

   `isDemonstration` exists because this storefront is published on a public
   domain with a working checkout. A visitor who lands on /terms is entitled to
   know whether there is a company behind it. Saying so plainly is also why
   `registration` stays null: an invented company number is the one value here
   that could actually mislead someone, so the notice states that no registered
   entity exists rather than inventing one that appears to. */
function fillContactDetails(cfg) {
  const c = cfg.contact || {};

  const row = (selector, value, format = (v) => v) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (value) el.innerHTML = format(value);
      else el.closest("[data-contact-row]")?.remove() ?? el.remove();
    });
  };

  row("[data-contact-entity]", c.entity);
  row("[data-contact-email]", c.email, (v) => `<a href="mailto:${v}">${v}</a>`);
  row("[data-contact-phone]", c.phone, (v) => `<a href="tel:${v.replace(/\s+/g, "")}">${v}</a>`);
  row("[data-contact-address]", c.address);
  row("[data-contact-hours]", c.hours);
  row("[data-contact-response]", c.responseTime);
  row("[data-contact-registration]", c.registration);

  /* One sentence, shown wherever a page would otherwise imply a trading entity. */
  document.querySelectorAll("[data-legal-status]").forEach((el) => {
    if (!c.isDemonstration) { el.remove(); return; }
    el.textContent = "Marko is a demonstration marketplace built on Selldone. "
      + "It is not a registered trading company, the contact details below are "
      + "reserved documentation placeholders, and no order placed here is a real "
      + "purchase.";
  });
}

/* ---------- Theme picker ---------- */
const FASHIONI_THEMES = [
  { id: "rose", name: "Coral", swatch: "#E54832" },
  { id: "blue", name: "Ocean", swatch: "#1673D1" },
  { id: "emerald", name: "Forest", swatch: "#16855D" },
  { id: "violet", name: "Plum", swatch: "#7D4CC2" },
  { id: "amber", name: "Amber", swatch: "#D87910" },
];

function initThemePicker() {
  const storageKey = "fashioni_theme_v1";
  const themeIds = new Set(FASHIONI_THEMES.map(({ id }) => id));
  let activeTheme = "blue";

  try {
    const savedTheme = localStorage.getItem(storageKey);
    if (themeIds.has(savedTheme)) activeTheme = savedTheme;
  } catch {
    // Storage can be unavailable in private or hardened browser contexts.
  }

  const applyTheme = (theme, persist = true) => {
    const nextTheme = themeIds.has(theme) ? theme : "blue";
    const themeDetails = FASHIONI_THEMES.find(({ id }) => id === nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.querySelectorAll("[data-theme-option]").forEach((button) => {
      button.setAttribute("aria-checked", String(button.dataset.themeOption === nextTheme));
    });
    document.querySelectorAll("[data-theme-current]").forEach((label) => {
      label.textContent = themeDetails.name;
    });
    document.querySelectorAll("[data-theme-trigger]").forEach((trigger) => {
      trigger.style.setProperty("--swatch", themeDetails.swatch);
    });
    if (persist) {
      try { localStorage.setItem(storageKey, nextTheme); } catch { /* no-op */ }
    }
  };

  document.querySelectorAll(".sdbar__in").forEach((bar) => {
    if (bar.querySelector("[data-theme-picker]")) return;
    const picker = document.createElement("span");
    picker.className = "theme-picker";
    picker.dataset.themePicker = "";
    picker.innerHTML = `<button class="theme-picker__trigger" type="button" data-theme-trigger aria-haspopup="menu" aria-expanded="false">
      <span class="theme-picker__swatch" aria-hidden="true"></span>
      <span data-theme-current>Ocean</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </button>
    <span class="theme-picker__menu" data-theme-menu role="menu" aria-label="Colour theme" hidden>
      ${FASHIONI_THEMES.map(({ id, name, swatch }) =>
        `<button class="theme-picker__item" type="button" role="menuitemradio" data-theme-option="${id}" aria-checked="false" style="--swatch:${swatch}">
          <span class="theme-picker__swatch" aria-hidden="true"></span>
          <strong>${name}</strong>
          <span class="theme-picker__check" aria-hidden="true">✓</span>
        </button>`
      ).join("")}
    </span>`;
    const trigger = picker.querySelector("[data-theme-trigger]");
    const menu = picker.querySelector("[data-theme-menu]");
    const closeMenu = (restoreFocus = false) => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) trigger.focus();
    };
    trigger.addEventListener("click", () => {
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) menu.querySelector('[aria-checked="true"]')?.focus();
    });
    picker.addEventListener("click", (event) => {
      const option = event.target.closest("[data-theme-option]");
      if (option) {
        applyTheme(option.dataset.themeOption);
        closeMenu(true);
      }
    });
    document.addEventListener("click", (event) => {
      if (!picker.contains(event.target)) closeMenu();
    });
    picker.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        closeMenu(true);
      }
    });
    bar.append(picker);
  });

  applyTheme(activeTheme, false);
}

/* ---------- Header, rail, drawers ---------- */
function initHeader() {
  const hdr = document.querySelector(".hdr");
  if (hdr) {
    const s = () => hdr.classList.toggle("is-stuck", scrollY > 120);
    s();
    addEventListener("scroll", s, { passive: true });
  }

  const scrim = document.querySelector(".scrim");
  let lastFocus = null;

  const open = (el) => {
    if (!el) return;
    lastFocus = document.activeElement;
    el.classList.add("is-open");
    scrim?.classList.add("is-on");
    document.documentElement.classList.add("is-locked");
    el.setAttribute("aria-hidden", "false");
    // The first focusable in a panel is its Close button. Where the panel has a
    // field that is the point of opening it, send focus there instead.
    (el.querySelector("[data-autofocus]") || focusables(el)[0])?.focus();
  };
  const closeAll = () => {
    let had = false;
    document.querySelectorAll(".drawer,.cart,.filters,.sheet").forEach((e) => {
      if (e.classList.contains("is-open")) had = true;
      e.classList.remove("is-open");
      if (!e.classList.contains("filters")) e.setAttribute("aria-hidden", "true");
    });
    scrim?.classList.remove("is-on");
    if (!document.querySelector(".lbox.is-open")) document.documentElement.classList.remove("is-locked");
    if (had && lastFocus) { lastFocus.focus(); lastFocus = null; }
  };

  document.querySelector('[data-open="nav"]')?.addEventListener("click", () => open(document.querySelector(".drawer")));
  document.querySelector('[data-open="cart"]')?.addEventListener("click", () => open(document.querySelector(".cart")));
  document.querySelector('[data-open="filters"]')?.addEventListener("click", () => open(document.querySelector(".filters")));
  document.querySelector('[data-open="search"]')?.addEventListener("click", () => open(document.querySelector(".sheet--search")));
  document.querySelector('[data-open="account"]')?.addEventListener("click", () => {
    open(document.querySelector(".sheet--account"));
    renderAccount();   // refetches, so a session that expired while the tab sat open shows as signed out
  });
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeAll));
  scrim?.addEventListener("click", closeAll);

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeAll(); closeLightbox(); return; }
    if (e.key !== "Tab") return;
    const panel = document.querySelector(".drawer.is-open,.cart.is-open,.lbox.is-open,.sheet.is-open");
    if (!panel) return;
    trapTab(e, panel);
  });

  /* Dev affordance: ?open=nav|cart opens a drawer directly so a panel state can
     be captured without a click. */
  const want = new URLSearchParams(location.search).get("open");
  if (want === "nav") open(document.querySelector(".drawer"));
  if (want === "cart") open(document.querySelector(".cart"));
}

const focusables = (root) =>
  [...root.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null || el === document.activeElement);

function trapTab(e, panel) {
  const f = focusables(panel);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function initReveal() {
  const els = [...document.querySelectorAll(".reveal")];
  if (!els.length) return;
  // No observer support: leave everything visible, skip the animation entirely.
  if (!("IntersectionObserver" in window)) return;

  // Arm the animation. Everything above was rendered opaque, so reaching this
  // line is what opts the page into hiding-then-revealing.
  document.documentElement.classList.add("js-reveal");
  // Same synchronous task: anything already on screen is marked revealed before
  // the browser paints, so nothing that was visible flashes out.
  els.forEach((e) => {
    if (e.getBoundingClientRect().top < innerHeight) e.classList.add("is-in");
  });

  const io = new IntersectionObserver(
    (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }),
    { rootMargin: "0px 0px -8% 0px" }
  );
  els.forEach((e) => io.observe(e));
}

export function initAcc(root = document) {
  root.querySelectorAll(".acc__hd").forEach((h) => {
    if (h.dataset.wired) return;
    h.dataset.wired = "1";
    h.addEventListener("click", () => {
      const a = h.closest(".acc"), open = a.classList.toggle("is-open");
      h.setAttribute("aria-expanded", String(open));
      h.querySelector(".acc__ico").textContent = open ? "–" : "+";
    });
  });
}

/* ---------- Mega menu + footer collections ---------- */
function fillNav() {
  const mega = document.getElementById("megagrid");
  if (mega) {
    const row = mega.closest(".fashioni-navrow");
    const panel = mega.closest(".mega");
    const overlay = row?.querySelector("[data-mega-overlay]");
    const navLinks = [...(row?.querySelectorAll("[data-nav-panel]") || [])];
    const category = (slug) => CAT.cats.find((item) => item.slug === slug);
    const audience = (slug) => CAT.audiences?.find((item) => item.slug === slug);
    const linkRow = ({ label, href }) =>
      `<a href="${href}"><span>${esc(label)}</span></a>`;
    const groupedCategory = (label, slugs) => {
      const rows = slugs.map(category).filter(Boolean);
      const count = rows.reduce((sum, item) => sum + Number(item.count || 0), 0);
      const query = encodeURIComponent(rows.map((item) => item.slug).join(","));
      return { label, count, href: `shop.html?cats=${query}&label=${encodeURIComponent(label)}` };
    };
    const audienceRows = ["women", "men", "girls", "boys", "baby"]
      .map(audience).filter(Boolean).map((item) => ({
        label: item.title, count: item.count, href: `shop.html?audience=${item.slug}`,
      }));
    const fashionRows = [
      groupedCategory("Activewear", ["activewear"]),
      groupedCategory("Footwear", ["footwear"]),
      groupedCategory("Dresses & One-Pieces", ["dresses-and-one-pieces"]),
      groupedCategory("Tops & T-Shirts", ["tops-and-t-shirts"]),
      groupedCategory("Sunglasses", ["sunglasses"]),
      groupedCategory("Bags & Accessories", ["bags-and-accessories"]),
      groupedCategory("Bottoms & Layers", ["shorts", "jackets-and-layers"]),
    ].filter((item) => item.count);
    const microphone = category("microphones");
    const audioSlugs = ["headphones", "earbuds"];
    const techRows = [
      groupedCategory("Laptops", ["laptop"]),
      groupedCategory("Displays & TVs", ["monitors", "tvs"]),
      groupedCategory("Audio", audioSlugs),
      ...(Number(microphone?.count) >= 10 ? [groupedCategory("Microphones", ["microphones"])] : []),
    ].filter((item) => item.count);
    const popularBrands = [...CAT.brands]
      .sort((a, b) => Number(b.count) - Number(a.count) || a.name.localeCompare(b.name))
      .slice(0, 12);
    const topBrandRows = popularBrands.slice(0, 6).map((brand) => ({
      label: brand.name, count: brand.count,
      href: `shop.html?brand=${encodeURIComponent(brand.name)}`,
    }));
    const visual = ({ href, image, label, detail = "", alt = label }) => `
      <a class="mega__visual" href="${href}">
        <img src="${esc(image || "")}" alt="${esc(alt)}" loading="lazy" width="320" height="220">
        <span><b>${esc(label)}</b>${detail}</span>
      </a>`;
    const women = audience("women");
    const techHero = category("laptop") || category("monitors");
    const fashionArt = [category("activewear"), category("dresses-and-one-pieces")].filter(Boolean);
    const techArt = [category("laptop"), category("tvs") || category("monitors")].filter(Boolean);
    const departmentsMenu = `
      <div class="mega__column"><b>Shop by audience</b>${audienceRows.map(linkRow).join("")}</div>
      <div class="mega__column"><b>Fashion</b>${fashionRows.map(linkRow).join("")}</div>
      <div class="mega__column"><b>Tech</b>${techRows.map(linkRow).join("")}</div>
      <div class="mega__column"><b>Top brands</b>${topBrandRows.map(linkRow).join("")}<a class="mega__text-link" href="brands.html">View all brands <span aria-hidden="true">→</span></a></div>
      <div class="mega__visuals mega__visuals--two">
        ${visual({ href: "shop.html?audience=women", image: women?.image, label: "Women's edit" })}
        ${visual({ href: "shop.html?cats=laptop%2Cmonitors%2Ctvs&label=New%20in%20tech", image: techHero?.image, label: "New in tech" })}
      </div>
      <div class="mega__footer"><a href="shop.html">View all products <span aria-hidden="true">→</span></a></div>`;
    const compactCategoryPanel = (title, rows, tiles) => {
      const tileMarkup = tiles.slice(0, 2).map((item) => visual({
        href: `shop.html?cat=${encodeURIComponent(item.slug)}`,
        image: item.image,
        label: item.name,
      })).join("");
      return `<div class="mega__compact"><div class="mega__column"><b>${esc(title)}</b>${rows.map(linkRow).join("")}</div><div class="mega__visuals mega__visuals--two">${tileMarkup}</div></div>`;
    };
    const audiencePanel = (slug, title) => {
      const slugs = slug === "kids" ? ["girls", "boys"] : [slug];
      const rows = CAT.cats.map((item) => ({
        label: item.name,
        count: CAT.products.filter((product) => slugs.some((value) => product.audiences?.includes(value)) && product.cat === item.slug).length,
        href: `shop.html?audience=${slug}&cat=${item.slug}`,
      })).filter((item) => item.count).sort((a, b) => b.count - a.count).slice(0, 6);
      const tiles = rows.slice(0, 2).map((item, index) => {
        const cat = category(new URL(item.href, location.href).searchParams.get("cat"));
        return visual({
          href: item.href,
          image: cat?.image || audience(slugs[index] || slugs[0])?.image,
          label: index ? `New in ${title.toLowerCase()}` : `${title} edit`,
        });
      }).join("");
      return `<div class="mega__compact mega__compact--audience"><div class="mega__column"><b>${esc(title)}</b>${rows.map(linkRow).join("")}<a class="mega__text-link" href="shop.html?audience=${slug}">Shop all ${esc(title.toLowerCase())} →</a></div><div class="mega__visuals mega__visuals--two">${tiles}</div></div>`;
    };
    const brandVisuals = popularBrands.slice(0, 2).map((brand) => {
      const product = CAT.products.find((item) => item.brand === brand.name && isPromotionSafeProduct(item));
      return visual({
        href: `shop.html?brand=${encodeURIComponent(brand.name)}`,
        image: product?.image,
        label: brand.name,
        alt: `${brand.name} product`,
      });
    }).join("");
    const brandMenu = `
      <div class="mega__brands-head"><b>Popular brands</b><div class="mega__brand-links"><a href="brands.html">All brands</a><a href="brands.html#all-brands">A–Z directory</a></div></div>
      <div class="mega__brand-list">${popularBrands.map((brand) => linkRow({ label: brand.name, count: brand.count, href: `shop.html?brand=${encodeURIComponent(brand.name)}` })).join("")}</div>
      <div class="mega__visuals mega__visuals--two mega__visuals--brands">${brandVisuals}</div>`;
    const menus = {
      departments: departmentsMenu,
      fashion: compactCategoryPanel("Fashion categories", fashionRows, fashionArt),
      electronics: compactCategoryPanel("Tech categories", techRows, techArt),
      women: audiencePanel("women", "Women"),
      men: audiencePanel("men", "Men"),
      kids: audiencePanel("kids", "Kids"),
      brands: brandMenu,
    };
    let closeTimer = 0;
    const closeMenu = () => {
      clearTimeout(closeTimer);
      row?.classList.remove("has-open-mega");
      panel?.classList.remove("is-open");
      overlay?.classList.remove("is-open");
      panel?.setAttribute("aria-hidden", "true");
      navLinks.forEach((link) => link.setAttribute("aria-expanded", "false"));
    };
    const showMenu = (mode, trigger) => {
      clearTimeout(closeTimer);
      mega.innerHTML = menus[mode] || departmentsMenu;
      panel?.classList.toggle("mega--departments", mode === "departments");
      panel?.classList.toggle("mega--brands", mode === "brands");
      panel?.classList.toggle("mega--compact", !["departments", "brands"].includes(mode));
      row?.classList.add("has-open-mega");
      panel?.classList.add("is-open");
      overlay?.classList.add("is-open");
      panel?.setAttribute("aria-hidden", "false");
      navLinks.forEach((link) => link.setAttribute("aria-expanded", String(link === trigger)));
    };
    navLinks.forEach((link) => {
      const open = () => showMenu(link.dataset.navPanel, link);
      link.addEventListener("pointerenter", open);
      link.addEventListener("focus", open);
    });
    row?.addEventListener("pointerleave", () => { closeTimer = window.setTimeout(closeMenu, 120); });
    row?.addEventListener("pointerenter", () => clearTimeout(closeTimer));
    row?.addEventListener("focusout", (event) => {
      if (!row.contains(event.relatedTarget)) closeMenu();
    });
    row?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const activeTrigger = row.querySelector('[aria-expanded="true"]');
        closeMenu();
        activeTrigger?.focus();
      }
    });
  }

  document.querySelectorAll("[data-collections]").forEach((container) => {
    const audiences = (CAT.audiences || []).filter((item) =>
      ["women", "men", "girls", "boys", "baby"].includes(item.slug));
    /* Departments come from the live catalogue. The previous list named this
       shop's own slugs, so a clone selling jewelry inherited a footer of links
       to categories it does not have. */
    const departments = (CAT.cats || [])
      .slice(0, 6)
      .map((item) => ({ href: `shop.html?cat=${encodeURIComponent(item.slug)}`, label: item.name }));
    const links = [
      ...audiences.map((item) => ({ href: `shop.html?audience=${item.slug}`, label: item.title })),
      ...departments,
      { href: "shop.html", label: "View all products" },
    ];
    const midpoint = Math.ceil(links.length / 2);
    const list = (items) => `<ul>${items.map((item) => `<li><a href="${item.href}">${esc(item.label)}</a></li>`).join("")}</ul>`;
    container.innerHTML = list(links.slice(0, midpoint)) + list(links.slice(midpoint));
  });

  document.querySelectorAll("[data-drawer-nav]").forEach((nav) => {
    nav.innerHTML =
      `<a href="shop.html">All Products</a>` +
      (CAT.audiences || []).map((a) =>
      `<a href="shop.html?audience=${a.slug}">${esc(a.title)}</a>`).join("") +
      CAT.cats.map((c) =>
        `<a href="shop.html?cat=${c.slug}">${esc(c.name)}</a>`).join("") +
      `<a href="brands.html">Brands</a>` +
      `<a href="/contact-us">Customer support</a>`;
  });
}

/* ---------- Bag drawer ---------- */
function renderBag() {
  const n = bagCount();
  document.querySelectorAll("[data-cart-count]").forEach((e) => {
    e.textContent = String(n);
    e.hidden = n === 0;
  });
  document.querySelectorAll("[data-cart-label]").forEach((e) => {
    e.textContent = `Your bag · ${n}`;
  });
  const btn = document.querySelector('[data-open="cart"]');
  if (btn) btn.setAttribute("aria-label", n === 1 ? "Open bag, 1 item" : `Open bag, ${n} items`);

  const body = document.querySelector("[data-cart-body]");
  const foot = document.querySelector("[data-cart-foot]");
  if (!body) return;

  const lines = bagLines(CAT);
  if (!lines.length) {
    body.innerHTML = `<div style="padding:48px 0;text-align:center">
      <p class="h3" style="margin-bottom:8px">Your bag is empty</p>
      <p class="cap" style="margin-bottom:24px">Nothing selected yet.</p>
      <a class="btn btn--line" href="shop.html">Browse products</a></div>`;
    if (foot) foot.hidden = true;
    return;
  }
  if (foot) foot.hidden = false;

  body.innerHTML = lines.map((r) => `
    <div class="cart__row">
      <img src="${r.p.image}" alt="${esc(r.p.name)}" width="64" height="64" loading="lazy">
      <div>
        <b style="font-weight:500;font-size:14px">${esc(r.p.name)}</b>
        <p class="ref mb0" style="margin-top:4px">REF. ${r.p.id} · Qty ${r.qty}</p>
        <button class="cap" data-remove="${r.p.id}" style="margin-top:8px;text-decoration:underline;min-height:44px">Remove</button>
      </div>
      <span class="price">${money(r.p.price * r.qty)}</span>
    </div>`).join("");

  const tot = document.querySelector("[data-cart-total]");
  if (tot) tot.textContent = money(bagSubtotal(CAT));

  body.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => removeFromBag(b.dataset.remove)));
}

/* ---------- Horizontal rails ----------
   MK-012 / MK-017. A rail used to be a bare overflow container: no role, no
   label, no tab stop and no visible control, so its content was reachable by
   trackpad or drag and by nothing else. Two rails on the vendor page held
   3,340px of products behind that.

   The rail keeps native scrolling — touch and trackpad behave exactly as
   before — and gains the things a scroll container cannot imply on its own:
   a name, a tab stop, and buttons that page by one card and disable at each
   end. The buttons hide themselves when everything already fits. */
export function initRailNav(rail, nav, label) {
  if (!rail || rail.dataset.railWired) return;
  rail.dataset.railWired = "1";

  if (label) {
    rail.setAttribute("role", "group");
    rail.setAttribute("aria-label", label);
  }
  /* A scrollable region needs a tab stop, or keyboard users cannot reach the
     content that is scrolled out of view. */
  rail.tabIndex = 0;

  const step = () => {
    const first = rail.firstElementChild;
    if (!first) return rail.clientWidth;
    const gap = parseFloat(getComputedStyle(rail).columnGap || "0") || 0;
    return first.getBoundingClientRect().width + gap;
  };

  const prev = nav?.querySelector("[data-rail-prev]");
  const next = nav?.querySelector("[data-rail-next]");
  const sync = () => {
    const max = rail.scrollWidth - rail.clientWidth - 1;
    if (prev) prev.disabled = rail.scrollLeft <= 0;
    if (next) next.disabled = rail.scrollLeft >= max;
    if (nav) nav.hidden = max <= 0;
  };

  prev?.addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: "smooth" }));
  next?.addEventListener("click", () => rail.scrollBy({ left: step(), behavior: "smooth" }));
  rail.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    rail.scrollBy({ left: event.key === "ArrowLeft" ? -step() : step(), behavior: "smooth" });
  });
  rail.addEventListener("scroll", sync, { passive: true });
  addEventListener("resize", sync);
  /* Cards arrive after the catalog resolves, so the first measurement can be
     of an empty rail. */
  new ResizeObserver(sync).observe(rail);
  sync();
}

/* ---------- Catalog error state ----------
   One renderer for every page. The catalog reads are bounded by a timeout, so
   a stalled load now ends here rather than sitting on skeletons forever — and
   an error the visitor cannot act on is only marginally better than the
   skeletons, hence the retry. */
export function showCatalogError(text = "The catalog could not be loaded.") {
  document.querySelectorAll("[data-catalog-error]").forEach((node) => {
    node.hidden = false;
    node.textContent = "";
    node.append(`${text} `);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "linkish";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => location.reload());
    node.append(retry);
  });
}

/* ---------- Gallery lightbox ---------- */
export function openLightbox(src, cap) {
  let box = document.querySelector(".lbox");
  if (!box) return;
  const im = box.querySelector("img");
  im.src = src;
  im.alt = cap || "";
  im.hidden = false;
  box.querySelector(".lbox__cap").textContent = cap || "";
  box.classList.add("is-open");
  box.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("is-locked");
  box.querySelector(".lbox__x")?.focus();
}
export function closeLightbox() {
  const box = document.querySelector(".lbox.is-open");
  if (!box) return;
  box.classList.remove("is-open");
  box.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".drawer.is-open,.cart.is-open")) document.documentElement.classList.remove("is-locked");
}

/* ---------- Newsletter ---------- */
/* The footer Subscribe button had no handler on all seven pages that carry a
   footer. It posts to the Selldone audience stream now. Unlike the rest of the
   storefront this is a write, so it is the one control that needs in-flight
   state and a spoken result — a form that silently does nothing is worse than
   one that is visibly absent. */
function initNewsletter() {
  const box = document.querySelector(".sub");
  if (!box) return;
  const input = box.querySelector("input[type=email]");
  const btn = box.querySelector("button");
  if (!input || !btn) return;

  const say = document.createElement("p");
  say.className = "cap sub__say";
  say.setAttribute("role", "status");        // announced without stealing focus
  say.hidden = true;
  box.after(say);

  const show = (msg, bad) => {
    say.textContent = msg;
    say.hidden = false;
    say.classList.toggle("is-bad", Boolean(bad));
  };

  let busy = false;
  async function send() {
    if (busy) return;
    const email = input.value.trim();
    // Let the browser's own email validation speak first; it is localised.
    if (!email || !input.checkValidity()) {
      show("Enter an email address so we know where to write.", true);
      input.focus();
      return;
    }
    busy = true;
    btn.disabled = true;
    input.disabled = true;
    show("Signing you up…");
    try {
      await subscribe(email);
      show("Thank you — we will write when something arrives.");
      input.value = "";
    } catch (err) {
      show(err.message || "That did not go through. Try again shortly.", true);
      console.error("[fashioni] subscribe failed", err);
    } finally {
      busy = false;
      btn.disabled = false;
      input.disabled = false;
    }
  }

  btn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  });
}

/* ---------- Search ---------- */
/* Client-side over the catalogue already in memory, matching the reference app.
   a catalogue this size does not justify a round-trip per keystroke, and the
   storefront has the whole list loaded before the button can be clicked. */
function initSearch() {
  const sheet = document.querySelector(".sheet--search");
  if (!sheet) return;
  const input = sheet.querySelector("[data-search-input]");
  const out = sheet.querySelector("[data-search-results]");
  const count = sheet.querySelector("[data-search-count]");

  const norm = (v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

  function run() {
    if (!CAT) { count.textContent = "Loading the catalog…"; return; }
    const q = norm(input.value).trim();
    if (!q) {
      out.innerHTML = "";
      count.textContent = "Search by product, brand, or category.";
      return;
    }
    // Every term must appear somewhere in the record, so "molino gold" narrows
    // rather than widening the way an OR match would.
    const terms = q.split(/\s+/);
    const hits = CAT.products.filter((p) => {
      const hay = norm([p.name, p.brand, p.catName, p.id].join(" "));
      return terms.every((t) => hay.includes(t));
    });

    count.textContent = hits.length ? "Matching products" : "No matching products";
    out.innerHTML = hits.length
      ? hits.map((p) => `<a class="sres${saleBadgeHTML(p, "search") ? " has-timed-sale" : ""}" href="product.html?id=${p.id}">
          <span class="sres__art">${saleBadgeHTML(p, "search")}<img src="${p.image}" alt="" loading="lazy" width="56" height="56"></span>
          <span><b>${esc(p.name)}</b><span class="cap">${esc(p.catName)}${p.brand ? " · " + esc(p.brand) : ""}</span></span>
          <span class="price sres__price">${p.was ? `<s>${money(p.was)}</s>` : ""}<span>${money(p.price)}</span></span>
        </a>`).join("")
      : `<div class="sempty">
           <p class="h3" style="margin-bottom:6px">Nothing matches “${esc(input.value.trim())}”</p>
           <p class="cap">Try a brand, category, or part of a product name.</p>
         </div>`;
  }

  input.addEventListener("input", run);
  // The catalogue may still be loading when the sheet is first opened.
  document.addEventListener("catalog:ready", run);
  run();
}

/* ---------- Account ---------- */
/* Authorization Code + PKCE, public client. Customer-facing copy never names
   Selldone: the customer is signing in to Marko. Selldone is our
   infrastructure, not the shop's brand.

   Nothing raw is ever shown to a visitor. A failure gets a plain sentence here
   and the detail goes to the console — a stale-cache invalid_client once
   reached the panel as a JSON dump, which told the visitor nothing and hid the
   one line that would have identified it immediately. */
/* Guidance for someone evaluating Selldone, not shop copy. Direct customer
   sign-in only works once the shop owner has set a shop email address; without
   it the visitor is sent to Selldone to register there instead. Nobody cloning
   this repo would guess that, so the storefront says it out loud.

   Amber on purpose — the same amber as the demo-content banner, so it reads as
   "this is scaffolding" rather than as part of the shop's own palette. Rendered
   only when signed out: setup instructions inside an account someone already
   has are clutter. A real shop deletes this once the setting is in place. */
const SIGNIN_NOTE = `<div class="setupnote">
  <span class="setupnote__k">Building your own shop?</span>
  <p>Direct sign-in only works once the shop owner has set an email address under
     <b>Store dashboard → Settings → Email</b>. Until then, customers are sent to
     Selldone to create an account there instead of signing in to the shop itself.</p>
  <p>It is a shop-level setting, so a visitor cannot change it.</p>
</div>`;

async function renderAccount() {
  const body = document.querySelector("[data-account-body]");
  if (!body) return;
  body.innerHTML = `<p class="cap" style="padding:24px 0">Checking your session…</p>`;

  let s;
  try {
    s = await storefrontAuth.session();
  } catch (err) {
    console.error("[fashioni] session lookup failed", err);
    body.innerHTML = `<div class="acct">
      <p class="lede" style="margin-bottom:20px">We could not check whether you are signed in. Try again in a moment.</p>
      <button class="btn btn--full" type="button" data-signin>Sign in</button>
      ${SIGNIN_NOTE}
    </div>`;
    wire(body);
    return;
  }

  if (!s.authenticated) {
    body.innerHTML = `<div class="acct">
      <p class="lede" style="margin-bottom:8px">Sign in to see your orders and saved addresses.</p>
      <p class="cap" style="margin-bottom:24px">Use your Selldone customer account to continue securely.</p>
      <button class="btn btn--full" type="button" data-signin>Sign in</button>
      <p class="cap center" style="margin-top:14px">New here? <button class="linkish" type="button" data-signin>Create account</button></p>
      ${SIGNIN_NOTE}
    </div>`;
    wire(body);
    return;
  }

  /* Name and avatar, order history, sign out. Nothing else — the email sat under
     the name AND in a row of its own, and a "Shop" row interpolated an object
     into a template and rendered [object Object]. */
  const u = s.user || {};
  body.innerHTML = `<div class="acct">
    <div class="acct__id">
      ${u.avatar ? `<img class="acct__av" src="${esc(u.avatar)}" alt="" width="52" height="52">` : `<span class="acct__av"></span>`}
      <span>
        <span class="acct__nm">${esc(u.name || "Signed in")}</span>
        ${u.email ? `<span class="cap" style="display:block">${esc(u.email)}</span>` : ""}
      </span>
    </div>
    <div data-orders><p class="cap" style="margin:22px 0">Loading your orders…</p></div>
    <button class="btn btn--line btn--full" type="button" data-signout>Sign out</button>
  </div>`;
  wire(body);
  renderOrders(body.querySelector("[data-orders]"), s.accessToken);
}

/* Real order history. An empty list says so; a failure says so plainly and logs
   the reason. Neither pretends the feature does not exist. */
async function renderOrders(host, token) {
  if (!host) return;
  try {
    const orders = await loadOrders(token);
    if (!orders || !orders.length) {
      host.innerHTML = `<p class="cap" style="margin:22px 0">No orders yet.</p>`;
      return;
    }
    host.innerHTML = `<p class="eyebrow" style="margin:24px 0 10px">Your orders</p>` +
      orders.map((o) => `<div class="acct__row">
        <span>${o.date ? new Date(o.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : `Order ${o.id}`}${o.status ? ` · ${esc(o.status)}` : ""}</span>
        <span class="price">${money(o.total)}</span>
      </div>`).join("");
  } catch (err) {
    console.error("[fashioni] order history failed", err);
    host.innerHTML = `<p class="cap" style="margin:22px 0">Your orders could not be loaded just now.</p>`;
  }
}

function wire(root) {
  root.querySelectorAll("[data-signin]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      storefrontAuth.startLogin(location.pathname + location.search);
    }));
  root.querySelector("[data-signout]")?.addEventListener("click", () => storefrontAuth.logout(location.pathname));
}

/* Reflect the signed-in state on the header button without opening the sheet,
   so the control is not silent about state it already knows. */
async function markAccountState() {
  const btn = document.querySelector('[data-open="account"]');
  if (!btn) return;
  try {
    const s = await storefrontAuth.session();
    if (s.authenticated) btn.setAttribute("aria-label", `Account — signed in as ${s.user?.name || s.user?.email || "you"}`);
  } catch { /* the button still opens the sheet, which reports the failure */ }
}

/* ---------- Deep-link re-anchor ---------- */
/* The browser jumps to a #hash before the web fonts have loaded. The local
   display and body faces differ from their fallbacks, so the document reflows
   underneath the jump — on a cold load /terms#delivery landed 62px high, which
   put the heading behind the sticky header. Re-anchor once metrics are final,
   but never fight a reader who has already started scrolling. */
function initDeepLink() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id && document.getElementById(id);
  if (!target || !document.fonts) return;

  let moved = false;
  const release = () => { moved = true; };
  const opts = { passive: true, once: true };
  ["wheel", "touchstart", "keydown"].forEach((e) => addEventListener(e, release, opts));

  document.fonts.ready.then(() => {
    if (!moved) target.scrollIntoView(); // honours scroll-margin-top
    ["wheel", "touchstart", "keydown"].forEach((e) => removeEventListener(e, release, opts));
  });
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  startSaleCountdowns();
  /* Register both local brand faces even on routes whose above-the-fold state
     is a skeleton. This prevents a late heading swap when live data arrives. */
  document.fonts?.load('600 16px "Cormorant Garamond"').catch(() => {});
  document.fonts?.load('400 16px "Archivo"').catch(() => {});
  initSharedChrome();
  initCardSwatches();
  // First, so the warning is up before the catalogue resolves. Awaited: the
  // banner shifts the page, and shifting it after the reader has started is
  // worse than a few milliseconds of delay.
  await initTemplateBanner();
  initThemePicker();
  fillBrandCopy();
  initHeader();
  initReveal();
  initAcc();
  initDeepLink();
  initNewsletter();
  initSearch();
  markAccountState();
  document.querySelector(".lbox__x")?.addEventListener("click", closeLightbox);
  document.querySelector(".lbox")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("lbox")) closeLightbox();
  });

  try {
    CAT = await loadCatalog();
  } catch (err) {
    showCatalogError("The catalog could not be loaded from Selldone.");
    console.error("[marko] catalog load failed", err);
    return;
  }

  window.__FASHIONI__ = CAT; // inspection handle for verification
  fillNav();
  renderBag();
  document.addEventListener("bag:changed", renderBag);
  document.dispatchEvent(new Event("catalog:ready"));
});

export { CAT };
