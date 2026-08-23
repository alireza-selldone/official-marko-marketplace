/* Storefront data layer.
   Live Selldone data only. No hardcoded catalog, no hardcoded image URLs.

   Rules this file exists to enforce:
   - Storefront reads go browser-direct to XAPI. api.selldone.com is never called.
   - Endpoints come from the storefront-sdk ai-guideline builders, never invented.
   - Images resolve through the central Selldone helper, never string-concatenated.
   - A discount is only real if its date window is currently open.
*/

import { getPublicConfig } from "../shared/runtime-config.js";
import { shopConfig, slugify } from "./shop-config.js";
import { selldoneImagePathToUrl } from "../dashboard/features/selldone-images.js";
import { variantSizeOptions } from "./variant-options.js";
import { AUDIENCE_PRODUCT_IDS, vendorForCategory } from "./marketplace-config.js";

const cfg = getPublicConfig();

/* No fallback shop. There used to be a hardcoded handle and shop id here as
   defaults, which meant deleting the meta tags did not unset anything — it
   quietly served the template's shop. An unset shop must fail visibly, not resolve to someone
   else's catalogue. `isUnconfigured()` turns that into the amber banner. */
export const SHOP = {
  handle: cfg.STOREFRONT_SHOP_HANDLE || "",
  id: cfg.shopId || 0,
  xapi: (cfg.STOREFRONT_XAPI_BASE || "https://xapi.selldone.com").replace(/\/+$/, ""),
};

/* Endpoint builders — both are in _generated/api-url-builders.md.
   products/list is used because it is the only one carrying brand and spec. */
const URL_PRODUCTS_LIST = (limit = 250) =>
  `${SHOP.xapi}/shops/@${SHOP.handle}/products/list?limit=${limit}`;
const URL_PRODUCTS_ALL = (limit = 250) =>
  `${SHOP.xapi}/shops/@${SHOP.handle}/products/all?dir=*&limit=${limit}` +
  `&products_only=true&with_category=true&with_total=true`;

const taggedProductIdsCache = new Map();

/* Tags live in Selldone's product Survey data, but products/list intentionally
   omits them. Query products/all with tags[] so homepage merchandising remains
   driven by the merchant's live tags instead of a duplicated local id list. */
export async function loadTaggedProductIds(tag, { limit = 250 } = {}) {
  const normalized = String(tag || "").trim().toLowerCase();
  if (!normalized) return [];
  if (taggedProductIdsCache.has(normalized)) return taggedProductIdsCache.get(normalized);

  const request = fetch(
    `${SHOP.xapi}/shops/@${SHOP.handle}/products/all?dir=*&limit=${limit}` +
      `&products_only=true&tags[]=${encodeURIComponent(normalized)}`,
    { mode: "cors", headers: { Accept: "application/json" } },
  ).then(async (response) => {
    if (!response.ok) throw new Error(`tagged products ${normalized} ${response.status}`);
    const payload = await response.json();
    return [...new Set((payload.products || []).map((product) => Number(product.id)).filter(Number.isFinite))];
  }).catch((error) => {
    taggedProductIdsCache.delete(normalized);
    throw error;
  });

  taggedProductIdsCache.set(normalized, request);
  return request;
}

/* Audience capture — xapi.stream.audience.submit in the endpoint registry.
   POST /shops/{shop_id}/audience/{access_key}. Takes the numeric shop id, not
   the @handle the catalog builders use. The `newsletter` key is the default web
   audience stream and tags the record automatically. Public: no Authorization
   header, no S-Guest — this is a form a visitor submits before signing in. */
const URL_AUDIENCE = (accessKey = "newsletter") =>
  `${SHOP.xapi}/shops/${SHOP.id}/audience/${encodeURIComponent(accessKey)}`;

