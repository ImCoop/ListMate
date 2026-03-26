import { removeViaAutomation } from "./remove-via-automation.js";

export async function removeDepopListing({ listingId, url, userId }) {
  return removeViaAutomation({
    platform: "depop",
    userId,
    listingId,
    url,
  });
}
