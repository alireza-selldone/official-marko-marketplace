export const MARKETPLACE_VENDORS = {
  alio: {
    id: 6178,
    slug: "alio",
    name: "Alio",
    eyebrow: "Fashion marketplace",
    description: "Curated fashion, activewear, footwear, and accessories for everyday life.",
    categoryIds: [108846, 108847, 108848, 108849, 108850, 108851, 108852, 108853],
    accent: "coral",
  },
  /* Pet arrived as seven departments in one overnight import. Mapping them to
     the seller who handles pet keeps every department with a specialist, which
     is what the vendor descriptions in the backoffice already promise. */
  "kyle-mason": {
    id: 6181,
    slug: "kyle-mason",
    name: "Kyle Mason",
    eyebrow: "Pet marketplace",
    description: "Food, clothing, toys, and everyday essentials for dogs, cats, rabbits, and turtles.",
    categoryIds: [109024, 109025, 109026, 109027, 109028, 109029, 109030],
    accent: "emerald",
  },
  merino: {
    id: 6179,
    slug: "merino",
    name: "Merino",
    eyebrow: "Technology marketplace",
    description: "Smart electronics and practical technology for home, work, and play.",
    categoryIds: [108828, 108829, 108830, 108831, 108832, 108833, 108834, 108835, 108836, 108837, 108838, 108839, 108840, 108841, 108842],
    accent: "blue",
  },
};

export const AUDIENCE_CATEGORIES = [
  { id: 108854, slug: "women", title: "Women", image: "assets/categories/women.png" },
  { id: 108855, slug: "men", title: "Men", image: "assets/categories/men.png" },
  { id: 108856, slug: "girls", title: "Girls", image: "assets/categories/girls.png" },
  { id: 108857, slug: "boys", title: "Boys", image: "assets/categories/boys.png" },
  { id: 108858, slug: "baby", title: "Baby", image: "assets/categories/baby.png" },
  { id: 108859, slug: "baby-girls", title: "Baby Girls", image: "assets/categories/baby-girls.png" },
  { id: 108860, slug: "baby-boys", title: "Baby Boys", image: "assets/categories/baby-boys.png" },
];

export const AUDIENCE_PRODUCT_IDS = {
  108854: [710944,710946,710947,710948,710949,710950,710951,710952,710953,710954,710955,710956,710957,710958,710960,710961,710962,710965,710966,710967,710968,710969,710970,711022,711023,711024,711025,711026,711027,711028,711029,711030,711031,710986,710987,710988,710989,710990,710991,710992,710993,711032,711033,711034,711035,711036,711037,711038,711039,711040,711041,710897,711012,711013,711014,711015,711016,711017,711018,711019,711020,711021,710899,710898,711010,711011,711008,711007,711006,711005,711009,711004,711003,711002,711042,711043,711044,711045,711046,711047,711048,711049,711050,711051,711052,711053,711054,711055,711056,711057,711058,711059,711060,711061,710900,710916,710917,710918,710919,710920,711001,710901,710921,710922,710923,710924,710925,710926,710910,710912,710913,710914,710915,710902,710903,710904,710905,710906,710907,710908,710909,710911],
  108855: [710944,710945,710946,710947,710948,710949,710950,710951,710952,710953,710954,710955,710956,710957,710958,710960,710961,710962,710968,711022,711023,711024,711025,711026,711027,711028,711029,711030,711031,710978,710979,710980,710981,710982,710983,710984,710985,711062,711063,711064,711065,711066,711067,711068,711069,711070,711071,711012,711013,711014,711015,711016,711017,711018,711019,711020,711021,711042,711043,711044,711045,711046,711047,711048,711049,711050,711051,711053,711058,711060,710927,710928,710929,710930,710931,710933,710932,710934,710935,710936],
  108856: [710959,710963,710964,710977,710994,710995,710996,710997,710998,710999,711000,711081,711091,711089,710938,710939,710941,710942,710943,711087,711078,710937,710971,710972,710973,710974,710975,710976,711090,711077,711079,711080,711088],
  108857: [710959,710963,710964,710977,710994,710995,710996,710997,710998,710999,711000,711076,711086,711084,711082,711074,711083,711085,711072,711073,711075],
  108858: [711076,711081,710940,711074,711078,711072,711073,711075,711077,711079,711080],
  108859: [711081,711078,711077,711079,711080],
  108860: [711076,710940,711074,711072,711073,711075],
};

