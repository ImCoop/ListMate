import { removeViaAutomation } from "./remove-via-automation.js";

export async function removePoshmarkListing({ listingId, url, userId }) {
  return removeViaAutomation({
    platform: "poshmark",
    userId,
    listingId,
    url,
  });
}
