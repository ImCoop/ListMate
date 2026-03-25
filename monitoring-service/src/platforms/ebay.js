import { removeViaAutomation } from "./remove-via-automation.js";

export async function removeEbayListing({ listingId, url }) {
  return removeViaAutomation({
    platform: "ebay",
    listingId,
    url,
  });
}
