const DEFAULT_PUBLIC_ENV = {
  APP_NAME: "Selldone Custom Storefront",
  APP_BASE_URL: "",
  SELLDONE_BASE: "https://selldone.com",
  SELLDONE_AUTH_BASE: "https://selldone.com",
  SELLDONE_TOKEN_BASE: "https://selldone.com",
  API_BASE: "https://api.selldone.com",
  STOREFRONT_XAPI_BASE: "https://xapi.selldone.com",
  AUTH_PROMPT: "consent",
  CLIENT_ID: "",
  SHOP_ID: "",
  SHOP_NAME: "",
  SHOP_DOMAIN: "",
  STOREFRONT_SHOP_HANDLE: "",
  DASHBOARD_PATH: "/dashboard/",
  CALLBACK_PATH: "/callback",
  STOREFRONT_SCOPES: "profile,phone,address,user:profile:write,buy,order-history,my-gift-cards",
  SCOPES:
    "profile,backoffice:shop:read,backoffice:shop:write,backoffice:business-profile:read,backoffice:business-profile:write,backoffice:company:read,backoffice:company:write,backoffice:product:read,backoffice:product:write,backoffice:category:read,backoffice:category:write,backoffice:property-set:read,backoffice:property-set:write,backoffice:order:read,backoffice:order:write,backoffice:report:read,backoffice:customer:read,backoffice:customer:write,backoffice:reviews:read,backoffice:reviews:write,backoffice:community:read,backoffice:community:write,backoffice:logistic:read,backoffice:logistic:write,backoffice:print:read,backoffice:print:write,backoffice:finance:read,backoffice:finance:write,backoffice:giftcard:read,backoffice:giftcard:write,backoffice:vendor-payment:read,backoffice:vendor-payment:write,backoffice:discount-code:read,backoffice:discount-code:write,backoffice:coupon:read,backoffice:coupon:write,backoffice:offer:read,backoffice:offer:write,backoffice:cashback:read,backoffice:cashback:write,backoffice:lottery:read,backoffice:lottery:write,backoffice:ribbon:read,backoffice:ribbon:write,backoffice:affiliate:read,backoffice:affiliate:write,backoffice:page:read,backoffice:page:write,backoffice:faq:read,backoffice:faq:write,backoffice:ai:read,backoffice:ai:write,articles,backoffice:notifications,backoffice:support-tickets,backoffice:staff:read,backoffice:staff:write,backoffice:note:read,backoffice:note:write,connect:provider:read,connect:provider:write,vendor-read,vendor-write,agency:read,agency:write,selldone:developer:read,selldone:developer:write,selldone:monetization:read,selldone:monetization:write",
};

let cachedConfig = null;

export function getPublicConfig() {
  if (cachedConfig) return cachedConfig;
  const hasInjectedConfig = typeof window !== "undefined" && window.PAJULINA_PUBLIC_ENV && typeof window.PAJULINA_PUBLIC_ENV === "object";
  const injected = hasInjectedConfig
    ? window.PAJULINA_PUBLIC_ENV
    : {};
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const metaFallback = readMetaPublicEnv();
  const merged = {
    ...DEFAULT_PUBLIC_ENV,
    ...metaFallback,
    ...injected,
    STOREFRONT_SHOP_HANDLE: firstNonEmpty(
      injected.STOREFRONT_SHOP_HANDLE,
      metaFallback.STOREFRONT_SHOP_HANDLE,
      readMetaContent("shop-name"),
    ),
  };
  const appBaseUrl = String(merged.APP_BASE_URL || origin || "").replace(/\/$/, "");
  const selldoneBase = normalizeBaseUrl(merged.SELLDONE_BASE);
  /* No trailing slash is forced here: the redirect_uri has to match the value
     registered on the OAuth client exactly, and an appended slash makes it a
     different URI to the authorisation server. */
  const callbackPath = normalizePublicPath(merged.CALLBACK_PATH, "/callback/");
  const dashboardPath = normalizePublicPath(merged.DASHBOARD_PATH, "/dashboard/", true);
  cachedConfig = {
    ...merged,
    APP_BASE_URL: appBaseUrl,
    SELLDONE_BASE: selldoneBase,
    SELLDONE_AUTH_BASE: normalizeBaseUrl(merged.SELLDONE_AUTH_BASE || selldoneBase),
    SELLDONE_TOKEN_BASE: normalizeBaseUrl(merged.SELLDONE_TOKEN_BASE || selldoneBase),
    API_BASE: normalizeBaseUrl(merged.API_BASE),
    STOREFRONT_XAPI_BASE: normalizeBaseUrl(merged.STOREFRONT_XAPI_BASE),
    DASHBOARD_PATH: dashboardPath,
    CALLBACK_PATH: callbackPath,
    CALLBACK_URL: `${appBaseUrl}${callbackPath}`,
    shopId: Number.parseInt(merged.SHOP_ID, 10) || 0,
    dashboardScopes: splitScopes(merged.SCOPES),
    storefrontScopes: normalizeStorefrontScopes(merged.STOREFRONT_SCOPES),
    shop: {
      id: Number.parseInt(merged.SHOP_ID, 10) || 0,
      name: merged.SHOP_NAME || "Selldone shop",
      domain: merged.SHOP_DOMAIN || "",
    },
  };
  return cachedConfig;
}

