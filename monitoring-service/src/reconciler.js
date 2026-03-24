import { completeJob } from "./store/job-store.js";
import { removeDepopListing } from "./platforms/depop.js";
import { removeEbayListing } from "./platforms/ebay.js";
import { removePoshmarkListing } from "./platforms/poshmark.js";

const ADAPTERS = {
  poshmark: removePoshmarkListing,
  depop: removeDepopListing,
  ebay: removeEbayListing,
};

function backoffMs(attempt) {
  const base = 2000;
  return Math.min(5 * 60 * 1000, base * 2 ** Math.max(0, attempt - 1));
}

export function buildRemovalJobsFromSaleEvent(event, maxAttempts) {
  const allPlatforms = ["poshmark", "depop", "ebay"];

  return allPlatforms
    .filter((platform) => platform !== event.soldOnPlatform)
    .map((platform) => {
      const urlField = `${platform}Url`;
      const url = event[urlField];

      if (!url) {
        return null;
      }

      return {
        listingId: event.listingId,
        soldOnPlatform: event.soldOnPlatform,
        targetPlatform: platform,
        url,
        maxAttempts,
      };
    })
    .filter(Boolean);
}

export async function processJob(job) {
  const adapter = ADAPTERS[job.targetPlatform];

  if (!adapter) {
    await completeJob(job.id, {
      status: "failed",
      error: `No adapter registered for ${job.targetPlatform}`,
      attempts: (job.attempts || 0) + 1,
      lastAttemptAt: Date.now(),
    });
    return;
  }

  const attempts = (job.attempts || 0) + 1;
  const now = Date.now();

  try {
    const result = await adapter({
      listingId: job.listingId,
      url: job.url,
    });

    if (result?.ok) {
      await completeJob(job.id, {
        status: "succeeded",
        attempts,
        error: null,
        lastAttemptAt: now,
      });
      return;
    }

    const retryable = attempts < Number(job.maxAttempts || 1);
    await completeJob(job.id, {
      status: retryable ? "queued" : "failed",
      attempts,
      error: result?.error || "Removal failed",
      lastAttemptAt: now,
      nextAttemptAt: retryable ? now + backoffMs(attempts) : null,
    });
  } catch (error) {
    const retryable = attempts < Number(job.maxAttempts || 1);
    await completeJob(job.id, {
      status: retryable ? "queued" : "failed",
      attempts,
      error: error instanceof Error ? error.message : "Removal failed",
      lastAttemptAt: now,
      nextAttemptAt: retryable ? now + backoffMs(attempts) : null,
    });
  }
}
