/* Marko checkout hand-off.
   The local bag is synchronised to the authenticated Selldone physical basket;
   delivery, tax, gateway choice, payment, and order creation stay in Selldone's
   secure checkout so this storefront never invents commercial terms. */

import { loadCatalog, money, bagLines, bagSubtotal, syncBagToSelldone } from "./shop-data.js";
import { storefrontAuth } from "../shared/auth-client.js";
import { getPublicConfig } from "../shared/runtime-config.js";
import { esc } from "./app.js";

const $ = (selector, root = document) => root.querySelector(selector);

function renderSummary(catalog) {
  const lines = bagLines(catalog);
  const rows = $("#sumrows");
  if (!lines.length) {
    rows.innerHTML = `<p class="cap">Your bag is empty. <a href="shop.html">Browse products</a>.</p>`;
    $("#continueCheckout").disabled = true;
    return;
  }
  rows.innerHTML = lines.map((line) => `<div class="sum__row">
    <img src="${line.p.image}" alt="${esc(line.p.name)}" width="64" height="64">
    <div><b>${esc(line.p.name)}</b><p class="ref mb0">${line.variant ? `Variant ${line.variant.id} · ` : ""}Qty ${line.qty}</p></div>
    <span class="price">${money(line.unitPrice * line.qty)}</span>
  </div>`).join("");
  $("#subtotal").textContent = money(bagSubtotal(catalog));
}

async function init() {
  const form = $("#coform");
  if (!form) return;
  $("#steps")?.remove();
  $("#done")?.remove();
  $("#sumtotals")?.querySelectorAll(".sum__line, .sum__tot").forEach((el) => el.remove());
  $(".promo")?.remove();
  $("#promofield")?.remove();
  form.innerHTML = `<section class="fset">
    <p class="eyebrow eyebrow--blued">Secure hand-off</p>
    <h1 class="h2">Review your Marko bag</h1>
    <p class="lede">We will copy these exact products, quantities, colors, and sizes to your Selldone basket.</p>
    <p class="cap">The next screen confirms live stock, delivery options, taxes, final total, and enabled payment methods. No payment is taken on this page.</p>
    <p class="cap" id="checkoutStatus" role="status"></p>
    <button class="btn btn--full" type="button" id="continueCheckout">Continue to Selldone checkout</button>
  </section>`;

  const button = $("#continueCheckout");
  const status = $("#checkoutStatus");
  const catalogPromise = loadCatalog();
  const sessionPromise = storefrontAuth.session();

  button.addEventListener("click", async () => {
    const session = await sessionPromise;
    if (!session.authenticated) {
      await storefrontAuth.startLogin("/checkout.html");
      return;
    }
    button.disabled = true;
    status.textContent = "Updating your secure Selldone basket…";
    try {
      const catalog = await catalogPromise;
      await syncBagToSelldone(session.accessToken, catalog);
      const domain = getPublicConfig().shop.domain || "fashioni.myselldone.com";
      const base = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
      location.assign(`${base.replace(/\/$/, "")}/basket`);
    } catch (error) {
      status.textContent = error?.message || "Checkout is temporarily unavailable.";
      button.disabled = false;
    }
  });
  const catalog = await catalogPromise;
  renderSummary(catalog);
  const session = await sessionPromise;
  button.textContent = session.authenticated ? "Continue to secure checkout" : "Sign in to continue";
}

document.addEventListener("DOMContentLoaded", init);
