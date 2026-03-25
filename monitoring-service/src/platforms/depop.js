import { removeViaAutomation } from "./remove-via-automation.js";

export async function removeDepopListing({ listingId, url }) {
  return removeViaAutomation({
    platform: "depop",
    listingId,
    url,
  });
}
