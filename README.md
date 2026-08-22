# Marko Marketplace

Marko is a static-first, API-backed Selldone marketplace built from the Fashioni v2 storefront. Its interface uses an original blue, search-first retail system inspired by the information density and marketplace patterns of large general retailers, without copying Walmart code, branding, copy, or media.

Production: https://selldone-marko-marketplace.ee-shirdel.workers.dev

## Live commerce model

| Area | Live source |
| --- | --- |
| Shop | Selldone shop `15596`, handle `marko-5vMFPy7t` |
| Catalogue | 322 physical products |
| Fashion seller | Alio (`6178`): 195 products, 1,603 variant offers |
| Electronics seller | Merino (`6179`): 127 products, 397 variant offers |
| Inventory | 2,000 vendor offers with exact canonical variant quantities |
| Checkout | Browser-direct Selldone XAPI |
| Hosting | [Cloudflare Workers Static Assets](https://selldone-marko-marketplace.ee-shirdel.workers.dev) |

The homepage, product cards, product pages, seller directory, and dedicated seller pages are data-driven. `storefront/marketplace-config.js` contains only public fallback presentation metadata and the restored audience shortcut mirror; live prices, stock, product data, and public vendor records remain in Selldone.

## Marketplace routes

- `/` — marketplace homepage with mixed Alio/Merino merchandising
- `/shop.html` — all products and live filters
- `/vendors.html` — seller directory
- `/vendor.html?vendor=alio` — Alio fashion storefront
- `/vendor.html?vendor=merino` — Merino electronics storefront
- `/brands.html` — live brand discovery
- `/product.html?id=<id>` — product detail with seller attribution

## Local development

```bash
npm ci
npm run dev
```

The default development URL is printed by the server. This workspace was tested at `http://localhost:9137/`.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run build:pages` | Regenerate informational, brand, blog, and article pages |
| `npm run build` | Build the deployable `dist/` output |
| `npm run check:audit -- <url>` | Responsive multi-page audit |
| `npm run check:pages -- <url>` | Route, footer, header, and policy checks |
| `npm run check:controls -- <url>` | Dead-control sweep |
| `npm run check:hero -- <url>` | Marketplace hero checks |
| `npm run check:port -- <url>` | Starter portability checks |
| `npm run deploy` | Deploy `dist/` through Wrangler |

## Project structure

```text
storefront/                  Source HTML, CSS, JavaScript, and assets
storefront/marketplace-config.js
                             Public seller/category/audience mappings
store-pages/                 Customer-facing policy source Markdown
scripts/                     Build, setup, audit, and validation tools
dist/                        Generated deployment output (not committed)
shop.config.json             Public Marko shop configuration
wrangler.toml                Cloudflare Workers Static Assets config
.starter-provenance.json     Exact Fashioni v2 source commit
```

## Data and security boundaries

- Do not place API tokens, client secrets, private keys, or MCP credentials in browser code or `shop.config.json`.
- Product, variant, price, stock, basket, authentication, and checkout data are loaded from Selldone.
- `All Products`, `Departments`, `Sellers`, and audience links are presentation routes, not synthetic catalogue wrappers.
- Audience shortcuts are restored from the validated migration snapshot because Selldone's public product list omits shortcut relationships.
- Alio and Merino seller attribution is derived from the product's real category/vendor allocation, not from a cosmetic label.
- `dist/`, local backups, and the supplied Walmart reference screenshots are build inputs neither to Git nor to deployment.

## Provenance

This project was bootstrapped from `alireza-selldone/selldone-fashioni` at commit `53286ca3b8f6ce805ec42509c61fe045c03cc036`. The reusable Fashioni starter and its acceptance contract remain under `skills/setup-selldone-fashion-store/`.
