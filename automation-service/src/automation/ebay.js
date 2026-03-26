import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  cleanupTempDir,
  logStep,
  prepareImageFiles,
} from "./common.js";

const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";
const EBAY_IDENTITY_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_API_ROOT = "https://api.ebay.com";
const EBAY_TRADING_URL = "https://api.ebay.com/ws/api.dll";
const EBAY_TOKENS_DIR = path.resolve(process.cwd(), process.env.EBAY_TOKENS_DIR || "tokens");
const USER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
];
const APP_SCOPES = ["https://api.ebay.com/oauth/api_scope"];
const PENDING_CONNECT_STATES = new Map();

const MARKETPLACE_CONFIG = {
  EBAY_US: {
    currency: "USD",
    contentLanguage: "en-US",
    siteId: "0",
  },
};

function getEbayConfig() {
  return {
    clientId: process.env.EBAY_CLIENT_ID?.trim() || "",
    clientSecret: process.env.EBAY_CLIENT_SECRET?.trim() || "",
    ruName: process.env.EBAY_RUNAME?.trim() || "",
    marketplaceId: process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US",
  };
}

function getMarketplaceSettings(marketplaceId) {
  return MARKETPLACE_CONFIG[marketplaceId] || MARKETPLACE_CONFIG.EBAY_US;
}

function assertConfigured() {
  const config = getEbayConfig();
  const missing = [];

  if (!config.clientId) {
    missing.push("EBAY_CLIENT_ID");
  }

  if (!config.clientSecret) {
    missing.push("EBAY_CLIENT_SECRET");
  }

  if (!config.ruName) {
    missing.push("EBAY_RUNAME");
  }

  if (missing.length > 0) {
    throw new Error(`eBay API is not configured. Missing: ${missing.join(", ")}`);
  }

  return config;
}