export async function subscribe(email, { accessKey = "newsletter", tags } = {}) {
  const res = await fetch(URL_AUDIENCE(accessKey), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(tags ? { email, tags } : { email }),
  });
  // Selldone returns business errors inside a 200 as {error:true,error_msg},
  // so an ok status alone does not mean the address was accepted.
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Subscribe failed (${res.status})`);
  if (body?.error) {
    const msg = body.error_msg;
    throw new Error(typeof msg === "string" ? msg : "That address was not accepted.");
  }
  return body;
}

/* ---------- Reviews ----------
   Sample content, labelled as such wherever it renders. This site removed
   invented reviews once already because they were presented as real; the label
   is what makes the difference, exactly as the banner does on the policy pages.

   Deliberately generic rather than watch-specific, so the block survives when
   this repo is imported into a shop selling something else.

   The average and the distribution are DERIVED below, never typed. When
   rate_count stops being zero across the catalogue, replace the sample array in
   loadReviews() with the real source and `sample` becomes false — the label and
   every figure follow automatically. */
const SAMPLE_REVIEWS = [
  { name: "Marta K.",   city: "Rotterdam", rating: 5,
    body: "Ordered on the Thursday, arrived Monday morning. Packaging was sensible rather than excessive, and the item matched the listing photographs closely." },
  { name: "Daniel R.",  city: "Bristol",   rating: 5,
    body: "I asked two questions before ordering and got a straight answer to both, including one that talked me out of the more expensive option." },
  { name: "Priya S.",   city: "Toronto",   rating: 4,
    body: "No complaints about the item itself. Delivery took a day longer than the estimate, though the tracking was accurate the whole way." },
  { name: "Tomás L.",   city: "Lisbon",    rating: 5,
    body: "Second order from here. The first one settled it — returns were handled without an argument when I picked the wrong size." },
  { name: "Anne-Sofie H.", city: "Aarhus", rating: 3,
    body: "The product is good and I would buy it again. The checkout asked me to re-enter my address twice, which was more friction than it needed to be." },
  { name: "Ibrahim O.", city: "Manchester", rating: 4,
    body: "Fair price for the quality. It is not the cheapest available, but nothing about it feels like a compromise after a few months of use." },
];

/* Average and star distribution computed from whatever list is passed in. */
export function summariseReviews(list) {
  const total = list.length;
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: list.filter((r) => r.rating === star).length,
  }));
  const sum = list.reduce((n, r) => n + r.rating, 0);
  return {
    total,
    average: total ? sum / total : 0,
    counts: counts.map((c) => ({ ...c, pct: total ? (c.count / total) * 100 : 0 })),
  };
}

/* One place to switch data sources. Real ratings win the moment any exist. */
export function loadReviews(products = []) {
  const rated = products.filter((p) => p.rateCount > 0);
  if (rated.length) {
    const list = rated.map((p) => ({
      name: p.name, city: "", rating: Math.round(p.rate), body: "", productId: p.id,
    }));
    return { ...summariseReviews(list), reviews: list, sample: false };
  }
  return { ...summariseReviews(SAMPLE_REVIEWS), reviews: SAMPLE_REVIEWS, sample: true };
}

/* ---------- Blog ----------
   Registry endpoints, not invented:
     xapi.blogs.list  GET /shops/@{shop}/blogs        (?category, ?limit, ?extra)
     xapi.blogs.get   GET /shops/@{shop}/blogs/{blog_id}

   Two quirks worth knowing, both found by testing rather than reading:

   1. `blog_id` on the detail route is the article's `parent_id` (the shop-blog
      record), NOT the article id. Passing the article id returns "Blog not
      found", which reads like the endpoint is missing.
   2. `?extra=true` returns the category list but an EMPTY `articles` array,
      filling `last_articles` instead. So categories and articles need separate
      calls rather than one combined one.

   The public list carries no category on each article. Rather than fetch the
   detail of every post to find out (an N+1 that grows with the blog), the
   category map is built with one filtered list call per category — bounded by
   the number of categories, which stays small. */
const URL_BLOGS = (q = "") => `${SHOP.xapi}/shops/@${SHOP.handle}/blogs${q}`;
const URL_BLOG = (blogId) => `${SHOP.xapi}/shops/@${SHOP.handle}/blogs/${encodeURIComponent(blogId)}`;

function blogImage(value) {
  try {
    const url = new URL(value, document.baseURI);
    if (url.hostname === `${SHOP.handle}.selldone.shop` && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      return `${url.pathname}${url.search}`;
    }
  } catch { /* preserve the API value below */ }
  return value;
}

const asJson = async (url) => {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const j = await r.json();
  if (j?.error) throw new Error(j.error_msg || "Blog request failed");
  return j;
};

/* Selldone truncates `description` to 256 characters, which lands mid-word.
   Trim back to the last sentence or word so the card does not end in "Start by co". */
export function excerpt(text, max = 190) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (stop > max * 0.5) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

export const articleDate = (a) =>
  a.schedule_at || a.created_at || null;   // schedule_at is cleared once it fires

/* Categories alone — one request. The article page needs a name for one id and
   should not pull the whole listing to get it. */
export async function loadBlogCategories() {
  const extra = await asJson(URL_BLOGS("?extra=true")).catch(() => ({ categories: [] }));
  return (extra.categories || []).map((c) => ({
    id: c.id, name: c.category, count: Number(c.articles) || 0,
  }));
}

export async function loadBlog() {
  const [listing, extra] = await Promise.all([
    asJson(URL_BLOGS("?limit=100")),
    asJson(URL_BLOGS("?extra=true")).catch(() => ({ categories: [] })),
  ]);

  const cats = (extra.categories || []).map((c) => ({
    id: c.id, name: c.category, count: Number(c.articles) || 0,
  }));

  // One filtered call per category gives every post its category without an
  // N+1 over articles. Posts in no category simply never appear in a map entry.
  const owners = new Map();
  await Promise.all(cats.map(async (c) => {
    try {
      const r = await asJson(URL_BLOGS(`?category=${c.id}&limit=100`));
      (r.articles || []).forEach((a) => owners.set(a.id, c));
    } catch { /* a failing filter must not blank the whole listing */ }
  }));

  const posts = (listing.articles || []).map((a) => ({
    id: a.id,
    blogId: a.parent_id,          // the detail route wants this, not a.id
    slug: a.slug,
    title: a.title,
    image: blogImage(a.image),
    excerpt: excerpt(a.description),
    date: articleDate(a),
    category: owners.get(a.id) || null,
  }));

  posts.sort((x, y) => Date.parse(y.date || 0) - Date.parse(x.date || 0));
  return { posts, cats, total: Number(listing.total) || posts.length };
}

export async function loadArticle({ blogId, slug }) {
  let id = blogId;
  if (!id && slug) {
    const listing = await asJson(URL_BLOGS("?limit=100"));
    id = (listing.articles || []).find((a) => a.slug === slug)?.parent_id;
    if (!id) return null;
  }
  if (!id) return null;
  const r = await asJson(URL_BLOG(id)).catch(() => null);
  if (!r?.article) return null;
  const a = r.article;
  return {
    id: a.id, blogId: id, slug: a.slug, title: a.title, body: a.body,
    image: blogImage(a.image), excerpt: excerpt(a.description, 240),
    date: articleDate(a), categoryId: r.category ?? null,
    author: a.user?.name || "",
  };
}

/* ---------- Order history ----------
   xapi.checkout.order_history.list — GET /shops/@{shop}/basket/orders-{type}
   with the order-history scope, which the storefront client already holds.
   This shop is physical-only, so the type is PHYSICAL. */
export async function loadOrders(accessToken, { type = "PHYSICAL", limit = 10 } = {}) {
  if (!accessToken) return null;
  const url = `${SHOP.xapi}/shops/@${SHOP.handle}/basket/orders-${type}?offset=0&limit=${limit}`;
  const r = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`orders ${r.status}`);
  const j = await r.json();
  if (j?.error) throw new Error(j.error_msg || "Order history unavailable");
  const rows = j.baskets || j.orders || j.data || [];
  return rows.map((o) => ({
    id: o.id,
    date: o.created_at || o.reserved_at || null,
    status: o.status || o.delivery_state || "",
    total: Number(o.price ?? o.total ?? 0),
    currency: o.currency || "USD",
    items: Number(o.items_count ?? (o.items || []).length ?? 0),
  }));
}

/* ---------- Hero ----------
   Everything shop-specific lives in shop.config.json under `hero`, including
   the photograph and the hotspot coordinates.

   Those coordinates are percentages of a SPECIFIC file and were measured
   against it, not eyeballed — which is exactly why they cannot be generated
   for another shop. Three modes:

     photo   a lifestyle photograph with measured hotspots
     slides  product plates, portable, what `npm run setup` writes
     plate   a single product plate, no slider — the honest fallback when no
             product has an image that reads at hero size

   A missing image with markers floating over nothing is worse than no
   markers, so hotspots are returned only in photo mode with an image set. */
export const heroOf = (cfg) => {
  const h = cfg?.hero || {};
  const mode = h.mode || "plate";
  return {
    mode,
    image: h.image || "",
    natural: h.natural || { w: 1, h: 1 },
    linkProductId: h.linkProductId || null,
    // Hotspots only mean anything over a photograph that was measured.
    hotspots: mode === "photo" && h.image ? h.hotspots || [] : [],
    slides: mode === "slides" ? h.slides || [] : [],
  };
};

/* ---------- Images ---------- */
export function img(path, size) {
  return selldoneImagePathToUrl(path, { shopId: SHOP.id, scope: "products", size });
}

/* ---------- Money ---------- */
export const money = (n) =>
  "$" + Number(n).toLocaleString("en-US", {
    minimumFractionDigits: Number(n) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

/* ---------- Discounts ----------
   `discount` on its own is not enough: four Haute Horlogerie references carry a
   dis_start/dis_end window that closed on 2024-11-27. Reading the raw field
   would advertise a reduction that no longer exists and would put nearly the
   whole catalogue on sale. Validated against the server's own final_price:
   agrees on every reference. */
export function activeDiscount(p, now = Date.now()) {
  if (!(Number(p.discount) > 0)) return 0;
  if (p.dis_start && now < Date.parse(p.dis_start)) return 0;
  if (p.dis_end && now > Date.parse(p.dis_end)) return 0;
  return Number(p.discount);
}
export const finalPrice = (p) => Number(p.price) - activeDiscount(p);
export const wasPrice = (p) => (activeDiscount(p) > 0 ? Number(p.price) : null);

/* ---------- Variants ----------
   Selldone returns a colour hex and nothing else: no variant name. Rather than
   invent finish names, a swatch is labelled with its literal hex plus a visible
   ordinal, so colour is never the only indicator.

   Composite colours such as "#7B1FA2/#D32F2F" are not valid CSS colours and are
   rendered as a hard 135deg split; a large minority of references carry one. */
const COLOR_NAMES = {
  "#000000": "Black", "#FFFFFF": "White", "#383838": "Charcoal", "#616161": "Gray",
  "#455A64": "Slate", "#C0C0C0": "Silver", "#D32F2F": "Red", "#C2185B": "Magenta",
  "#BE123C": "Rose", "#FFC0CB": "Pink", "#DCAFCE": "Dusty Pink", "#B76E79": "Rose Gold",
  "#F57C00": "Orange", "#F06336": "Coral", "#FC7F5F": "Salmon", "#FFD700": "Gold",
  "#FBC02D": "Sunflower", "#FFA000": "Amber", "#D2691E": "Copper", "#5D4037": "Brown",
  "#8B4513": "Saddle Brown", "#BEA994": "Taupe", "#D6BEA6": "Sand", "#FAE7C9": "Cream",
  "#F6EAD2": "Ivory", "#00796B": "Teal", "#0097A7": "Aqua", "#0DB2AE": "Turquoise",
  "#00582F": "Forest Green", "#689F38": "Green", "#008000": "Green", "#ADFF2F": "Lime",
  "#1976D2": "Blue", "#303F9F": "Indigo", "#000080": "Navy", "#00FFFF": "Cyan",
  "#243B64": "Midnight Blue", "#1B2A4A": "Midnight Blue", "#2C3E50": "Steel Blue",
  "#4A5568": "Graphite", "#7F8C8D": "Stone", "#2B7A78": "Pine", "#795B99": "Wisteria",
  "#D77838": "Burnt Orange",
  "#229DBF": "Sky Blue", "#0D5A74": "Deep Teal", "#96B5C9": "Powder Blue",
  "#512DA8": "Violet", "#7B1FA2": "Purple", "#800080": "Purple", "#E6E6FA": "Lavender",
  "#6A5ACD": "Slate Blue", "#A86EA9": "Mauve", "#6B2257": "Plum", "#271020": "Aubergine",
  "#222127": "Ink", "#1A1F35": "Midnight", "#404624": "Olive", "#D3E1A4": "Sage",
};
const colorCodes = (value) => String(value || "").match(/#[0-9a-fA-F]{6}/g) || [];
export const isComposite = (c) => colorCodes(c).length > 1;

export function swatchStyle(color) {
  const codes = colorCodes(color);
  if (!codes.length) return "background-color:#E5E7EB";
  if (codes.length === 1) return `background-color:${codes[0]}`;
  const stop = 100 / codes.length;
  const parts = codes.flatMap((code, index) => [`${code} ${index * stop}%`, `${code} ${(index + 1) * stop}%`]);
  return `background-image:linear-gradient(135deg,${parts.join(",")})`;
}

/* MK-019 — every swatch gets a name a person can act on.
   `swatchLabel` used to fall through to the raw uppercase hex whenever a
   colour was not an exact key in COLOR_NAMES, so a shopper heard "#243B64".
   Nearest-neighbour in RGB against the same table gives a real name for any
   colour without inventing a vocabulary: the table is the vocabulary. */
const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const NAMED_RGB = Object.entries(COLOR_NAMES).map(([hex, name]) => ({ name, rgb: hexToRgb(hex) }));

function nearestColorName(code) {
  const exact = COLOR_NAMES[code.toUpperCase()];
  if (exact) return exact;
  const [r, g, b] = hexToRgb(code);
  let best = null;
  let bestDistance = Infinity;
  for (const entry of NAMED_RGB) {
    /* Weighted so the name tracks perceived hue rather than raw channel
       distance; green carries most of the luminance a person judges by. */
    const distance = 2 * (r - entry.rgb[0]) ** 2 + 4 * (g - entry.rgb[1]) ** 2 + 3 * (b - entry.rgb[2]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = entry.name; }
  }
  return best || "Colour";
}

/* One canonical key per colour. Selldone records the same colour as both
   `#243B64` and `#243B64ff`, and grouping on the raw string made those two
   different swatches — the duplicate pairs the vendor audit found. */
