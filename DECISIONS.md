# Marko marketplace decisions

## Identity and platform

- Selldone shop: Marko, id `15596`, handle `marko-5vMFPy7t`
- Store language and currency: English / USD
- Storefront runtime: static HTML, CSS, and browser JavaScript backed by Selldone XAPI
- Deployment target: Cloudflare Workers Static Assets under `selldone-marko-marketplace`
- Starter provenance: Fashioni v2 commit `53286ca3b8f6ce805ec42509c61fe045c03cc036`

## Seller architecture

Marko has two specialist vendors. Alio owns all eight fashion product-type categories and their 195 products. Merino owns all fifteen electronics categories and their 127 products. Allocation is enforced in Selldone at variant-offer level: 1,603 Alio offers plus 397 Merino offers, with no duplicate keys, category/vendor mismatches, or quantity mismatches after migration.

Seller attribution in the UI comes from the product's category-to-vendor mapping and is shown on cards and product detail pages. The public vendor API is used when a vendor is visible there; `marketplace-config.js` supplies non-commercial presentation fallback so a seller page remains navigable while an owner's invitation is pending. It never overrides product price, stock, or checkout data.

Merino's Selldone vendor account must be accepted by its owner account before it reappears in the platform's official public vendor directory. The custom Merino storefront remains functional and its 397 offers remain assigned during that pending state.

## Catalogue and navigation

Product-type categories remain the canonical main categories. Women, Men, Girls, Boys, Baby, Baby Girls, and Baby Boys are audience shortcuts restored from the validated Fashioni migration snapshot. Baby Girls and Baby Boys sit beneath Baby; the other shortcuts are roots.

`All Products`, `Departments`, `Sellers`, and the retired `Shop by Product` label are presentation concepts only. They must never be created as Selldone categories. Taxonomy writes must reject self-parenting, cycles, duplicate wrappers, and missing parents before mutation and verify the live hierarchy afterwards.

## Design direction

The storefront uses an original Marko retail system: blue search-first header, compact department navigation, soft campaign fields, dense product rails, and seller-specific accent colors. Walmart was reviewed for marketplace information patterns such as search prominence, pickup/delivery utility, broad departments, merchandising rails, and dedicated seller destinations. No Walmart source code, logo, proprietary icon, copy, or media is reused.

The homepage intentionally mixes Alio and Merino product imagery in its first story. Subsequent stories focus on each seller. Dedicated seller pages use live product imagery and category counts, and remain responsive at desktop, tablet, and 390px mobile widths.

## Product options and accuracy

Color, Material, and Size are separate presentation dimensions. Size uses the shared variant classifier; internal slugs or material/color values must never leak into the Size filter. Audience filters use exact restored product-id sets because the public list endpoint omits shortcut relations.

Live prices, discounts, stock, variants, category data, brands, and product media come from Selldone. The storefront does not invent seller contact details, delivery promises, return windows, specifications, or legal identity.
