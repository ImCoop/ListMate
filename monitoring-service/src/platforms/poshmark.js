import { removeViaAutomation } from "./remove-via-automation.js";

export async function removePoshmarkListing({ listingId, url }) {
  return removeViaAutomation({
    platform: "poshmark",
    listingId,
    url,
  });
}