export const colorKey = (value) => colorCodes(value).map((code) => code.toUpperCase()).join("/");

export function swatchLabel(color) {
  const codes = colorCodes(color);
  if (!codes.length) return "Option";
  return codes.map(nearestColorName).join(" and ");
}


export const variantColors = (p) => variantsOf(p).map((v) => v.color).filter(Boolean);

/* ---------- Variants ----------
   `products/list` carries TWO arrays. `variants` is a distinct-values summary —
   colour, image and nothing else. `product_variants` is the real thing: id, sku,
   colour, image, and its own price, discount and stock. Read the second.

   There used to be a FINISH allowlist here that only rendered colours it
   recognised. It was written for an earlier catalogue and quietly ate the
   current one: on one reference it kept 1 of 5 real variants — one loss purely to
   case, "#b76e79" against "#B76E79" — so the page claimed a single finish for a
   reference sold in five. It is gone. Every variant the shop defines renders.
   A colour that looks wrong is shop data to fix in Selldone, not something the
   storefront should hide. */
export function variantsOf(p) {
  const rows = p?.product_variants || p?.raw?.product_variants || [];
  return rows
    .filter((v) => v && v.enable !== false && !v.deleted_at)
    .map((v) => ({
      id: v.id,
      sku: v.sku || "",
      color: v.color || "",
      style: v.style || "",
      volume: v.volume || "",
      weight: v.weight || "",
      pack: v.pack || "",
      type: v.type || "",
      image: v.image || null,
      /* `pricing:false` means the variant does not override the product price —
         reading v.price regardless would invent per-variant prices that the
         shop never set. */
      price: v.pricing ? Number(v.price) : null,
      discount: v.pricing ? Number(v.discount) || 0 : 0,
      qty: Number(v.quantity) || 0,
    }));
}

