import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import sharp from "sharp";
import { selldoneImagePathToUrl } from "../dashboard/features/selldone-images.js";

const SHOP_ID = 15552;
const SHOP_HANDLE = "fashioni";
const ROOT = resolve(".tmp/catalog-media");
const REPORT = resolve(".tmp/catalog-media-audit.json");
const XAPI = "https://xapi.selldone.com";
const COLOR_WORDS = [
  "black", "white", "charcoal", "grey", "gray", "silver", "blue", "navy", "indigo",
  "teal", "turquoise", "green", "olive", "sage", "red", "burgundy", "maroon", "coral",
  "orange", "yellow", "mustard", "gold", "pink", "rose", "purple", "violet", "lilac",
  "lavender", "plum", "cream", "ivory", "beige", "sand", "tan", "brown", "camel",
];

await mkdir(ROOT, { recursive: true });

async function fetchJson(url, attempt = 0) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 429 && attempt < 6) {
    const retryAfter = Number(response.headers.get("retry-after")) || 2 ** attempt;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, retryAfter * 1000));
    return fetchJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/* `pauseMs` paces each worker between items. Without it this script walked all
   250 products at full speed, which reads as scraping from the other end and is
   part of what got this machine's IP blocked by Selldone on 2026-08-23. See
   docs/selldone-ip-block.md. */
async function mapLimit(rows, limit, task, pauseMs = 0) {
  const out = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      out[index] = await task(rows[index], index);
      if (pauseMs > 0 && cursor < rows.length) {
        await new Promise((resolve) => setTimeout(resolve, pauseMs));
      }
    }
  }));
  return out;
}

function imageUrl(path) {
  return selldoneImagePathToUrl(path, { shopId: SHOP_ID, scope: "products" });
}

function safeExt(url) {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extension) ? extension : ".img";
}

function wordsOf(...values) {
  const haystack = values.filter(Boolean).join(" ").toLowerCase().replaceAll(/[^a-z]+/g, " ");
  return COLOR_WORDS.filter((word) => new RegExp(`\\b${word}\\b`).test(haystack));
}

async function inspectImage(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);
  const pipeline = sharp(bytes, { failOn: "none" }).rotate().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).ensureAlpha();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const edge = Math.max(2, Math.round(Math.min(width, height) * 0.06));
  let pixels = 0, opaque = 0, transparent = 0, edgePixels = 0, edgeNearWhite = 0, edgeNeutralBright = 0, nearWhite = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2], a = data[offset + 3];
    const high = Math.max(r, g, b), low = Math.min(r, g, b), avg = (r + g + b) / 3;
    const isNearWhite = a > 245 && low > 242;
    const isNeutralBright = a > 245 && high - low < 10 && avg > 225;
    pixels += 1;
    if (a > 250) opaque += 1;
    if (a < 5) transparent += 1;
    if (isNearWhite) nearWhite += 1;
    if (x < edge || y < edge || x >= width - edge || y >= height - edge) {
      edgePixels += 1;
      if (isNearWhite) edgeNearWhite += 1;
      if (isNeutralBright) edgeNeutralBright += 1;
    }
  }
  const opaqueRatio = opaque / pixels;
  const transparentRatio = transparent / pixels;
  const edgeWhiteRatio = edgeNearWhite / edgePixels;
  const edgeNeutralBrightRatio = edgeNeutralBright / edgePixels;
  const whiteRatio = nearWhite / pixels;
  return {
    width,
    height,
    opaqueRatio,
    transparentRatio,
    edgeWhiteRatio,
    edgeNeutralBrightRatio,
    whiteRatio,
    whiteBackdrop: opaqueRatio > 0.995 && edgeWhiteRatio > 0.72 && whiteRatio > 0.12,
    brightNeutralBackdrop: opaqueRatio > 0.995 && edgeNeutralBrightRatio > 0.78 && whiteRatio > 0.08,
  };
}

const list = await fetchJson(`${XAPI}/shops/@${SHOP_HANDLE}/products/list?limit=250`);
const products = await mapLimit(list.products || [], 2, async (row) => {
  const detail = (await fetchJson(`${XAPI}/shops/@${SHOP_HANDLE}/products/${row.id}/info`)).product;
  const productDir = join(ROOT, String(row.id));
  await mkdir(productDir, { recursive: true });
  const assets = [
    { role: "icon", path: detail.icon, variantId: null },
    ...(detail.images || []).map((image, index) => ({ role: `gallery-${index + 1}`, path: image.path, variantId: Number(image.variant_id) || null })),
  ].filter((asset) => asset.path);
  const inspected = await mapLimit(assets, 4, async (asset, index) => {
    const url = imageUrl(asset.path);
    const target = join(productDir, `${String(index).padStart(2, "0")}-${asset.role}${safeExt(url)}`);
    try {
      return {
        ...asset,
        url,
        file: target,
        colorWords: wordsOf(detail.title, asset.path),
        analysis: await inspectImage(url, target),
      };
    } catch (error) {
      return { ...asset, url, file: target, colorWords: wordsOf(detail.title, asset.path), error: String(error) };
    }
  });
  return {
    id: Number(detail.id),
    title: detail.title,
    brand: detail.brand || "",
    categoryId: Number(detail.category_id) || null,
    variants: (detail.product_variants || []).filter((variant) => variant && !variant.deleted_at).map((variant) => ({
      id: Number(variant.id), color: variant.color || "", type: variant.type || "", style: variant.style || "",
      volume: variant.volume || "", weight: variant.weight || "", pack: variant.pack || "", quantity: Number(variant.quantity) || 0,
      sku: variant.sku || "", image: variant.image || null, pricing: Boolean(variant.pricing), price: Number(variant.price) || 0,
      discount: Number(variant.discount) || 0, currency: variant.currency || detail.currency || "USD",
    })),
    colorWords: wordsOf(detail.title, detail.icon, ...(detail.images || []).map((image) => image.path)),
    assets: inspected,
  };
}, 500);

const affected = products.flatMap((product) => product.assets
  .filter((asset) => asset.analysis?.whiteBackdrop || asset.analysis?.brightNeutralBackdrop)
  .map((asset) => ({ productId: product.id, title: product.title, role: asset.role, file: asset.file, url: asset.url, analysis: asset.analysis })));
const report = { generatedAt: new Date().toISOString(), shopId: SHOP_ID, productCount: products.length, affectedCount: affected.length, affected, products };
await writeFile(REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: REPORT, products: products.length, assets: products.reduce((n, product) => n + product.assets.length, 0), affected: affected.length }, null, 2));
