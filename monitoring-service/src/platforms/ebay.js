export async function removeEbayListing({ listingId, url }) {
  return {
    ok: false,
    error: `eBay removal not implemented yet (listingId=${listingId}, url=${url})`,
  };
}