/* What a card should print. Two references range to $16,400 above their base
   price, so a flat figure there is a price the customer will not be charged. */
export function priceRange(p) {
  const prices = variantsOf(p).map((v) => v.price).filter((n) => n > 0);
  const base = Number(p.price) || 0;
  if (prices.length < 2) return { from: base, to: base, varies: false };
  const lo = Math.min(base, ...prices), hi = Math.max(base, ...prices);
  return { from: lo, to: hi, varies: hi > lo };
}

/* ---------- Categories ----------
   Titles, icons and membership are all live. Slugs are DERIVED from the live
   titles, never stored as a map of one shop's integers.

   There used to be a `CAT_SLUG` here mapping this shop's category ids to
   slugs. It was the single biggest obstacle to reusing this repo: pointed at
   any other shop, every product resolved to an empty slug, no collection had
   members, and the grid rendered empty — so doing the right thing produced
   something that read as a broken build. It is gone. Nothing in this file
   knows a category id.

   The config may carry a slug and a blurb per category id, which is how a
   human-written blurb survives; anything it does not carry is derived. */
function categoryIndex(cfg, catMeta) {
  const byId = new Map((cfg.categories || []).map((c) => [Number(c.id), c]));
  const used = new Set();
  const out = new Map();
  for (const [id, meta] of catMeta) {
    const stored = byId.get(Number(id));
    let slug = stored?.slug || slugify(meta.title, `category-${id}`);
    // Two categories that slugify the same stay addressable rather than
    // collapsing into one another.
    if (used.has(slug)) slug = `${slug}-${id}`;
    used.add(slug);
    out.set(Number(id), { slug, blurb: stored?.blurb || "", title: meta.title, icon: meta.icon });
  }
  return out;
}

