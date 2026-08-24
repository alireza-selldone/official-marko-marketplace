/* Marko checkout.
   The bag, prices, and stock are the live catalogue's. Delivery pricing, tax,
   gateway choice, payment capture, and order creation stay with the commerce
   platform's secure checkout, so this page never invents a commercial term and
   never asks for a card number: those fields belong on the PCI-compliant step,
   not on a storefront page. */

import {
  loadCatalog, money, bagLines, bagSubtotal, setBagQty, syncBagToSelldone, swatchLabel,
} from "./shop-data.js";
import { variantSizeOptions, variantSizeValue } from "./variant-options.js";
import { storefrontAuth } from "../shared/auth-client.js";
import { getPublicConfig } from "../shared/runtime-config.js";
import { esc } from "./app.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const FREE_DELIVERY_OVER = 45;

/* ---------- chrome ---------- */

const STEPS = ["Bag", "Delivery", "Payment"];

function stepsHTML(active = 1) {
  return `<ol class="costeps__list">${STEPS.map((label, index) => {
    const state = index < active ? "is-done" : index === active ? "is-on" : "";
    return `<li class="${state}"><b>${index + 1}</b><span>${label}</span></li>`;
  }).join("")}</ol>`;
}

/* ---------- panels ---------- */

const ICON = {
  shield: '<path d="M12 3 5 6v5c0 4.6 2.8 8.3 7 10 4.2-1.7 7-5.4 7-10V6z"/><path d="m9 12 2 2 4-5"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};
const svg = (d, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

function panel(number, title, body, aside = "") {
  return `<section class="copanel">
    <div class="copanel__hd"><span class="copanel__n">${number}</span><h2>${title}</h2>${aside}</div>
    <div class="copanel__bd">${body}</div>
  </section>`;
}

function fulfilmentPanel() {
  return panel(1, "How you want it", `
    <div class="copick" role="radiogroup" aria-label="Fulfilment method">
      <label class="is-on">
        <input type="radio" name="fulfil" value="delivery" checked>
        <span class="codot" aria-hidden="true"></span>
        <span><b>Delivery</b><span>To the address below</span>
          <em>Free over ${money(FREE_DELIVERY_OVER)}</em></span>
      </label>
      <label>
        <input type="radio" name="fulfil" value="pickup">
        <span class="codot" aria-hidden="true"></span>
        <span><b>Pickup</b><span>Where the seller offers it</span><em>Free</em></span>
      </label>
    </div>
    <p class="cap mb0" style="margin-top:14px">Available methods and their real prices are confirmed on the secure step.</p>`);
}

function addressPanel() {
  const field = (id, label, attrs = "", hint = "") => `
    <label class="cofield" for="${id}"><span>${label}</span>
      <input id="${id}" name="${id}" ${attrs}>
      ${hint ? `<em>${hint}</em>` : ""}
    </label>`;
  return panel(2, "Where it goes", `
    <div class="cogrid2">
      ${field("co-name", "Full name", 'autocomplete="name" placeholder="First and last name"')}
      ${field("co-phone", "Phone", 'type="tel" autocomplete="tel" placeholder="+1 000 000 0000"')}
    </div>
    ${field("co-email", "Email", 'type="email" autocomplete="email" placeholder="you@example.com"', "Order confirmation and delivery updates go here.")}
    <div class="cogrid2">
      <label class="cofield" for="co-country"><span>Country</span>
        <select id="co-country" name="co-country" autocomplete="country-name">
          <option>United Kingdom</option><option>Germany</option><option>France</option>
          <option>Netherlands</option><option>Spain</option><option>Italy</option>
        </select></label>
      ${field("co-region", "State or region", 'autocomplete="address-level1" placeholder="Region"')}
    </div>
    ${field("co-address", "Address", 'autocomplete="street-address" placeholder="Street, building, neighbourhood"')}
    <div class="cogrid2">
      ${field("co-city", "City", 'autocomplete="address-level2" placeholder="City"')}
      ${field("co-post", "Postal code", 'autocomplete="postal-code" placeholder="Postal code"')}
    </div>
    <label class="cofield mb0" for="co-note"><span>Delivery note <i>(optional)</i></span>
      <textarea id="co-note" name="co-note" rows="3" placeholder="Gate code, safe place, anything the courier should know"></textarea>
    </label>`);
}

const MARKS = ["VISA", "MC", "AMEX", "PYPL", "PAY", "G PAY"];
const marksHTML = (list) => `<span class="comarks">${list.map((m) => `<i>${m}</i>`).join("")}</span>`;

function paymentPanel() {
  const badge = `<span class="copanel__ok">${svg(ICON.shield)}PCI-compliant</span>`;
  return panel(3, "How you pay", `
    <div class="copay" role="radiogroup" aria-label="Payment method">
      <label class="is-on">
        <input type="radio" name="pay" value="card" checked>
        <span class="codot" aria-hidden="true"></span>
        <span><b>Card</b><span>Visa, Mastercard, Amex</span></span>
        ${marksHTML(["VISA", "MC", "AMEX"])}
      </label>
      <label>
        <input type="radio" name="pay" value="wallet">
        <span class="codot" aria-hidden="true"></span>
        <span><b>Wallet</b><span>Apple Pay, Google Pay, PayPal</span></span>
        ${marksHTML(["PAY", "G PAY", "PYPL"])}
      </label>
      <label>
        <input type="radio" name="pay" value="cod">
        <span class="codot" aria-hidden="true"></span>
        <span><b>Cash on delivery</b><span>Pay the courier on arrival</span></span>
        ${marksHTML(["COD"])}
      </label>
    </div>
    <div class="cosecure">
      ${svg(ICON.lock, "cosecure__i")}
      <div><b>Card details are entered on the next step</b>
        <p class="mb0">They are handled by the payment provider on their own encrypted page. This
        site never sees, stores, or transmits a card number, which is why there is no card field here.</p></div>
    </div>`, badge);
}

/* ---------- summary ---------- */

function lineHTML(line) {
  const key = `${line.p.id}:${line.variantId || 0}`;
  /* `type` is a free-text field: on one product it holds a size, on another a
     material slug. Printing it raw put "{leather-macr}" under a handbag. Name
     the colour properly and only show the second value when it is a size. */
  const variant = line.variant;
  const sizeField = variant ? variantSizeOptions([variant]).field : null;
  const size = variant && sizeField ? variantSizeValue(variant, sizeField) : "";
  const bits = [variant?.color ? swatchLabel(variant.color) : "", size]
    .filter(Boolean).join(" · ");
  return `<div class="coitem">
    <span class="coitem__art"><img src="${esc(line.p.image)}" alt="" width="60" height="60" loading="lazy"></span>
    <div>
      <b>${esc(line.p.name)}</b>
      ${bits ? `<small>${esc(bits)}</small>` : ""}
      <span class="coqty">
        <button type="button" data-step="-1" data-key="${key}" aria-label="Decrease quantity of ${esc(line.p.name)}">&minus;</button>
        <span aria-live="polite">${line.qty}</span>
        <button type="button" data-step="1" data-key="${key}" aria-label="Increase quantity of ${esc(line.p.name)}">+</button>
      </span>
    </div>
    <span class="coitem__money">${money(line.unitPrice * line.qty)}</span>
  </div>`;
}

function totalsHTML(subtotal, delivery) {
  return `
    <div class="corow"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="corow"><span>Delivery</span>${delivery === 0
      ? `<span class="corow__free">Free</span>`
      : `<span>Calculated at payment</span>`}</div>
    <div class="corow"><span>Tax</span><span>Calculated at payment</span></div>
    <div class="cotot"><span>Total so far</span><strong>${money(subtotal)}</strong></div>`;
}

function railHTML(lines, subtotal) {
  const delivery = subtotal >= FREE_DELIVERY_OVER ? 0 : null;
  const away = FREE_DELIVERY_OVER - subtotal;
  return `<div class="cocard">
    <div class="cocard__hd"><h2>Your bag &middot; ${lines.reduce((n, l) => n + l.qty, 0)}</h2>
      <a href="shop.html">Keep shopping</a></div>
    <div class="coitems">${lines.map(lineHTML).join("")}</div>
    ${delivery !== 0 && away > 0
      ? `<p class="conudge">Add ${money(away)} more for free delivery.</p>` : ""}
    <div class="cototals">
      ${totalsHTML(subtotal, delivery)}
      <button class="btn btn--primary btn--full cocta" type="button" id="continueCheckout">Continue to secure checkout</button>
      <p class="cap mb0 center" id="checkoutStatus" role="status" style="margin-top:10px"></p>
      <div class="coassure">
        <div>${svg(ICON.shield)}<span>Card details are entered on the provider's encrypted page.</span></div>
        <div>${svg(ICON.truck)}<span>Free returns within 30 days.</span></div>
        <div>${svg(ICON.clock)}<span>Stock and totals are re-checked before any charge.</span></div>
      </div>
      <div class="cotrust">${marksHTML(MARKS)}</div>
    </div>
  </div>`;
}

const collapsedHTML = (lines, subtotal) => `
  <button class="cosum__row" type="button" aria-expanded="false" aria-controls="corail">
    <span><b>Order summary</b><small>${lines.reduce((n, l) => n + l.qty, 0)} items</small></span>
    <span class="cosum__amt">${money(subtotal)}</span>
    ${svg('<path d="m6 9 6 6 6-6"/>', "cosum__chev")}
  </button>`;

const mobarHTML = (subtotal) => `
  <div><span>Total so far</span><strong>${money(subtotal)}</strong></div>
  <button class="btn btn--primary cocta" type="button" data-mobar-go>Continue</button>`;

/* ---------- page ---------- */

function renderEmpty() {
  $("#coform").innerHTML = `<section class="copanel"><div class="copanel__bd">
    <p class="lede" style="margin:0 0 14px">Your bag is empty.</p>
    <a class="btn btn--primary" href="shop.html">Browse products</a>
  </div></section>`;
  $("#corail").innerHTML = "";
  $("#cosum").hidden = true;
  $("#mobar").hidden = true;
  $("#costeps").innerHTML = "";
}

async function init() {
  const form = $("#coform");
  if (!form) return;

  const catalog = await loadCatalog();

  /* Sign-in needs an OAuth client id. Without one the lookup rejects, and while
     that await sat outside the try below the whole handler threw before it
     could say anything: the button reported nothing and went nowhere, which a
     shopper cannot tell apart from a dead page. Resolve it into a state the
     page can actually render. */
  const sessionPromise = storefrontAuth.session().catch((error) => ({
    authenticated: false,
    unavailable: String(error?.message || error),
  }));

  const draw = () => {
    const lines = bagLines(catalog);
    if (!lines.length) { renderEmpty(); return; }
    const subtotal = bagSubtotal(catalog);

    $("#costeps").innerHTML = stepsHTML(1);
    form.innerHTML = fulfilmentPanel() + addressPanel() + paymentPanel();
    $("#corail").innerHTML = railHTML(lines, subtotal);
    const collapsed = $("#cosum");
    collapsed.hidden = false;
    collapsed.innerHTML = collapsedHTML(lines, subtotal);
    const bar = $("#mobar");
    bar.hidden = false;
    bar.innerHTML = mobarHTML(subtotal);

    wire();
  };

  const wire = () => {
    /* Radio groups paint their own selected state; the input stays the source
       of truth so keyboard and screen-reader behaviour are the native ones. */
    $$('.copick input, .copay input').forEach((input) => {
      input.addEventListener("change", () => {
        $$(`input[name="${input.name}"]`).forEach((sibling) =>
          sibling.closest("label").classList.toggle("is-on", sibling.checked));
      });
    });

    $$("[data-step]").forEach((button) => {
      button.addEventListener("click", () => {
        const [id, variantId] = button.dataset.key.split(":").map(Number);
        const line = bagLines(catalog).find((l) =>
          l.p.id === id && (l.variantId || 0) === variantId);
        if (!line) return;
        setBagQty(id, variantId || null, line.qty + Number(button.dataset.step));
        draw();
      });
    });

    const collapsed = $(".cosum__row");
    collapsed?.addEventListener("click", () => {
      const open = document.body.classList.toggle("co-summary-open");
      collapsed.setAttribute("aria-expanded", String(open));
    });

    $("[data-mobar-go]")?.addEventListener("click", () => $("#continueCheckout")?.click());

    const button = $("#continueCheckout");
    const status = $("#checkoutStatus");
    if (!button) return;

    sessionPromise.then((session) => {
      if (session.unavailable) {
        button.textContent = "Checkout unavailable";
        button.disabled = true;
        status.textContent = "Sign-in is not configured for this shop yet, so checkout cannot continue.";
        const mobar = $("[data-mobar-go]");
        if (mobar) { mobar.textContent = "Unavailable"; mobar.disabled = true; }
      } else {
        button.textContent = session.authenticated
          ? "Continue to secure checkout" : "Sign in to continue";
      }
    });

    button.addEventListener("click", async () => {
      button.disabled = true;
      status.textContent = "Checking your session…";
      try {
        const session = await sessionPromise;
        if (session.unavailable) {
          throw new Error("Sign-in is not configured for this shop yet, so checkout cannot continue.");
        }
        if (!session.authenticated) {
          await storefrontAuth.startLogin("/checkout.html");
          return;
        }
        status.textContent = "Updating your secure basket…";
        await syncBagToSelldone(session.accessToken, catalog);
        const domain = getPublicConfig().shop.domain;
        if (!domain) throw new Error("This shop has no checkout domain configured.");
        const base = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
        location.assign(`${base.replace(/\/$/, "")}/basket`);
      } catch (error) {
        status.textContent = error?.message || "Checkout is temporarily unavailable.";
        button.disabled = false;
      }
    });
  };

  draw();
  document.addEventListener("bag:changed", () => {
    /* Another tab or the cart drawer can change the bag under this page. */
    if (!document.hidden) return;
    draw();
  });
}

document.addEventListener("DOMContentLoaded", init);
