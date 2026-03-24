export type ListingStatus = "draft" | "listed" | "sold";
export type PoshmarkTopCategory = "Women" | "Men" | "Kids" | "Home" | "Pets" | "Electronics";

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
