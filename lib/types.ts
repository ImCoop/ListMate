export type ListingStatus = "draft" | "listed" | "sold";
export type PoshmarkTopCategory = "Women" | "Men" | "Kids" | "Home" | "Pets" | "Electronics";
export type MarketplacePlatform = "poshmark" | "depop" | "ebay";
export type MarketplaceListingState = "active" | "sold" | "remove_pending" | "removed";

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  quantity: number;
  imageUrls: string[];
  brand?: string;
  size?: string;
  category?: string;
  topCategory?: PoshmarkTopCategory;
  condition?: string;
  status: ListingStatus;
  soldOnPlatform?: MarketplacePlatform;
  poshmarkUrl?: string;
  depopUrl?: string;
  ebayUrl?: string;
  poshmarkState?: MarketplaceListingState;
  depopState?: MarketplaceListingState;
  ebayState?: MarketplaceListingState;
  createdByUserId?: string;
  createdByUsername?: string;
  createdAt: number;
}

export interface ListingInput {
  title: string;
  description: string;
  price: number;
  quantity: number;
  imageUrls: string[];
  brand?: string;
  size?: string;
  category?: string;
  topCategory?: PoshmarkTopCategory;
  condition?: string;
}
