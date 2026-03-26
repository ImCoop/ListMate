import { checkListingAvailability } from "./platforms/availability.js";
import { PLATFORM_STATE_KEY, PLATFORM_URL_KEY, PLATFORMS } from "./platforms/constants.js";
import { buildRemovalJobsFromSaleEvent } from "./reconciler.js";
import { enqueueJobs } from "./store/job-store.js";
import { hasListingStoreConfig, listListings, updateListing } from "./store/listing-store.js";

const saleCandidateCounts = new Map();

function getUrl(listing, platform) {
  const key = PLATFORM_URL_KEY[platform];
  const value = listing?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function getState(listing, platform) {
  const key = PLATFORM_STATE_KEY[platform];
  const value = listing?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function inferSoldPlatform(listing, unavailablePlatforms) {
  if (unavailablePlatforms.length === 1) {
    return unavailablePlatforms[0];
  }

  if (unavailablePlatforms.length > 1) {
    return null;
  }

  const soldOnPlatform = typeof listing.soldOnPlatform === "string" ? listing.soldOnPlatform : "";

  if (soldOnPlatform && unavailablePlatforms.includes(soldOnPlatform)) {
    return soldOnPlatform;
  }

  return null;
}

function buildSaleDetectedUpdate(listing, soldOnPlatform) {
  const updates = {
    status: "sold",
    soldOnPlatform,
    soldAt: Date.now(),
  };

  for (const platform of PLATFORMS) {
    const stateKey = PLATFORM_STATE_KEY[platform];
    const url = getUrl(listing, platform);

    if (!url) {
      continue;
    }

    if (platform === soldOnPlatform) {
      updates[stateKey] = "sold";
      continue;
    }

    updates[stateKey] = "remove_pending";
  }

  return updates;
}

function hasAnyMonitorableUrl(listing) {
  return PLATFORMS.some((platform) => {
    const url = getUrl(listing, platform);
    if (!url) {
      return false;
    }

    const state = getState(listing, platform);
    return state !== "removed";
  });
}

function candidateKey(listingId, platform) {
  return `${listingId}:${platform}`;
}

function clearListingCandidates(listingId) {
  for (const key of saleCandidateCounts.keys()) {
    if (key.startsWith(`${listingId}:`)) {
      saleCandidateCounts.delete(key);
    }
  }
}

async function evaluateListing(listing, config) {
  const checks = [];

  for (const platform of PLATFORMS) {
    const url = getUrl(listing, platform);
    if (!url) {
      continue;
    }

    const state = getState(listing, platform);
    if (state === "removed") {
      continue;
    }

    const result = await checkListingAvailability({
      platform,
      url,
      timeoutMs: config.monitorRequestTimeoutMs,
    });

    checks.push({
      platform,
      url,
      state: state || "active",
      ...result,
    });
  }

  const unavailablePlatforms = checks.filter((check) => check.ok && check.available === false).map((check) => check.platform);
  const soldOnPlatform = inferSoldPlatform(listing, unavailablePlatforms);

  if (!soldOnPlatform) {
    clearListingCandidates(listing.id);
    return {
      soldDetected: false,
      listingId: listing.id,
      checks,
    };
  }

  const confirmationCycles = Number(config.saleConfirmationCycles || 2);
  const key = candidateKey(listing.id, soldOnPlatform);

  clearListingCandidates(listing.id);
  const currentCount = (saleCandidateCounts.get(key) || 0) + 1;
  saleCandidateCounts.set(key, currentCount);

  if (currentCount < confirmationCycles) {
    return {
      soldDetected: false,
      awaitingConfirmation: true,
      confirmationCount: currentCount,
      confirmationRequired: confirmationCycles,
      listingId: listing.id,
      soldOnPlatform,
      checks,
    };
  }

  clearListingCandidates(listing.id);

  const updates = buildSaleDetectedUpdate(listing, soldOnPlatform);
  await updateListing(listing.id, updates);

  const event = {
    listingId: listing.id,
    userId: typeof listing.createdByUserId === "string" ? listing.createdByUserId : "",
    soldOnPlatform,
    poshmarkUrl: getUrl(listing, "poshmark"),
    depopUrl: getUrl(listing, "depop"),
    ebayUrl: getUrl(listing, "ebay"),
  };
  const removalJobs = buildRemovalJobsFromSaleEvent(event, config.maxAttempts);
  const createdJobs = removalJobs.length > 0 ? await enqueueJobs(removalJobs) : [];

  return {
    soldDetected: true,
    listingId: listing.id,
    soldOnPlatform,
    checks,
    removalJobsCreated: createdJobs.length,
  };
}

export async function runMonitoringCycle(config) {
  if (!hasListingStoreConfig()) {
    return {
      ok: false,
      skipped: true,
      reason: "Missing InstantDB configuration (INSTANT_APP_ID and INSTANT_APP_ADMIN_TOKEN).",
    };
  }

  const listings = await listListings();
  const candidates = listings.filter(
    (listing) =>
      listing &&
      typeof listing.id === "string" &&
      listing.status !== "sold" &&
      hasAnyMonitorableUrl(listing),
  );

  let soldDetectedCount = 0;
  let jobCount = 0;
  const listingResults = [];

  for (const listing of candidates) {
    const result = await evaluateListing(listing, config);
    listingResults.push(result);

    if (result.soldDetected) {
      soldDetectedCount += 1;
      jobCount += result.removalJobsCreated || 0;
    }
  }

  return {
    ok: true,
    skipped: false,
    checkedListings: candidates.length,
    soldDetectedCount,
    queuedRemovalJobs: jobCount,
    listingResults,
  };
}