/* ---------- Live vendor roster ----------
   The marketplace's sellers live in the backoffice, not here. What this file
   still has to supply is the department mapping, because Selldone's products
   carry no vendor_id: every product in the catalog reports `vendor_id: null`,
   so the only way to say which seller owns a department is to record it.

   Everything else — who exists, their name, their description, their logo —
   comes from the vendors endpoint at render time. A seller added in the
   backoffice therefore appears in the directory and gets a page without a code
   change; one that is renamed or given a logo updates on the next load. A
   seller with no departments mapped yet still gets a page, and says plainly
   that it has nothing listed rather than showing someone else's products. */

export const vendorSlug = (name) => String(name || "")
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const ACCENTS = ["coral", "blue", "emerald", "violet", "amber"];

export function vendorRoster(liveVendors = []) {
  const configured = Object.values(MARKETPLACE_VENDORS);
  const byId = new Map(configured.map((vendor) => [Number(vendor.id), vendor]));
  const roster = [];
  const claimed = new Set();

  liveVendors.forEach((live, index) => {
    const config = byId.get(Number(live.id));
    const slug = config?.slug || vendorSlug(live.name);
    if (!slug || claimed.has(slug)) return;
    claimed.add(slug);
    roster.push({
      id: Number(live.id),
      slug,
      name: live.name || config?.name || slug,
      description: live.description || config?.description || "",
      icon: live.icon || "",
      eyebrow: config?.eyebrow || "Independent seller",
      accent: config?.accent || ACCENTS[index % ACCENTS.length],
      categoryIds: config?.categoryIds || [],
    });
  });

  /* If the endpoint is unreachable the configured sellers still render, so a
     network failure degrades to the previous behaviour rather than an empty
     directory. */
  if (!roster.length) return configured.map((vendor) => ({ ...vendor, icon: "" }));
  return roster;
}

/* ---------- Who sells what ----------
   Selldone reports `vendor_id: null` on every product and every category, so
   the storefront has to decide. Two policies, because the right answer depends
   on what the marketplace is demonstrating:

   "category"  departments map to sellers, so Alio stays fashion and Merino
               stays technology. Coherent, but a department nobody has mapped
               leaves its products with no seller at all - which is exactly
               what happened when seven pet departments arrived overnight and
               forty products landed on the site owned by nobody.

   "even"      every product is spread across the roster evenly.

   Under either policy nothing is ever left unassigned: an unmapped department
   falls through to the even split. That is the part that matters, and it is
   why adding a department can no longer silently orphan its products. */
export const VENDOR_ASSIGNMENT = "category";

/* A hash rather than Math.random: the same product must land on the same
   seller on every render, or its badge would change as you browse. */
function evenVendor(productId, roster) {
  if (!roster.length) return null;
  const id = Number(productId) || 0;
  let hash = 2166136261;
  for (const ch of String(id)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return roster[hash % roster.length];
}

export function assignVendor(product, roster = [], policy = VENDOR_ASSIGNMENT) {
  const categoryId = Number(product?.category_id ?? product?.categoryId);
  const productId = product?.id;
  if (!roster.length) return null;

  /* When Selldone starts populating vendor_id, that is the real answer and
     everything below becomes dead code worth deleting. */
  const declared = Number(product?.vendor_id);
  if (declared) {
    const match = roster.find((vendor) => vendor.id === declared);
    if (match) return match;
  }

  if (policy === "category") {
    const mapped = roster.find((vendor) => vendor.categoryIds?.includes(categoryId));
    if (mapped) return mapped;
  }
  return evenVendor(productId, roster);
}

export const vendorForCategory = (categoryId) => {
  const id = Number(categoryId);
  return Object.values(MARKETPLACE_VENDORS).find((vendor) => vendor.categoryIds.includes(id)) || null;
};

export const vendorForProduct = (product) =>
  vendorForCategory(product?.categoryId ?? product?.raw?.category_id ?? product?.category_id);

export const MARKET_DEPARTMENTS = [
  { label: "Fashion", href: "vendor.html?vendor=alio" },
  { label: "Electronics", href: "vendor.html?vendor=merino" },
  { label: "Women", href: "shop.html?audience=women" },
  { label: "Men", href: "shop.html?audience=men" },
  { label: "Kids", href: "shop.html?audience=kids" },
  { label: "Activewear", href: "shop.html?cat=activewear" },
  { label: "Computers", href: "shop.html?cat=laptop" },
  { label: "Audio", href: "shop.html?cat=headphones" },
];
