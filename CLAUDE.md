# Claude Code Handoff — Marko Marketplace

Read `AGENT.md` completely before changing anything. It is the authoritative
architecture, API, security, deployment, and UI contract for this repository.

## Current status

- GitHub branch: `codex/marko-marketplace`
- Production: `https://marko.selldone.shop`
- Local source: `storefront/`; generated deployment output: `dist/`
- Branch `claude/marketplace-redesign` carries the storefront redesign: one
  coherent design system in `storefront/styles.css` replacing the three stacked
  CSS layers, a rebuilt homepage, and one shared product card. Read the
  "UI Rules" and "QA Scripts" sections of `AGENT.md` before touching either.

## Non-negotiable behavior

- Keep catalog, category, product, price, inventory, vendor, tag, and checkout
  data live and dynamic from the connected Selldone shop. Do not hardcode shop
  product names, prices, image URLs, category counts, or promotional claims.
- Storefront/customer calls use `https://xapi.selldone.com`; dashboard/backoffice
  calls use `https://api.selldone.com`. Never swap these surfaces.
- Never commit credentials, tokens, `.env`, `dist/`, backups, browser profiles,
  or the local Walmart reference folder.
- Rear-angle apparel photography is permanently banned from all promotional
  placements. Use the shared promotional safety helpers in
  `storefront/shop-data.js`; ordinary listings and PDPs may still contain the
  product.
- No vendor names in homepage hero or Featured Departments promotional copy.
- Clearance labels only come from the real `clearance` product tag (Product
  Edit → Survey → Tags), never merely from a discount.
- Homepage promotional artwork is chosen by the user and configured in
  `shop.config.json` under `promoTiles`. Do not swap an image or re-point a
  tile to another department without being asked.
- Do not display product/category counts in customer-facing copy.

## Working method

1. Inspect the live page and the user's latest references before redesigning.
2. Preserve unrelated user changes in the working tree.
3. Build with `npm run build`.
4. Run the relevant checks. For homepage work, at minimum:
   - `npm run check:hero -- <local-url>`
   - `npm run check:bento -- <local-url>`
   - `npm run check:leak`
   `npm run check` runs the full suite and is currently green end to end. A
   check that fails because the design legitimately moved should have its
   assertion generalised to the contract, never weakened or deleted.
5. Inspect desktop and mobile screenshots visually. One rear-angle promotional
   image is a failed handoff.

Use `npm run dev` for local development and `npm run deploy` only when the user
explicitly authorizes a production deployment.
