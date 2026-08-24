# بلاک شدن IP توسط سلدان — گزارش و راه‌حل

**تاریخ:** ۲۴ آگوست ۲۰۲۶
**IP بلاک‌شده:** `91.107.253.60`
**پیام سرور:** `Your IP address [ 91.107.253.60 ] is blocked.`
**وضعیت پروداکشن:** سالم — `marko.selldone.shop` هنوز ۲۰۰ می‌ده. فقط این ماشین بلاکه.
**علت:** حجم بالای درخواست‌های QA از سمت من (Claude) طی دو روز.

> **عدد دقیق ندارم.** آمار زیر از روی خواندن مسیرهای کد و لاگ‌های باقی‌مانده در
> `tmp/` بازسازی شده، نه از یک لاگ واقعی درخواست‌ها.

---

## ۱. مقصر اصلی — `scripts/imgsweep.mjs`

خط ۱۷۱ کل کاتالوگ را می‌گیرد و **بدون هیچ محدودیتی** به همه‌ی صفحات محصول سر می‌زند:

```js
const ids = await p.evaluate(async () =>
  (await import("/shop-data.js")).loadCatalog().then((c) => c.products.map((x) => x.id)));
//                                                          ↑ بدون slice / بدون نمونه‌گیری
for (const id of ids) {
  await p.goto(BASE + page_("/product") + "?id=" + id);   // ۳۲۲ بار
}
```

عدد واقعی از لاگ‌ها: **`--- 322 product pages ---`**

### چرا این‌قدر بد است

کش کاتالوگ (`_cache` در `storefront/shop-data.js:664`) یک متغیر سطح‌ماژول است و
**با هر ناوبری ریست می‌شود**. اسنپ‌شات localStorage هم فقط مسیر fallback هنگام
خطاست، نه cache-first:

```js
export async function loadCatalog() {
  if (_cache) return _cache;          // ← با هر page load دوباره null است
  ...
  try {
    [listJson, allJson] = await Promise.all([
      fetchJson(URL_PRODUCTS_LIST()),  // products/list?limit=250
      fetchJson(URL_PRODUCTS_ALL()),   // products/all?dir=*&limit=250
    ]);
  } catch (error) {
    const snapshot = readCatalogSnapshot();   // ← فقط موقع خطا
```

پس هر بار باز شدن یک صفحه محصول:

| درخواست | تعداد |
|---|---|
| `GET /shops/@marko/products/list?limit=250` | ۱ |
| `GET /shops/@marko/products/all?dir=*&limit=250` | ۱ |
| `GET /shops/@marko/products/{id}/info` | ۱ |

**۳۲۲ صفحه × ۳ ≈ ۹۶۶ درخواست در یک اجرای `check:images`** — که ۶۴۴ تای آن
کشیدن کامل کاتالوگ ۲۵۰ محصولی است، کاملاً بی‌فایده و تکراری.

---

## ۲. `scripts/audit-catalog-media.mjs` — بدترین الگو

```js
const list = await fetchJson(`${XAPI}/shops/@${SHOP_HANDLE}/products/list?limit=250`);
const products = await mapLimit(list.products || [], 2, async (row) => {
  const detail = (await fetchJson(`${XAPI}/shops/@${SHOP_HANDLE}/products/${row.id}/info`)).product;
  ...
  const inspected = await mapLimit(assets, 4, ...);   // دانلود همه‌ی تصاویر از CDN
```

- ۱ + ۲۵۰ = **۲۵۱ درخواست XAPI**
- به‌علاوه **چند صد دانلود تصویر** از CDN با concurrency ۴
- **هیچ مکثی ندارد** — تنها اسکریپتی که کاملاً بدون throttle است

---

## ۳. `scripts/audit-variant-images.mjs` — همان الگو، کمی مؤدب‌تر

```js
const listing = await fetchJson(`${base}/products/all?dir=*&limit=250&products_only=true...`);
for (let offset = 0; offset < products.length; offset += 2) {
  const batch = products.slice(offset, offset + 2);
  details.push(...await Promise.all(batch.map(async (row) =>
    (await fetchJson(`${base}/products/${row.id}/info`)).product)));
  await new Promise((resolve) => setTimeout(resolve, 500));   // ← حداقل یک مکث دارد
}
```