/* Ordering follows the config where it names a category, so a deliberate
   running order survives; anything the config does not name falls in behind,
   largest collection first. */
function orderCategories(cfg, index) {
  const wanted = (cfg.categories || []).map((c) => Number(c.id)).filter((id) => index.has(id));
  const rest = [...index.keys()].filter((id) => !wanted.includes(id));
  return [...wanted, ...rest];
}

/* ---------- Shop context ----------
   Loaded before checkout renders. The Stripe publishable key lives at
   shop.gateways[].public.key and is read at runtime — never written into a
   file, never committed. Publishable keys are client-side by design; the
   secret key is not exposed by this endpoint and is never handled here. */
const URL_SHOP_INFO = () => `${SHOP.xapi}/shops/@${SHOP.handle}/info`;
const URL_MARKETPLACE_VENDORS = () => `${SHOP.xapi}/shops/@${SHOP.handle}/vendors?limit=50`;
let _shop = null;
let _vendors = null;

export async function loadShop() {
  if (_shop) return _shop;
  const r = await fetch(URL_SHOP_INFO(), { mode: "cors", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`shop info ${r.status}`);
  const j = await r.json();
  const gateways = (j.shop && j.shop.gateways ? j.shop.gateways : []).filter((g) => g.enable);
  const stripe = gateways.find((g) => /stripe/i.test(g.code));
  _shop = {
    raw: j.shop,
    title: j.shop?.title || "",
    currency: j.shop?.currency || "USD",
    currencies: j.shop?.currencies || ["USD"],
    gateways,
    stripeKey: stripe?.public?.key || "",
    stripeKeyResolved: Boolean(stripe?.public?.key),
  };
  return _shop;
}

/* ---------- Catalog ---------- */
let _cache = null;
const CATALOG_CACHE_KEY = `storefront_catalog_v2_${SHOP.id || "unset"}`;

function readCatalogSnapshot() {
  try {
    const snapshot = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null");
    if (!snapshot?.catalog?.products?.length || !snapshot?.catalog?.cats?.length) return null;
    return snapshot.catalog;
  } catch { return null; }
}

/* Standing promotional-image eligibility rule.
   ------------------------------------------------------------------------
   A product is eligible for a PROMOTIONAL placement — homepage, brand rail,
   seller hero, navigation art, any editorial tile — only if it passes this
   guard. Ordinary listings and the product's own page are unaffected: this
   governs what the shop puts forward, not what it sells.

   The guard is deliberately written as garment VOCABULARY rather than as a
   list of offending product ids or filenames, so it keeps working when the
   catalog changes and when this repo is cloned onto a different one. It reads
   the product name, its category and its tags, because a name alone misses a
   product whose category already says what it is.

   Three families are excluded:
     rear      lower-body/rear-emphasis apparel photography
     intimates lingerie and underwear
     swim      swimwear and beachwear, where the photograph is of a body
               rather than of a garment

   `beach` is inside the swim family on purpose. A beach cover-up is not itself
   objectionable, but its catalog photography is swimwear photography. The rule
   has always preferred a false negative — one fewer promotional candidate —
   over resurfacing an image it should not have.

   A merchant can also opt a product out without touching code by tagging it
   `promo-ban`, `rear-angle`, `rear-view` or `back-view`. */
const PROMO_BAN_TAGS = /^(?:promo-ban|rear-angle|rear-view|back-view)$/;

/* Written as one literal rather than assembled from strings. The first attempt
   built it with `new RegExp` out of an array of terms, and the escapes did not
   survive: `\b` inside a template literal is a backspace character, not a word
   boundary, so the guard matched nothing at all and every swimwear product
   walked straight into the promotional rails. A literal cannot lose an escape. */
const PROMO_INELIGIBLE =
  /\b(?:butt|booty|bum|scrunch|twerk|cheeky|rear|backside|leggings?|jeggings?|bike(?:r)?\s+shorts?|yoga\s+shorts?|workout\s+shorts?|compression\s+shorts?|hot\s+pants?|shorts|thong|lingerie|bras?|bralette|briefs?|pant(?:y|ies)|knickers|underwear|boxers?|corset|garter|negligee|babydoll|bikini|tankini|monokini|swim|swimsuits?|swimwear|bathing\s+suits?|beachwear|beach|cover[-\s]?ups?)\b/i;

/* A product name does not always say what its photograph shows. "Ofay
   Reflecting Rebel Shirred" is a swimsuit; "Ofay Piece Textured Chain" is a
   bikini. Neither name trips the vocabulary above, and both reached the seller
   hero — a DOM scan of product names reported the page clean while the page
   plainly was not.

   Selldone image paths are the original filenames concatenated, so they carry
   the description the name lost: `beautifulwomenwithswimmingsuit…`,
   `…womannavywhitestripedswimsuitpoolside…`. Filenames have no word
   separators, so this list matches as substrings and is kept deliberately
   narrow: every term here is unambiguous inside a run-together filename.
   `bra` is excluded on purpose — it would match "brand" and "brown". */
const PROMO_INELIGIBLE_MEDIA =
  /(?:bikini|tankini|monokini|swimsuit|swimmingsuit|swimwear|bathingsuit|beachwear|lingerie|underwear|thong|buttscrunch|booty|sexy|summerbody|topless|nude|cleavage)/i;

export function isPromotionSafeProduct(product) {
  if (!product) return false;
  const tagRows = product.raw?.tags ?? product.raw?.product_tags ?? product.tags ?? [];
  const tags = (Array.isArray(tagRows) ? tagRows : [tagRows])
    .map((tag) => String(tag?.name ?? tag?.title ?? tag ?? "").toLowerCase());
  if (tags.some((tag) => PROMO_BAN_TAGS.test(tag))) return false;

  /* Category and tags are read alongside the name, because a name alone misses
     a product whose department already says what the photograph shows. */
  const searchable = [
    product.name, product.catName, product.cat,
    product.raw?.title, product.raw?.subtitle, product.raw?.category?.title,
    ...tags,
  ].filter(Boolean).join(" ");
  if (PROMO_INELIGIBLE.test(searchable)) return false;

  const media = [product.icon, product.image, product.raw?.icon, product.raw?.cover]
    .filter(Boolean).join(" ");
  return !PROMO_INELIGIBLE_MEDIA.test(media);
}

export const promotionSafeProducts = (products = []) => products.filter(isPromotionSafeProduct);

function writeCatalogSnapshot(catalog) {
  if (!catalog?.products?.length || !catalog?.cats?.length) return;
  try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), catalog })); }
  catch (error) { console.warn("[storefront] live catalog snapshot could not be saved", error); }
}