function readMetaPublicEnv() {
  return compactObject({
    APP_NAME: readMetaContent("pajulina-app-name"),
    SELLDONE_BASE: readMetaContent("pajulina-selldone-base") || readMetaContent("service-url"),
    SELLDONE_AUTH_BASE: readMetaContent("pajulina-selldone-base") || readMetaContent("service-url"),
    SELLDONE_TOKEN_BASE: readMetaContent("pajulina-selldone-base") || readMetaContent("service-url"),
    API_BASE: readMetaContent("pajulina-api-base"),
    STOREFRONT_XAPI_BASE: readMetaContent("pajulina-xapi-base") || readMetaContent("selldone-xapi"),
    AUTH_PROMPT: readMetaContent("pajulina-auth-prompt"),
    CLIENT_ID: readMetaContent("pajulina-client-id"),
    SHOP_ID: readMetaContent("pajulina-shop-id"),
    SHOP_NAME: readMetaContent("pajulina-shop-name"),
    SHOP_DOMAIN: readMetaContent("pajulina-shop-domain"),
    STOREFRONT_SHOP_HANDLE: readMetaContent("pajulina-storefront-shop-handle") || readMetaContent("shop-name"),
    DASHBOARD_PATH: readMetaContent("pajulina-dashboard-path"),
    CALLBACK_PATH: readMetaContent("pajulina-callback-path"),
  });
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => String(entry || "").trim()));
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function readMetaContent(name) {
  if (typeof document === "undefined") return "";
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") || "";
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text || text === "/") return text;
  return text.replace(/\/+$/, "");
}

function normalizePublicPath(value, fallback, trailingSlash = false) {
  let path = String(value || fallback || "/").trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (trailingSlash && !path.endsWith("/")) path = `${path}/`;
  return path;
}

export function splitScopes(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function normalizeStorefrontScopes(value) {
  const allowed = new Set(["profile", "phone", "address", "user:profile:write", "buy", "order-history", "my-gift-cards"]);
  const requested = splitScopes(value).filter((scope) => allowed.has(scope));
  return Array.from(new Set(["profile", "phone", "address", "user:profile:write", "buy", "order-history", "my-gift-cards", ...requested]));
}

export function getDashboardEndpoints(shopId = getPublicConfig().shopId) {
  return {
    products: {
      label: "Products",
      path: `/shops/${shopId}/products/all-admin`,
      query: {
        dir: "*",
        limit: 100,
        offset: 0,
        products_only: "true",
        with_total: "true",
        with_category: "true",
        with_product_variants: "true",
        sortBy: "updated_at",
        sortDesc: "true",
      },
    },
    categories: {
      label: "Categories",
      path: `/shops/${shopId}/categories`,
      query: { limit: 100, offset: 0, children: "true", parent: "true", sortBy: "id", sortDesc: "false" },
    },
    orders: {
      label: "Orders",
      path: `/shops/${shopId}/process-center/baskets-PHYSICAL`,
      query: {
        offset: 0,
        limit: 50,
        sortBy: "created_at",
        sortDesc: "true",
        statuses: ["Open", "Reserved", "Payed", "COD", "Canceled"],
        with: ["items", "buyer", "payment"],
      },
    },
    customers: {
      label: "Customers",
      path: `/shops/${shopId}/customers`,
      query: { offset: 0, limit: 100, sortBy: "updated_at", sortDesc: "true" },
    },
    shopAnalytics: {
      label: "30-day shop analytics",
      path: `/shops/me/${shopId}`,
      query: { offset: 0, days: 30 },
    },
    blogs: {
      label: "Blog posts",
      path: `/shops/${shopId}/blogs`,
      query: { offset: 0, limit: 50, sortBy: "updated_at", sortDesc: "true" },
    },
    blogTimeline: {
      label: "Scheduled blog timeline",
      path: `/shops/${shopId}/timeline/articles`,
      query: {},
    },
    blogTags: {
      label: "Blog tags",
      path: `/shops/${shopId}/articles/tags`,
      query: {},
    },
    notifications: {
      label: "Notifications",
      path: "/notifications",
      query: { shop_id: shopId, offset: 0, limit: 20, mode: "new" },
    },
  };
}

