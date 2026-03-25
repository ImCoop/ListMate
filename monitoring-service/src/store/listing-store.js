import { init } from "@instantdb/admin";

let cachedDb = null;

function readInstantConfig() {
  return {
    appId: process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID,
    adminToken: process.env.INSTANT_APP_ADMIN_TOKEN || "",
  };
}

function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  const { appId, adminToken } = readInstantConfig();

  if (!appId || !adminToken) {
    return null;
  }

  cachedDb = init({
    appId,
    adminToken,
  });

  return cachedDb;
}

export function hasListingStoreConfig() {
  const { appId, adminToken } = readInstantConfig();
  return Boolean(appId && adminToken);
}

export async function listListings() {
  const db = getDb();

  if (!db) {
    return [];
  }

  const data = await db.query({ listings: {} });
  const listings = Array.isArray(data?.listings) ? data.listings : [];
  return listings.filter((listing) => listing && typeof listing.id === "string");
}

export async function updateListing(listingId, updates) {
  const db = getDb();

  if (!db) {
    return null;
  }

  await db.transact(db.tx.listings[listingId].update(updates));
  return {
    id: listingId,
    ...updates,
  };
}