export async function loadVendors() {
  if (_vendors) return _vendors;
  const response = await fetch(URL_MARKETPLACE_VENDORS(), { mode: "cors", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`vendors ${response.status}`);
  const json = await response.json();
  _vendors = Array.isArray(json.vendors) ? json.vendors : [];
  return _vendors;
}

function mirroredAudienceIds(id) {
  const productId = Number(id);
  return Object.entries(AUDIENCE_PRODUCT_IDS)
    .filter(([, productIds]) => productIds.includes(productId))
    .map(([categoryId]) => Number(categoryId));
}

/* A catalog request that never settles is worse than one that fails: the page
   sits on skeletons with nothing to act on. Every catalog read is bounded, and
   the failure path already has somewhere to go — the browser snapshot first,
   then the visible error with a retry. */
export const CATALOG_TIMEOUT_MS = 12000;

export async function fetchJson(url, { timeout = CATALOG_TIMEOUT_MS, label = url } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      mode: "cors",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${label} ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${label} timed out after ${timeout}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCatalog() {
  if (_cache) return _cache;

  let listJson;
  let allJson;
  try {
    [listJson, allJson] = await Promise.all([
      fetchJson(URL_PRODUCTS_LIST(), { label: "products/list" }),
      fetchJson(URL_PRODUCTS_ALL(), { label: "products/all" }),
    ]);
    if (listJson?.error || allJson?.error || !listJson?.products?.length || !allJson?.products?.length) {
      throw new Error(listJson?.error_msg || allJson?.error_msg || "live catalog response is empty");
    }
  } catch (error) {
    const snapshot = readCatalogSnapshot();
    if (snapshot) {
      console.warn("[storefront] live catalog unavailable; using the most recent browser snapshot", error);
      _cache = snapshot;
      return _cache;
    }
    throw error;
  }

  /* Category title AND icon both arrive live on products/all. The storefront
     already read the title; reading the icon too is what lets a shop with no
     configured hero product still show a collection tile. */
  const catMeta = new Map();
  (allJson.products || []).forEach((p) => {
    const c = p.category;
    if (c && c.id && !catMeta.has(c.id)) catMeta.set(c.id, { title: c.title, icon: c.icon });
  });

  const cfg = await shopConfig();
  const index = categoryIndex(cfg, catMeta);
  const audienceConfig = Array.isArray(cfg.audiences) ? cfg.audiences : [];
  const audienceById = new Map(audienceConfig.map((audience) => [Number(audience.id), audience]));

  const products = (listJson.products || []).map((p) => {
    const slug = index.get(Number(p.category_id))?.slug || "";
    const shortcutRows = Array.isArray(p.shortcuts) ? p.shortcuts : [];
    const shortcutIdsFromApi = shortcutRows
      .map((shortcut) => Number(shortcut?.id ?? shortcut?.category_id ?? shortcut))
      .filter(Number.isFinite);
    const shortcutIds = shortcutIdsFromApi.length ? shortcutIdsFromApi : mirroredAudienceIds(p.id);
    const variants = variantsOf(p);
    const marketplaceVendor = vendorForCategory(p.category_id);
    /* A storage field can contain a size, material slug, or legacy token. Only
       the consistently size-shaped dimension is exposed to listing filters. */
    const stockedVariants = variants.filter((variant) => variant.qty > 0);
    const { values: sizes } = variantSizeOptions(stockedVariants.length ? stockedVariants : variants);
    return {
      id: p.id,
      name: p.title,
      slug: p.slug || String(p.id),
      brand: p.brand || "",
      cat: slug,
      catName: index.get(Number(p.category_id))?.title || "",
      categoryId: Number(p.category_id),
      vendorId: marketplaceVendor?.id || null,
      vendorSlug: marketplaceVendor?.slug || "",
      vendorName: marketplaceVendor?.name || "",
      price: finalPrice(p),
      was: wasPrice(p),
      saleStartsAt: p.dis_start || "",
      saleEndsAt: p.dis_end || "",
      qty: Number(p.quantity) || 0,
      rate: Number(p.rate) || 0,
      rateCount: Number(p.rate_count) || 0,
      spec: p.spec && typeof p.spec === "object" ? p.spec : null,
      colors: variantColors(p),
      variants,
      sizes,
      shortcutIds,
      audiences: shortcutIds.map((id) => audienceById.get(id)?.slug).filter(Boolean),
      range: priceRange(p),
      icon: p.icon || "",
      image: img(p.icon),
      raw: p,
    };
  });

  /* Below three categories the grid reads as a lonely tile rather than a
     collection, so the section is dropped entirely. Marko is a mixed
     marketplace, so all current fashion and technology departments remain
     available to filters and seller pages; `catsDropped` is still retained as
     a guard if a future import grows beyond the storefront's practical cap. */
  const MIN_CATS = 3, MAX_CATS = 24;
  const heroes = cfg.categoryHeroes || {};
  let cats = orderCategories(cfg, index).map((id) => {
    const meta = index.get(id);
    const inCat = products.filter((p) => p.cat === meta.slug);
    const configuredHero = products.find((p) => p.id === Number(heroes[meta.slug]));
    const hero = (isPromotionSafeProduct(configuredHero) && configuredHero)
      || inCat.find(isPromotionSafeProduct)
      || null;
    return {
      slug: meta.slug,
      name: meta.title || inCat[0]?.catName || meta.slug,
      blurb: meta.blurb,
      count: inCat.length,
      from: inCat.length ? Math.min(...inCat.map((p) => p.price)) : 0,
      // Falls back to the category's own icon where no product stands in for it.
      image: hero ? hero.image : img(meta.icon),
      heroName: hero ? hero.name : meta.title || "",
    };
  }).filter((c) => c.count > 0);

  let catsDropped = 0;
  if (cats.length > MAX_CATS) {
    const kept = [...cats].sort((a, b) => b.count - a.count).slice(0, MAX_CATS);
    catsDropped = cats.length - kept.length;
    cats = cats.filter((c) => kept.includes(c));
  }
  if (cats.length < MIN_CATS) cats = [];

  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))]
    .map((b) => ({ name: b, count: products.filter((p) => p.brand === b).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const audiences = audienceConfig.map((audience) => ({
    ...audience,
    count: products.filter((product) => product.audiences.includes(audience.slug)).length,
  }));

  _cache = {
    products,
    cats,
    catsDropped,
    cfg,
    brands,
    audiences,
    lo: Math.min(...products.map((p) => p.price)),
    hi: Math.max(...products.map((p) => p.price)),
    onSale: products.filter((p) => p.was).length,
  };
  writeCatalogSnapshot(_cache);
  return _cache;
}

/* Per-reference detail. products/{id}/info is the only source of the real
   image gallery; the list endpoints carry a single icon.
   NOTE: article_pack.article.body on these records is mismatched demo copy
   (one watch returns marketing text about a portable monitor), so it is not used. */
const URL_PRODUCT_INFO = (id) => `${SHOP.xapi}/shops/@${SHOP.handle}/products/${id}/info`;

export async function loadProduct(id) {
  const r = await fetch(URL_PRODUCT_INFO(id), { mode: "cors", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`products/${id}/info ${r.status}`);
  const p = (await r.json()).product;
  if (!p) throw new Error("no product in response");
  const gallery = [];
  const seen = new Set();
  const push = (path, alt, w, h, variantId = null) => {
    const u = img(path);
    if (u && !seen.has(u)) {
      seen.add(u);
      gallery.push({ src: u, alt: alt || "", w: w || 1000, h: h || 1000, variantId: Number(variantId) || null });
    }
  };
  push(p.icon, `${p.title}, main view`);
  /* Re-uploads get a new CDN URL, so URL de-duplication alone leaves several
     identical thumbnails for one variant. Keep the image Selldone currently
     assigns to that variant (or the first upload when no assignment exists),
     while preserving every unassigned editorial/lifestyle gallery image. */
  const preferredVariantImage = new Map((p.product_variants || [])
    .filter((variant) => variant?.id && variant?.image)
    .map((variant) => [Number(variant.id), String(variant.image)]));
  const groupedVariantImages = new Map();
  const editorialImages = [];
  (p.images || []).forEach((im) => {
    const variantId = Number(im?.variant_id) || null;
    if (!variantId) editorialImages.push(im);
    else {
      if (!groupedVariantImages.has(variantId)) groupedVariantImages.set(variantId, []);
      groupedVariantImages.get(variantId).push(im);
    }
  });
  groupedVariantImages.forEach((images, variantId) => {
    const preferred = preferredVariantImage.get(variantId);
    const chosen = images.find((image) => String(image.path) === preferred) || images[0];
    if (chosen) push(chosen.path, chosen.alt || `${p.title}, color view`, chosen.width, chosen.height, variantId);
  });
  editorialImages.forEach((im, i) => push(im.path, im.alt || `${p.title}, view ${i + 2}`, im.width, im.height));
  return { raw: p, gallery };
}

export const byId = (cat, id) => cat.products.find((p) => p.id === Number(id));
export const catOf = (cat, slug) => cat.cats.find((c) => c.slug === slug) || null;

/* ---------- Bag ----------
   Browsing stays instant in local storage. At checkout the final quantities
   are written to the authenticated customer's real Selldone physical basket. */
const BAG_KEY = "storefront_bag_v1";

export function readBag() {
  try { return JSON.parse(localStorage.getItem(BAG_KEY)) || []; }
  catch { return []; }
}
export function writeBag(rows) {
  localStorage.setItem(BAG_KEY, JSON.stringify(rows));
  document.dispatchEvent(new CustomEvent("bag:changed", { detail: rows }));
}
export function addToBag(id, qty = 1, variant = null) {
  const rows = readBag();
  const variantId = Number(variant?.id || variant || 0) || null;
  const hit = rows.find((r) => r.id === Number(id) && (r.variantId || null) === variantId);
  if (hit) hit.qty += qty; else rows.push({ id: Number(id), qty, variantId });
  writeBag(rows);
  return rows;
}
export function removeFromBag(id) {
  writeBag(readBag().filter((r) => r.id !== Number(id)));
}
export const bagCount = () => readBag().reduce((n, r) => n + r.qty, 0);
export function bagLines(cat) {
  return readBag()
    .map((r) => {
      const p = byId(cat, r.id);
      const variant = p && r.variantId ? variantsOf(p.raw).find((v) => Number(v.id) === Number(r.variantId)) : null;
      const unitPrice = variant?.price > 0 ? variant.price - (variant.discount || 0) : p?.price || 0;
      return { ...r, p, variant, unitPrice };
    })
    .filter((r) => r.p);
}
export const bagSubtotal = (cat) =>
  bagLines(cat).reduce((n, r) => n + r.unitPrice * r.qty, 0);

export async function syncBagToSelldone(accessToken, cat) {
  if (!accessToken) throw new Error("Sign in is required before checkout.");
  const lines = bagLines(cat);
  if (!lines.length) throw new Error("Your bag is empty.");
  for (const line of lines) {
    const response = await fetch(`${SHOP.xapi}/shops/@${SHOP.handle}/basket/${line.p.id}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ count: line.qty, variant_id: line.variantId || null }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error_msg || payload?.message || `Basket update failed (${response.status}).`);
    }
  }
  return lines;
}
