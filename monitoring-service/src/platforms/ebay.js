import { removeViaAutomation } from "./remove-via-automation.js";

export async function removeEbayListing({ listingId, url, userId }) {
  return removeViaAutomation({
    platform: "ebay",
    userId,
    listingId,
    url,
  });
}