۱ + ۲۵۰ = **۲۵۱ درخواست**، ولی با ۵۰۰ms مکث بین هر جفت.

---

## ۴. بقیه‌ی چک‌ها

هرکدام چند صفحه‌ی استورفرانت را لود می‌کنند، و **هر لود دوباره
`products/list` + `products/all` می‌زند**:

- `scripts/pagecheck.mjs`
- `scripts/deadctl.mjs`
- `scripts/herocheck.mjs`
- `scripts/bentocheck.mjs`
- `scripts/variant-sizecheck.mjs`

و `npm run check` هر ۹ زیرچک را پشت سر هم اجرا می‌کند:

```
check → check:leak && check:variants && check:audit && check:images
     && check:pages && check:controls && check:hero && check:bento && check:port
```

**اسکریپت‌هایی که XAPI زنده را نمی‌زنند** (اینها مشکلی ندارند):
`scripts/audit-run.mjs` و `scripts/portcheck.mjs` — هر دو XAPI را stub می‌کنند.
`scripts/leakcheck.mjs` کاملاً استاتیک است.

---

## ۵. چند بار اجرا شد

از روی لاگ‌های باقی‌مانده در `tmp/`:

```
check-full.log   check2.log   check3.log   check4.log
final.log        final2.log   final3.log   final4.log
scan2.log        pdp-check.log            pdp-check2.log
```

**دست‌کم ۱۱ اجرا** طی دو روز، جدا از اجراهای تکی اسکریپت‌ها.

**مرتبه‌ی بزرگی: چند هزار تا حدود ۱۰٬۰۰۰ درخواست XAPI**، با burstهای ۲۵۰تایی
روی `products/{id}/info`.

---

## ۶. چرا شبیه scraper دیده شد

آنچه سلدان از این IP دید:

1. کشیدن پشت‌سرهم کل کاتالوگ ۲۵۰ محصولی
2. سپس درخواست تک‌تک هر ۲۵۰ محصول با concurrency ثابت
3. بدون مکث (در `audit-catalog-media`)
4. ده‌ها بار تکرار در ۴۸ ساعت
5. همیشه از یک IP

این دقیقاً امضای یک scraper محصول است. بلاک شدن رفتار درستی از طرف سلدان بود.

---

## ۷. سه اصلاح لازم — **قبل از اجرای دوباره‌ی سوئیت**

بدون این‌ها، به‌محض باز شدن IP دوباره همین اتفاق می‌افتد.

### الف) کش کاتالوگ بین ناوبری‌ها را cache-first کن
`storefront/shop-data.js` — اسنپ‌شات localStorage الان فقط fallback خطاست.
اگر با یک TTL کوتاه cache-first شود، ۹۶۶ درخواست imgsweep به حدود **۳۲۴**
کاهش می‌یابد (فقط `/info`ها).
**بیشترین تأثیر، کمترین ریسک.** ضمناً برای مشتری واقعی هم صفحه را سریع‌تر می‌کند.

### ب) در `imgsweep.mjs` نمونه‌گیری کن
به‌جای هر ۳۲۲ محصول، یک نمونه‌ی نماینده (مثلاً ۲ محصول از هر دپارتمان ≈ ۲۰ تا)
برای QA بصری کافی است. `imgsweep` قرار است رگرسیون تصویری بگیرد، نه کل کاتالوگ را
ایندکس کند.

### ج) به `audit-catalog-media.mjs` مکث اضافه کن
تنها اسکریپتی که هیچ throttle ندارد. همان الگوی ۵۰۰ms که در
`audit-variant-images.mjs` هست را بگیرد.

---

## ۸. کاری که الان باید انجام شود

1. ایمیل به **`support@selldone.com`** برای رفع بلاک `91.107.253.60`
2. پیاده‌سازی سه اصلاح بالا **قبل از** اجرای دوباره‌ی `npm run check`
3. تا آن موقع: تست فقط با fixture آفلاین
   (`tmp/fx/` + intercept کردن XAPI در Playwright — الگویی که
   `scripts/portcheck.mjs` از قبل استفاده می‌کند)