function base64Credentials(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSku(payload) {
  const prefix = (payload.listingId || payload.title || "listing")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "listing";

  return `${prefix}-${Date.now()}`;
}

function normalizeCondition(condition) {
  const lowered = String(condition || "").toLowerCase();

  if (!lowered) {
    return "USED_GOOD";
  }

  if (lowered.includes("new without") || lowered.includes("open box")) {
    return "NEW_OTHER";
  }

  if (lowered.includes("new with defect")) {
    return "NEW_WITH_DEFECTS";
  }

  if (lowered.includes("new")) {
    return "NEW";
  }

  if (lowered.includes("like new")) {
    return "LIKE_NEW";
  }

  if (lowered.includes("excellent")) {
    return "USED_EXCELLENT";
  }

  if (lowered.includes("very good")) {
    return "USED_VERY_GOOD";
  }

  if (lowered.includes("acceptable")) {
    return "USED_ACCEPTABLE";
  }

  if (lowered.includes("parts") || lowered.includes("not working")) {
    return "FOR_PARTS_OR_NOT_WORKING";
  }

  if (lowered.includes("fair")) {
    return "USED_ACCEPTABLE";
  }

  return "USED_GOOD";
}

function sanitizeUserId(userId) {
  const normalized = String(userId || "default").trim().toLowerCase();
  return normalized.replace(/[^a-z0-9_-]/g, "_").slice(0, 80) || "default";
}

async function ensureTokensDir() {
  await fs.mkdir(EBAY_TOKENS_DIR, { recursive: true });
}

function getEbayTokensPath(userId) {
  return path.join(EBAY_TOKENS_DIR, `ebay-tokens.${sanitizeUserId(userId)}.json`);
}

async function readTokenStore(userId = "default") {
  try {
    const raw = await fs.readFile(getEbayTokensPath(userId), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeTokenStore(tokenStore, userId = "default") {
  await ensureTokensDir();
  await fs.writeFile(getEbayTokensPath(userId), `${JSON.stringify(tokenStore, null, 2)}\n`, "utf8");
}

async function requestIdentityToken(params) {
  const { clientId, clientSecret } = assertConfigured();
  const response = await fetch(EBAY_IDENTITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64Credentials(clientId, clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error_description || payload?.error || `eBay OAuth failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function getUserAccessToken(userId = "default") {
  const tokenStore = await readTokenStore(userId);

  if (!tokenStore?.refreshToken) {
    throw new Error("eBay API is not connected. Open Settings and run Connect eBay API first.");
  }

  if (tokenStore.accessToken && tokenStore.accessTokenExpiresAt && Date.now() < tokenStore.accessTokenExpiresAt - 60_000) {
    return tokenStore.accessToken;
  }

  const refreshed = await requestIdentityToken({
    grant_type: "refresh_token",
    refresh_token: tokenStore.refreshToken,
    scope: USER_SCOPES.join(" "),
  });

  const nextStore = {
    ...tokenStore,
    accessToken: refreshed.access_token,
    accessTokenExpiresAt: Date.now() + Number(refreshed.expires_in || 7200) * 1000,
    refreshToken: refreshed.refresh_token || tokenStore.refreshToken,
    scope: refreshed.scope || tokenStore.scope,
    updatedAt: Date.now(),
  };

  await writeTokenStore(nextStore, userId);
  return nextStore.accessToken;
}

let appTokenCache = null;

async function getAppAccessToken() {
  if (appTokenCache && Date.now() < appTokenCache.expiresAt - 60_000) {
    return appTokenCache.accessToken;
  }

  const payload = await requestIdentityToken({
    grant_type: "client_credentials",
    scope: APP_SCOPES.join(" "),
  });

  appTokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 7200) * 1000,
  };

  return appTokenCache.accessToken;
}

function extractEbayErrorMessage(payload, fallback) {
  if (payload?.errors?.length) {
    return payload.errors.map((error) => error.message || error.longMessage).filter(Boolean).join(" | ");
  }

  if (payload?.warnings?.length) {
    return payload.warnings.map((warning) => warning.message || warning.longMessage).filter(Boolean).join(" | ");
  }

  return fallback;
}

async function callEbayJson({ url, method = "GET", token, headers = {}, body }) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(extractEbayErrorMessage(payload, `eBay API request failed with ${response.status}`));
  }

  return payload;
}

async function chooseCategory(payload, marketplaceId) {
  const appToken = await getAppAccessToken();
  const marketplaceSettings = getMarketplaceSettings(marketplaceId);
  const categoryTree = await callEbayJson({
    url: `${EBAY_API_ROOT}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId)}`,
    token: appToken,
    headers: {
      "Accept-Language": marketplaceSettings.contentLanguage,
    },
  });

  const query = [payload.title, payload.category, payload.brand].filter(Boolean).join(" ");
  const suggestions = await callEbayJson({
    url: `${EBAY_API_ROOT}/commerce/taxonomy/v1/category_tree/${encodeURIComponent(categoryTree.categoryTreeId)}/get_category_suggestions?q=${encodeURIComponent(query)}`,
    token: appToken,
    headers: {
      "Accept-Language": marketplaceSettings.contentLanguage,
    },
  });

  const category = suggestions?.categorySuggestions?.[0]?.category;

  if (!category?.categoryId) {
    throw new Error("eBay could not determine a category for this listing. Add a clearer title/category and try again.");
  }

  return category;
}

function choosePolicy(policies, fieldName, marketplaceId) {
  const match = (policies || []).find((policy) =>
    policy.marketplaceId === marketplaceId &&
    (policy.categoryTypes || []).some((categoryType) => categoryType.name === "ALL_EXCLUDING_MOTORS_VEHICLES"),
  );

  if (!match?.[fieldName]) {
    throw new Error(`No usable eBay ${fieldName} was found for ${marketplaceId}. Configure business policies in eBay first.`);
  }

  return match[fieldName];
}

async function getSellerResources(userToken, marketplaceId) {
  const [locations, fulfillmentPolicies, paymentPolicies, returnPolicies] = await Promise.all([
    callEbayJson({
      url: `${EBAY_API_ROOT}/sell/inventory/v1/location?limit=50`,
      token: userToken,
    }),
    callEbayJson({
      url: `${EBAY_API_ROOT}/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
      token: userToken,
    }),
    callEbayJson({
      url: `${EBAY_API_ROOT}/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
      token: userToken,
    }),
    callEbayJson({
      url: `${EBAY_API_ROOT}/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
      token: userToken,
    }),
  ]);

  const location = (locations?.locations || []).find((entry) => entry.merchantLocationStatus === "ENABLED");

  if (!location?.merchantLocationKey) {
    throw new Error("No enabled eBay inventory location was found. Create or enable an inventory location in eBay first.");
  }

  return {
    merchantLocationKey: location.merchantLocationKey,
    fulfillmentPolicyId: choosePolicy(fulfillmentPolicies?.fulfillmentPolicies, "fulfillmentPolicyId", marketplaceId),
    paymentPolicyId: choosePolicy(paymentPolicies?.paymentPolicies, "paymentPolicyId", marketplaceId),
    returnPolicyId: choosePolicy(returnPolicies?.returnPolicies, "returnPolicyId", marketplaceId),
  };
}

function extractTagValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i"));
  return match?.[1]?.trim() || "";
}

function extractEbayListingId(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  const byPath = text.match(/\/itm\/(\d+)/i);
  if (byPath?.[1]) {
    return byPath[1];
  }

  const byQuery = text.match(/[?&]item=(\d+)/i);
  if (byQuery?.[1]) {
    return byQuery[1];
  }

  if (/^\d{8,}$/.test(text)) {
    return text;
  }

  return "";
}

async function endEbayFixedPriceItem({ userToken, itemId, siteId }) {
  const response = await fetch(EBAY_TRADING_URL, {
    method: "POST",
    headers: {
      "X-EBAY-API-CALL-NAME": "EndFixedPriceItem",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1231",
      "X-EBAY-API-RESPONSE-ENCODING": "XML",
      "X-EBAY-API-IAF-TOKEN": userToken,
      "Content-Type": "text/xml",
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <EndingReason>NotAvailable</EndingReason>
  <ItemID>${escapeXml(itemId)}</ItemID>
</EndFixedPriceItemRequest>`,
  });

  const xml = await response.text();
  const ack = extractTagValue(xml, "Ack");
  const errorMessage = extractTagValue(xml, "LongMessage") || extractTagValue(xml, "ShortMessage");

  if (!response.ok) {
    throw new Error(errorMessage || `eBay EndFixedPriceItem failed with ${response.status}`);
  }

  if (ack && !/success|warning/i.test(ack)) {
    throw new Error(errorMessage || "eBay EndFixedPriceItem did not succeed.");
  }
}

async function uploadEbayHostedPicture(userToken, filePath, siteId) {
  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const fileBlob = new Blob([fileBuffer], {
    type: "image/jpeg",
  });
  const formData = new FormData();
  formData.append(
    "XML Payload",
    `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PictureName>${escapeXml(fileName)}</PictureName>
  <PictureSet>Standard</PictureSet>
  <PictureSystemVersion>2</PictureSystemVersion>
</UploadSiteHostedPicturesRequest>`,
  );
  formData.append("file", fileBlob, fileName);

  const response = await fetch(EBAY_TRADING_URL, {
    method: "POST",
    headers: {
      "X-EBAY-API-CALL-NAME": "UploadSiteHostedPictures",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1231",
      "X-EBAY-API-RESPONSE-ENCODING": "XML",
      "X-EBAY-API-IAF-TOKEN": userToken,
    },
    body: formData,
  });

  const xml = await response.text();

  if (!response.ok) {
    throw new Error(`eBay picture upload failed with ${response.status}`);
  }

  const ack = extractTagValue(xml, "Ack");
  const errorMessage = extractTagValue(xml, "LongMessage") || extractTagValue(xml, "ShortMessage");

  if (ack && !/success|warning/i.test(ack)) {
    throw new Error(errorMessage || "eBay picture upload failed");
  }

  const fullUrl = extractTagValue(xml, "FullURL");

  if (!fullUrl) {
    throw new Error(errorMessage || "eBay picture upload did not return an EPS image URL");
  }

  return fullUrl;
}

async function uploadListingImagesToEbay(userToken, payload, siteId) {
  const { filePaths, tempDir } = await prepareImageFiles(payload.imageUrls);

  try {
    if (filePaths.length === 0) {
      throw new Error("At least one image is required for eBay API listings.");
    }

    const hostedUrls = [];

    for (const filePath of filePaths) {
      hostedUrls.push(await uploadEbayHostedPicture(userToken, filePath, siteId));
    }

    return hostedUrls;
  } finally {
    await cleanupTempDir(tempDir);
  }
}

function buildInventoryItemPayload(payload, imageUrls) {
  const condition = normalizeCondition(payload.condition);
  const aspects = {};

  if (payload.brand) {
    aspects.Brand = [String(payload.brand)];
  }

  if (payload.size) {
    aspects.Size = [String(payload.size)];
  }

  if (payload.category) {
    aspects.Type = [String(payload.category)];
  }

  const inventoryItem = {
    availability: {
      shipToLocationAvailability: {
        quantity: Math.max(1, Number(payload.quantity) || 1),
      },
    },
    condition,
    product: {
      title: String(payload.title).slice(0, 80),
      description: String(payload.description),
      imageUrls,
      ...(payload.brand ? { brand: String(payload.brand) } : {}),
      ...(Object.keys(aspects).length > 0 ? { aspects } : {}),
    },
  };

  if (!["NEW", "LIKE_NEW", "NEW_OTHER", "NEW_WITH_DEFECTS"].includes(condition)) {
    inventoryItem.conditionDescription = String(payload.description).slice(0, 1000);
  }

  return inventoryItem;
}

function buildOfferPayload(payload, sku, categoryId, sellerResources, marketplaceId, currency) {
  return {
    sku,
    marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: Math.max(1, Number(payload.quantity) || 1),
    categoryId,
    merchantLocationKey: sellerResources.merchantLocationKey,
    listingDescription: String(payload.description),
    listingPolicies: {
      fulfillmentPolicyId: sellerResources.fulfillmentPolicyId,
      paymentPolicyId: sellerResources.paymentPolicyId,
      returnPolicyId: sellerResources.returnPolicyId,
    },
    pricingSummary: {
      price: {
        currency,
        value: String(payload.price),
      },
    },
    includeCatalogProductDetails: true,
  };
}

export async function automateEbay(payload) {
  const userId = payload?.userId || "default";
  const config = assertConfigured();
  const marketplaceSettings = getMarketplaceSettings(config.marketplaceId);
  const userToken = await getUserAccessToken(userId);

  logStep("ebay", "Preparing listing through the eBay APIs.");

  const [category, sellerResources, imageUrls] = await Promise.all([
    chooseCategory(payload, config.marketplaceId),
    getSellerResources(userToken, config.marketplaceId),
    uploadListingImagesToEbay(userToken, payload, marketplaceSettings.siteId),
  ]);

  const sku = buildSku(payload);

  await callEbayJson({
    url: `${EBAY_API_ROOT}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
    method: "PUT",
    token: userToken,
    headers: {
      "Content-Language": marketplaceSettings.contentLanguage,
      "Content-Type": "application/json",
    },
    body: buildInventoryItemPayload(payload, imageUrls),
  });

  const offer = await callEbayJson({
    url: `${EBAY_API_ROOT}/sell/inventory/v1/offer`,
    method: "POST",
    token: userToken,
    headers: {
      "Content-Language": marketplaceSettings.contentLanguage,
      "Content-Type": "application/json",
    },
    body: buildOfferPayload(
      payload,
      sku,
      category.categoryId,
      sellerResources,
      config.marketplaceId,
      marketplaceSettings.currency,
    ),
  });

  const publishResult = await callEbayJson({
    url: `${EBAY_API_ROOT}/sell/inventory/v1/offer/${encodeURIComponent(offer.offerId)}/publish`,
    method: "POST",
    token: userToken,
    headers: {
      "Content-Language": marketplaceSettings.contentLanguage,
    },
  });

  logStep("ebay", "Listing submitted through the eBay APIs.");
  const listingId = publishResult?.listingId ? String(publishResult.listingId) : undefined;
  const listingUrl = listingId ? `https://www.ebay.com/itm/${listingId}` : undefined;

  return {
    ok: true,
    message: listingId
      ? `eBay listing submitted. Listing ID: ${listingId}`
      : "eBay listing submitted.",
    listingId,
    listingUrl,
  };
}

export async function removeEbayListing({ listingId, url, userId }) {
  const config = assertConfigured();
  const marketplaceSettings = getMarketplaceSettings(config.marketplaceId);
  const itemId = extractEbayListingId(url) || extractEbayListingId(listingId);

  if (!itemId) {
    return {
      ok: false,
      error: "Unable to determine eBay item ID from listingId/url.",
    };
  }

  const userToken = await getUserAccessToken(userId || "default");
  await endEbayFixedPriceItem({
    userToken,
    itemId,
    siteId: marketplaceSettings.siteId,
  });

  return {
    ok: true,
    message: `eBay listing ended (${itemId}).`,
    listingId: itemId,
  };
}

export function getEbayConsentUrl(userId = "default") {
  const { clientId, ruName } = assertConfigured();
  const state = crypto.randomUUID();
  PENDING_CONNECT_STATES.set(state, {
    createdAt: Date.now(),
    userId: userId || "default",
  });

  const url = new URL(EBAY_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", USER_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "login");

  return url.toString();
}

export async function startEbayManualLogin({ userId } = {}) {
  return {
    ok: true,
    url: getEbayConsentUrl(userId || "default"),
    message: "Open the returned URL to connect eBay API access.",
  };
}

export async function getEbayStatus({ userId } = {}) {
  const config = getEbayConfig();
  const tokenStore = await readTokenStore(userId || "default");
  const missing = [];

  if (!config.clientId) {
    missing.push("EBAY_CLIENT_ID");
  }

  if (!config.clientSecret) {
    missing.push("EBAY_CLIENT_SECRET");
  }

  if (!config.ruName) {
    missing.push("EBAY_RUNAME");
  }

  return {
    ok: true,
    configured: missing.length === 0,
    connected: Boolean(tokenStore?.refreshToken),
    marketplaceId: config.marketplaceId,
    missing,
    callbackPath: "/ebay/oauth/callback",
    accessTokenExpiresAt: tokenStore?.accessTokenExpiresAt || null,
  };
}

export async function handleEbayOAuthCallback({ code, state, error, errorDescription }) {
  if (error) {
    throw new Error(errorDescription || error);
  }

  if (!code) {
    throw new Error("Missing eBay authorization code.");
  }

  if (!state || !PENDING_CONNECT_STATES.has(state)) {
    throw new Error("Invalid or expired eBay OAuth state.");
  }

  const pending = PENDING_CONNECT_STATES.get(state);
  PENDING_CONNECT_STATES.delete(state);

  const { ruName } = assertConfigured();
  const tokenPayload = await requestIdentityToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: ruName,
  });

  await writeTokenStore({
    accessToken: tokenPayload.access_token,
    accessTokenExpiresAt: Date.now() + Number(tokenPayload.expires_in || 7200) * 1000,
    refreshToken: tokenPayload.refresh_token,
    scope: tokenPayload.scope,
    updatedAt: Date.now(),
  }, pending?.userId || "default");

  return {
    ok: true,
    message: "eBay API connection completed. You can close this tab.",
  };
}
