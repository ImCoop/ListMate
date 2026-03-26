"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import { getAutomationNetworkErrorMessage, readAutomationBaseUrl } from "@/lib/automation";
import type { SessionUser } from "@/lib/auth-types";
import { createId, db, hasInstantConfig } from "@/lib/instant";
import type {
  Listing,
  ListingInput,
  ListingStatus,
  MarketplaceListingState,
  MarketplacePlatform,
  PoshmarkTopCategory,
} from "@/lib/types";

const MARKETPLACE_TAXONOMY = {
  genders: [
    {
      name: "Men",
      categories: [
        {
          name: "Tops",
          subcategories: [
            { name: "Shirts", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
            { name: "Tank Top", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
            { name: "Polo", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
            { name: "Button-Up Shirt", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
            { name: "Long Sleeve Shirt", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
            { name: "Hoodie", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
            { name: "Sweatshirt", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
          ],
        },
        {
          name: "Bottoms",
          subcategories: [
            { name: "Jeans", sizeType: "waist", sizes: ["28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"] },
            { name: "Pants", sizeType: "mixed", sizes: ["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "40"] },
            { name: "Shorts", sizeType: "mixed", sizes: ["XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38"] },
            { name: "Sweatpants", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
            { name: "Joggers", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
          ],
        },
        {
          name: "Outerwear",
          subcategories: [
            { name: "Jacket", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
            { name: "Coat", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
            { name: "Vest", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
          ],
        },
        {
          name: "Shoes",
          subcategories: [
            { name: "Sneakers", sizeType: "numeric", sizes: ["6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] },
            { name: "Boots", sizeType: "numeric", sizes: ["7", "8", "9", "10", "11", "12", "13", "14", "15"] },
            { name: "Sandals", sizeType: "numeric", sizes: ["7", "8", "9", "10", "11", "12", "13"] },
          ],
        },
        {
          name: "Accessories",
          subcategories: [
            { name: "Hats", sizeType: "one", sizes: ["One Size"] },
            { name: "Belts", sizeType: "waist", sizes: ["28", "30", "32", "34", "36", "38", "40", "42", "44"] },
            { name: "Bags", sizeType: "one", sizes: ["One Size"] },
          ],
        },
      ],
    },
    {
      name: "Women",
      categories: [
        {
          name: "Tops",
          subcategories: [
            { name: "Shirts", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
            { name: "Blouse", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
            { name: "Tank Top", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL"] },
            { name: "Crop Top", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL"] },
            { name: "Sweater", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
            { name: "Hoodie", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
          ],
        },
        {
          name: "Bottoms",
          subcategories: [
            { name: "Jeans", sizeType: "numeric", sizes: ["00", "0", "2", "4", "6", "8", "10", "12", "14", "16"] },
            { name: "Pants", sizeType: "mixed", sizes: ["XXS", "XS", "S", "M", "L", "XL", "0", "2", "4", "6", "8", "10", "12", "14"] },
            { name: "Shorts", sizeType: "mixed", sizes: ["XXS", "XS", "S", "M", "L", "XL", "0", "2", "4", "6", "8", "10", "12"] },
            { name: "Leggings", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL"] },
            { name: "Skirts", sizeType: "mixed", sizes: ["XXS", "XS", "S", "M", "L", "XL", "0", "2", "4", "6", "8", "10", "12"] },
          ],
        },
        {
          name: "Dresses",
          subcategories: [
            { name: "Casual Dress", sizeType: "mixed", sizes: ["XXS", "XS", "S", "M", "L", "XL", "0", "2", "4", "6", "8", "10", "12", "14"] },
            { name: "Formal Dress", sizeType: "mixed", sizes: ["XXS", "XS", "S", "M", "L", "XL", "0", "2", "4", "6", "8", "10", "12", "14", "16"] },
          ],
        },
        {
          name: "Outerwear",
          subcategories: [
            { name: "Jacket", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
            { name: "Coat", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
            { name: "Blazer", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL"] },
          ],
        },
        {
          name: "Shoes",
          subcategories: [
            { name: "Heels", sizeType: "numeric", sizes: ["5", "6", "7", "8", "9", "10", "11", "12"] },
            { name: "Sneakers", sizeType: "numeric", sizes: ["5", "6", "7", "8", "9", "10", "11", "12"] },
            { name: "Boots", sizeType: "numeric", sizes: ["5", "6", "7", "8", "9", "10", "11", "12"] },
            { name: "Sandals", sizeType: "numeric", sizes: ["5", "6", "7", "8", "9", "10", "11", "12"] },
          ],
        },
        {
          name: "Accessories",
          subcategories: [
            { name: "Jewelry", sizeType: "one", sizes: ["One Size"] },
            { name: "Bags", sizeType: "one", sizes: ["One Size"] },
            { name: "Belts", sizeType: "mixed", sizes: ["XS", "S", "M", "L", "XL", "24", "26", "28", "30", "32", "34", "36"] },
          ],
        },
      ],
    },
  ],
} as const;

const CONDITION_OPTIONS = [
  {
    value: "NEW_WITH_TAGS",
    label: "New with tags",
    description: "Brand new, never worn, with original tags attached",
    platformMap: { poshmark: "New with tags", depop: "New" },
  },
  {
    value: "NEW_WITHOUT_TAGS",
    label: "New without tags",
    description: "Never worn, but tags are missing",
    platformMap: { poshmark: "New without tags", depop: "Like new" },
  },
  {
    value: "LIKE_NEW",
    label: "Like new",
    description: "Worn once or twice, no visible flaws",
    platformMap: { poshmark: "Like new", depop: "Like new" },
  },
  {
    value: "GOOD",
    label: "Good",
    description: "Light wear, minor flaws possible",
    platformMap: { poshmark: "Good", depop: "Good" },
  },
  {
    value: "FAIR",
    label: "Fair",
    description: "Noticeable wear or flaws, still wearable",
    platformMap: { poshmark: "Fair", depop: "Fair" },
  },
] as const;

type GenderName = (typeof MARKETPLACE_TAXONOMY.genders)[number]["name"];
type ConditionOption = (typeof CONDITION_OPTIONS)[number];
type ConditionValue = ConditionOption["value"];
const PLATFORM_LABEL: Record<MarketplacePlatform, string> = {
  poshmark: "Poshmark",
  depop: "Depop",
  ebay: "eBay",
};
const PLATFORM_URL_KEY: Record<MarketplacePlatform, "poshmarkUrl" | "depopUrl" | "ebayUrl"> = {
  poshmark: "poshmarkUrl",
  depop: "depopUrl",
  ebay: "ebayUrl",
};
const PLATFORM_STATE_KEY: Record<MarketplacePlatform, "poshmarkState" | "depopState" | "ebayState"> = {
  poshmark: "poshmarkState",
  depop: "depopState",
  ebay: "ebayState",
};

const POPULAR_CATEGORY_OVERRIDE: Record<
  GenderName,
  { name: string; subcategories: { name: string; sizeType: "alpha" | "mixed" | "numeric" | "waist" | "one"; sizes: string[] }[] }[]
> = {
  Men: [
    {
      name: "Tops",
      subcategories: [
        { name: "Shirts", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
        { name: "Jackets & Coats", sizeType: "alpha", sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
      ],
    },
    {
      name: "Bottoms",
      subcategories: [
        { name: "Jeans", sizeType: "waist", sizes: ["28", "29", "30", "31", "32", "33", "34", "36", "38", "40", "42", "44"] },
        { name: "Pants", sizeType: "mixed", sizes: ["S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "40"] },
        { name: "Shorts", sizeType: "mixed", sizes: ["S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38"] },
      ],
    },
    {
      name: "Shoes",
      subcategories: [{ name: "Shoes", sizeType: "numeric", sizes: ["7", "8", "9", "10", "11", "12", "13", "14"] }],
    },
    {
      name: "Accessories",
      subcategories: [
        { name: "Accessories", sizeType: "one", sizes: ["One Size"] },
        { name: "Bags", sizeType: "one", sizes: ["One Size"] },
      ],
    },
  ],
  Women: [
    {
      name: "Tops",
      subcategories: [
        { name: "Shirts", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
        { name: "Intimates & Sleepwear", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] },
      ],
    },
    {
      name: "Bottoms",
      subcategories: [{ name: "Jeans", sizeType: "numeric", sizes: ["00", "0", "2", "4", "6", "8", "10", "12", "14", "16"] }],
    },
    {
      name: "Dresses",
      subcategories: [{ name: "Dresses", sizeType: "mixed", sizes: ["XXS", "XS", "S", "M", "L", "XL", "0", "2", "4", "6", "8", "10", "12", "14"] }],
    },
    {
      name: "Outerwear",
      subcategories: [{ name: "Jackets & Coats", sizeType: "alpha", sizes: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] }],
    },
    {
      name: "Shoes",
      subcategories: [{ name: "Shoes", sizeType: "numeric", sizes: ["5", "6", "7", "8", "9", "10", "11", "12"] }],
    },
    {
      name: "Accessories",
      subcategories: [
        { name: "Accessories", sizeType: "one", sizes: ["One Size"] },
        { name: "Bags", sizeType: "one", sizes: ["One Size"] },
        { name: "Jewelry", sizeType: "one", sizes: ["One Size"] },
        { name: "Makeup", sizeType: "one", sizes: ["One Size"] },
      ],
    },
  ],
};

function getGenderRecord(gender: GenderName) {
  return MARKETPLACE_TAXONOMY.genders.find((entry) => entry.name === gender) || MARKETPLACE_TAXONOMY.genders[0];
}

function getCategoryRecords(gender: GenderName) {
  const override = POPULAR_CATEGORY_OVERRIDE[gender];
  return override?.length ? override : getGenderRecord(gender).categories;
}

function getSubcategoryRecords(gender: GenderName, categoryGroup: string) {
  const category = getCategoryRecords(gender).find((entry) => entry.name === categoryGroup);
  return category?.subcategories || getCategoryRecords(gender)[0]?.subcategories || [];
}

function getCategoryOptions(gender: GenderName) {
  return getCategoryRecords(gender).map((entry) => entry.name);
}

function getSubcategoryOptions(gender: GenderName, categoryGroup: string) {
  return getSubcategoryRecords(gender, categoryGroup).map((entry) => entry.name);
}

function getSizeOptions(gender: GenderName, categoryGroup: string, subcategory: string) {
  const subcategoryRecord = getSubcategoryRecords(gender, categoryGroup).find((entry) => entry.name === subcategory);
  const baseSizes = subcategoryRecord?.sizes || getSubcategoryRecords(gender, categoryGroup)[0]?.sizes || [];

  if (gender === "Men" && categoryGroup === "Bottoms") {
    const alphaSizes = ["S", "M", "L", "XL", "XXL"];
    const waistSizes = baseSizes.filter((size) => /^\d+$/.test(size)).map((size) => `Waist ${size}`);
    const unique = [...new Set([...alphaSizes, ...waistSizes])];
    return unique;
  }

  return baseSizes;
}

function getConditionRecord(value?: string | null) {
  return CONDITION_OPTIONS.find((entry) => entry.value === value) || null;
}

function getConditionLabel(value?: string | null) {
  return getConditionRecord(value)?.label || value || "";
}

function mapConditionForPlatform(value: string | undefined, platform: MarketplacePlatform) {
  const condition = getConditionRecord(value);

  if (!condition) {
    return value;
  }

  if (platform === "poshmark" || platform === "depop") {
    return condition.platformMap[platform];
  }

  return condition.label;
}

function mapSizeForPlatform(size: string | undefined, platform: MarketplacePlatform) {
  if (!size) {
    return size;
  }

  if (platform === "poshmark") {
    return size;
  }

  return size.replace(/^Waist\s+/i, "");
}

function mapCategoryForPlatform(category: string | undefined, platform: MarketplacePlatform) {
  if (!category) {
    return category;
  }

  const normalized = category.trim();

  if (platform === "depop") {
    const depopMap: Record<string, string> = {
      "Jackets & Coats": "Jackets",
      Pants: "Trousers",
      Shoes: "Trainers",
      "Intimates & Sleepwear": "Pyjamas",
      Jewelry: "Jewellery",
      Makeup: "Other",
      Accessories: "Other",
    };

    return depopMap[normalized] || normalized;
  }

  return normalized;
}

function normalizeUrl(value: string) {
  return value.trim();
}

function isPoshmarkListingUrl(value: string) {
  return /https?:\/\/(www\.)?poshmark\.com\/listing\//i.test(value);
}

function isDepopProductUrl(value: string) {
  return /https?:\/\/(www\.)?depop\.com\/products\//i.test(value);
}

function isEbayItemUrl(value: string) {
  return /https?:\/\/(www\.)?ebay\.[a-z.]+\/(itm\/|.*[?&]item=\d+)/i.test(value);
}

const DEFAULT_GENDER: GenderName = "Women";
const DEFAULT_CATEGORY_GROUP = getCategoryOptions(DEFAULT_GENDER)[0] || "Tops";
const DEFAULT_SUBCATEGORY = getSubcategoryOptions(DEFAULT_GENDER, DEFAULT_CATEGORY_GROUP)[0] || "Shirts";
const DEFAULT_SIZE = getSizeOptions(DEFAULT_GENDER, DEFAULT_CATEGORY_GROUP, DEFAULT_SUBCATEGORY)[0] || "M";

type FormState = {
  title: string;
  description: string;
  price: string;
  quantity: string;
  imageUrls: string[];
  brand: string;
  size: string;
  categoryGroup: string;
  category: string;
  topCategory: PoshmarkTopCategory;
  condition: ConditionValue;
};

const emptyForm: FormState = {
  title: "",
  description: "",
  price: "",
  quantity: "1",
  imageUrls: [],
  brand: "",
  size: DEFAULT_SIZE,
  categoryGroup: DEFAULT_CATEGORY_GROUP,
  category: DEFAULT_SUBCATEGORY,
  topCategory: DEFAULT_GENDER as PoshmarkTopCategory,
  condition: "GOOD",
};

type CreateListingRequest =
  | {
      mode: "new";
      input: ListingInput;
    }
  | {
      mode: "existing-links";
      title?: string;
      poshmarkUrl?: string;
      depopUrl?: string;
      ebayUrl?: string;
    };

function validateListingInput(input: ListingInput, form: FormState) {
  if (!input.title || input.title.length > 80) {
    return "Title is required and must be 80 characters or fewer.";
  }

  if (!input.description || input.description.length < 10 || input.description.length > 1000) {
    return "Description must be between 10 and 1000 characters.";
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    return "Price must be greater than 0.";
  }

  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return "Quantity must be a whole number of at least 1.";
  }

  if (!input.imageUrls.length) {
    return "Add at least one photo so Depop and Poshmark can post reliably.";
  }

  const gender = form.topCategory as GenderName;
  const categoryOptions = getCategoryOptions(gender);

  if (!categoryOptions.some((option) => option === form.categoryGroup)) {
    return "Select a valid category group.";
  }

  const subcategoryOptions = getSubcategoryOptions(gender, form.categoryGroup);

  if (!subcategoryOptions.some((option) => option === form.category)) {
    return "Select a valid subcategory.";
  }

  if (!input.category || input.category.length > 60) {
    return "Select a valid subcategory.";
  }

  const allowedSizes = getSizeOptions(gender, form.categoryGroup, form.category);

  if (!input.size || !allowedSizes.some((size) => size === input.size)) {
    return "Select a valid size for the chosen subcategory.";
  }

  if (!getConditionRecord(form.condition)) {
    return "Select a valid condition option.";
  }

  return null;
}

function sortListings(listings: Listing[]) {
  return [...listings].sort((a, b) => b.createdAt - a.createdAt);
}

function getListingImageUrls(listing: Partial<Listing>) {
  return Array.isArray(listing.imageUrls) ? listing.imageUrls : [];
}

function belongsToSessionUser(listing: Partial<Listing>, sessionUser: SessionUser) {
  if (typeof listing.createdByUserId === "string" && listing.createdByUserId) {
    return listing.createdByUserId === sessionUser.id;
  }

  if (typeof listing.createdByUsername === "string" && listing.createdByUsername) {
    return listing.createdByUsername === sessionUser.username;
  }

  return false;
}

function statusTone(status: ListingStatus) {
  if (status === "sold") {
    return "bg-rose/15 text-rose";
  }

  if (status === "listed") {
    return "bg-pine/15 text-pine";
  }

  return "bg-clay/15 text-clay";
}

function marketplaceStateTone(state: MarketplaceListingState | undefined) {
  if (state === "failed") {
    return "bg-rose/15 text-rose";
  }

  if (state === "sold") {
    return "bg-rose/15 text-rose";
  }

  if (state === "remove_pending") {
    return "bg-amber-100 text-amber-700";
  }

  if (state === "removed") {
    return "bg-slate-200 text-slate-600";
  }

  return "bg-pine/15 text-pine";
}

function formatMarketplaceState(state: MarketplaceListingState) {
  if (state === "remove_pending") {
    return "Remove Pending";
  }

  return state.charAt(0).toUpperCase() + state.slice(1);
}

function SetupEmptyState() {
  return (
    <div className="rounded-[2rem] border border-clay/15 bg-white/85 p-6 shadow-card backdrop-blur">
      <p className="text-sm font-medium uppercase tracking-[0.28em] text-clay">InstantDB setup</p>
      <h2 className="mt-3 text-2xl font-semibold text-ink">Add your app ID to turn on live storage.</h2>
      <p className="mt-3 text-sm leading-6 text-ink/70">
        Create an Instant app, then set <span className="font-mono">NEXT_PUBLIC_INSTANT_APP_ID</span> in{" "}
        <span className="font-mono">.env.local</span>. The UI is ready, but save/query actions stay disabled until
        that variable exists.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="h-36 animate-pulse rounded-[1.75rem] bg-white/70 shadow-card" />
      ))}
    </div>
  );
}

function EmptyListings() {
  return (
    <div className="rounded-[2rem] border border-dashed border-clay/30 bg-white/70 p-8 text-center shadow-card">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-clay">No listings yet</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink">Create one listing and reuse it everywhere.</h2>
      <p className="mt-3 text-sm leading-6 text-ink/70">
        Keep titles, pricing, and photos in one place, then copy platform-ready versions in a tap.
      </p>
    </div>
  );
}

function NoVisibleListings() {
  return (
    <div className="rounded-[2rem] border border-dashed border-clay/30 bg-white/70 p-8 text-center shadow-card">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-clay">No active listings</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink">Sold items are hidden right now.</h2>
      <p className="mt-3 text-sm leading-6 text-ink/70">
        Turn on <span className="font-semibold">Show Sold Listings</span> at the bottom to view everything.
      </p>
    </div>
  );
}

function NoSearchMatches({ query }: { query: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-clay/30 bg-white/70 p-8 text-center shadow-card">
      <p className="text-sm font-medium uppercase tracking-[0.25em] text-clay">No matching listings</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink">No results for &quot;{query}&quot;.</h2>
      <p className="mt-3 text-sm leading-6 text-ink/70">Try a different title search or clear the search field.</p>
    </div>
  );
}

async function fileToDataUrl(file: File) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Image load failed"));
      nextImage.src = imageUrl;
    });

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas not supported");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function NewListingSheet({
  isOpen,
  isSaving,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (request: CreateListingRequest) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const enableAiDescriptionUi = false;
  const gender = form.topCategory as GenderName;
  const categoryOptions = getCategoryOptions(gender);
  const subcategoryOptions = getSubcategoryOptions(gender, form.categoryGroup);
  const sizeOptions = getSizeOptions(gender, form.categoryGroup, form.category);

  useEffect(() => {
    if (!isOpen) {
      setForm(emptyForm);
      setIsProcessingImages(false);
      setIsGeneratingDescription(false);
      setFormError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    setForm((current) => {
      const nextCategoryOptions = getCategoryOptions(current.topCategory as GenderName);
      const nextCategoryGroup = nextCategoryOptions.some((option) => option === current.categoryGroup)
        ? current.categoryGroup
        : nextCategoryOptions[0] || "";
      const nextSubcategoryOptions = getSubcategoryOptions(current.topCategory as GenderName, nextCategoryGroup);
      const nextCategory = nextSubcategoryOptions.some((option) => option === current.category)
        ? current.category
        : nextSubcategoryOptions[0] || "";
      const nextSizeOptions = getSizeOptions(current.topCategory as GenderName, nextCategoryGroup, nextCategory);
      const nextSize = nextSizeOptions.some((size) => size === current.size)
        ? current.size
        : nextSizeOptions[0] || "";

      if (
        nextCategoryGroup === current.categoryGroup &&
        nextCategory === current.category &&
        nextSize === current.size
      ) {
        return current;
      }

      return {
        ...current,
        categoryGroup: nextCategoryGroup,
        category: nextCategory,
        size: nextSize,
      };
    });
  }, [form.topCategory]);

  async function handleSelectedFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    setIsProcessingImages(true);

    try {
      const nextImages = await Promise.all(files.map((file) => fileToDataUrl(file)));

      setForm((current) => ({
        ...current,
        imageUrls: [...current.imageUrls, ...nextImages].slice(0, 6),
      }));
    } finally {
      setIsProcessingImages(false);
    }
  }

  async function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    await handleSelectedFiles(files);
    event.target.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: ListingInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      quantity: Number(form.quantity),
      imageUrls: form.imageUrls,
      brand: form.brand.trim() || undefined,
      size: form.size.trim() || undefined,
      category: form.category.trim() || undefined,
      topCategory: form.topCategory,
      condition: form.condition || undefined,
    };

    const validationError = validateListingInput(input, form);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    await onSubmit({
      mode: "new",
      input,
    });
  }

  async function generateDescriptionFromPhotos() {
    if (!form.imageUrls.length) {
      return;
    }

    setFormError(null);
    setIsGeneratingDescription(true);

    try {
      const response = await fetch("/api/ai/description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrls: form.imageUrls,
          title: form.title,
          brand: form.brand,
          category: form.category,
          size: form.size,
          condition: getConditionLabel(form.condition),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; description?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || `Description generation failed with ${response.status}`);
      }

      const description = payload?.description?.trim();

      if (!description) {
        throw new Error("AI returned an empty description.");
      }

      setForm((current) => ({
        ...current,
        description,
      }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not generate description.");
    } finally {
      setIsGeneratingDescription(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm">
      <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[2rem] bg-[#fffaf3] px-4 pb-8 pt-4">
        <div className="mx-auto h-1.5 w-16 rounded-full bg-ink/15" />
        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-clay">New listing</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Build once. Post anywhere.</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-ink/10 px-3 py-2 text-sm font-medium text-ink"
          >
            Close
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <Field label="Title">
            <input
              required
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              placeholder="Vintage Carhartt chore coat"
            />
          </Field>

          <Field label="Description">
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              placeholder="Clean condition, no major flaws, heavyweight canvas..."
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price">
              <input
                required
                min="0"
                step="0.01"
                type="number"
                inputMode="decimal"
                value={form.price}
                onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
                placeholder="48"
              />
            </Field>

            <Field label="Quantity">
              <input
                required
                min="1"
                step="1"
                type="number"
                inputMode="numeric"
                value={form.quantity}
                onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              />
            </Field>
          </div>

          <Field label="Photos">
            <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-white p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center rounded-[1.2rem] bg-sand px-4 py-4 text-center text-sm font-semibold text-ink transition hover:bg-sand/80">
                  <input
                    multiple
                    accept="image/*"
                    type="file"
                    onChange={handleImageSelection}
                    className="sr-only"
                  />
                  Upload Existing
                </label>
                <label className="flex cursor-pointer items-center justify-center rounded-[1.2rem] bg-ink px-4 py-4 text-center text-sm font-semibold text-white transition hover:bg-ink/90">
                  <input
                    multiple
                    accept="image/*"
                    capture="environment"
                    type="file"
                    onChange={handleImageSelection}
                    className="sr-only"
                  />
                  Take Photos
                </label>
              </div>

              <p className="mt-3 text-xs leading-5 text-ink/55">
                Up to 6 images total. You can choose multiple existing files or capture new photos. Photos are resized
                before save for faster mobile use.
              </p>
              {isProcessingImages ? <p className="mt-2 text-xs font-semibold text-ink/70">Processing photos...</p> : null}

              {form.imageUrls.length > 0 ? (
                <div className="scrollbar-none mt-4 flex gap-3 overflow-x-auto pb-1">
                  {form.imageUrls.map((imageUrl, index) => (
                    <div key={`${imageUrl.slice(0, 24)}-${index}`} className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt={`Selected photo ${index + 1}`}
                        className="h-24 w-24 rounded-[1.1rem] object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            imageUrls: current.imageUrls.filter((_, imageIndex) => imageIndex !== index),
                          }))
                        }
                        className="absolute right-1 top-1 rounded-full bg-ink px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {enableAiDescriptionUi ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={generateDescriptionFromPhotos}
                    disabled={form.imageUrls.length === 0 || isProcessingImages || isGeneratingDescription || isSaving}
                    className="w-full rounded-[1.2rem] border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-sand disabled:cursor-not-allowed disabled:text-ink/40"
                  >
                    {isGeneratingDescription ? "Generating description..." : "Use AI to Generate Description"}
                  </button>
                  {form.imageUrls.length === 0 ? (
                    <p className="mt-2 text-xs text-ink/55">Add photos to enable AI description generation.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Gender">
              <select
                value={form.topCategory}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    topCategory: event.target.value as GenderName as PoshmarkTopCategory,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              >
                {MARKETPLACE_TAXONOMY.genders.map((genderOption) => (
                  <option key={genderOption.name} value={genderOption.name}>
                    {genderOption.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Category">
              <select
                value={form.categoryGroup}
                onChange={(event) =>
                  setForm((current) => {
                    const nextCategoryGroup = event.target.value;
                    const nextSubcategory = getSubcategoryOptions(
                      current.topCategory as GenderName,
                      nextCategoryGroup,
                    )[0] || "";
                    const nextSize = getSizeOptions(
                      current.topCategory as GenderName,
                      nextCategoryGroup,
                      nextSubcategory,
                    )[0] || "";

                    return {
                      ...current,
                      categoryGroup: nextCategoryGroup,
                      category: nextSubcategory,
                      size: nextSize,
                    };
                  })
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              >
                {categoryOptions.map((categoryOption) => (
                  <option key={categoryOption} value={categoryOption}>
                    {categoryOption}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Subcategory">
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((current) => {
                    const nextSubcategory = event.target.value;
                    const nextSize = getSizeOptions(
                      current.topCategory as GenderName,
                      current.categoryGroup,
                      nextSubcategory,
                    )[0] || "";

                    return {
                      ...current,
                      category: nextSubcategory,
                      size: nextSize,
                    };
                  })
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              >
                {subcategoryOptions.map((subcategoryOption) => (
                  <option key={subcategoryOption} value={subcategoryOption}>
                    {subcategoryOption}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Brand">
              <input
                value={form.brand}
                onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
                placeholder="Carhartt"
              />
            </Field>

            <Field label="Size">
              <select
                value={form.size}
                onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              >
                {sizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Condition">
              <select
                value={form.condition}
                onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value as ConditionValue }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              >
                {CONDITION_OPTIONS.map((condition) => (
                  <option key={condition.value} value={condition.value}>
                    {condition.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-ink/60">
                {getConditionRecord(form.condition)?.description}
              </p>
            </Field>
          </div>

          {formError ? <p className="text-sm text-rose">{formError}</p> : null}

          <button
            type="submit"
            disabled={isSaving || isProcessingImages || isGeneratingDescription}
            className="w-full rounded-[1.4rem] bg-ink px-5 py-4 text-base font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {isSaving
              ? "Saving..."
              : isProcessingImages
                ? "Preparing photos..."
                : isGeneratingDescription
                  ? "Generating description..."
                  : "Save listing"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ExistingLinksSheet({
  isOpen,
  isSaving,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (request: CreateListingRequest) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [poshmarkUrl, setPoshmarkUrl] = useState("");
  const [depopUrl, setDepopUrl] = useState("");
  const [ebayUrl, setEbayUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setPoshmarkUrl("");
      setDepopUrl("");
      setEbayUrl("");
      setError(null);
    }
  }, [isOpen]);

  async function handleSave() {
    const nextPoshmarkUrl = normalizeUrl(poshmarkUrl);
    const nextDepopUrl = normalizeUrl(depopUrl);
    const nextEbayUrl = normalizeUrl(ebayUrl);

    if (!nextPoshmarkUrl && !nextDepopUrl && !nextEbayUrl) {
      setError("Add at least one marketplace URL.");
      return;
    }

    if (nextPoshmarkUrl && !isPoshmarkListingUrl(nextPoshmarkUrl)) {
      setError("Poshmark URL must be a listing link (https://poshmark.com/listing/...).");
      return;
    }

    if (nextDepopUrl && !isDepopProductUrl(nextDepopUrl)) {
      setError("Depop URL must be a product link (https://www.depop.com/products/...).");
      return;
    }

    if (nextEbayUrl && !isEbayItemUrl(nextEbayUrl)) {
      setError("eBay URL must be an item link.");
      return;
    }

    setError(null);
    await onSubmit({
      mode: "existing-links",
      title: title.trim() || undefined,
      poshmarkUrl: nextPoshmarkUrl || undefined,
      depopUrl: nextDepopUrl || undefined,
      ebayUrl: nextEbayUrl || undefined,
    });
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-sm">
      <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[2rem] bg-[#fffaf3] px-4 pb-8 pt-4">
        <div className="mx-auto h-1.5 w-16 rounded-full bg-ink/15" />
        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-clay">Existing Listings</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Monitor posted links.</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-ink/10 px-3 py-2 text-sm font-medium text-ink"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Optional Label">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              placeholder="Vintage jacket bundle"
            />
          </Field>

          <Field label="Poshmark Listing URL">
            <input
              value={poshmarkUrl}
              onChange={(event) => setPoshmarkUrl(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
              placeholder="https://poshmark.com/listing/..."
            />
          </Field>

          <Field label="Depop Product URL">
            <input
              value={depopUrl}
              onChange={(event) => setDepopUrl(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
              placeholder="https://www.depop.com/products/..."
            />
          </Field>

          <Field label="eBay Item URL">
            <input
              value={ebayUrl}
              onChange={(event) => setEbayUrl(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-sm text-ink outline-none transition focus:border-clay"
              placeholder="https://www.ebay.com/itm/..."
            />
          </Field>

          {error ? <p className="text-sm text-rose">{error}</p> : null}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full rounded-[1.4rem] bg-ink px-5 py-4 text-base font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {isSaving ? "Saving..." : "Save Existing Links"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-ink/75">{label}</span>
      {children}
    </label>
  );
}

function StatusControl({
  currentStatus,
  onChange,
}: {
  currentStatus: ListingStatus;
  onChange: (status: ListingStatus) => void;
}) {
  const statuses: ListingStatus[] = ["draft", "listed", "sold"];

  return (
    <div className="flex gap-1 rounded-full bg-[#f3e6cf] p-1">
      {statuses.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className={clsx(
            "rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition",
            currentStatus === status ? "bg-white text-ink shadow-sm" : "text-ink/45",
          )}
        >
          {status}
        </button>
      ))}
    </div>
  );
}

type AutomationPlatform = MarketplacePlatform;

function ListingCard({
  listing,
  sendingPlatform,
  onUpdateStatus,
  onDelete,
  onRetryPlatform,
  isDeleting,
}: {
  listing: Listing;
  sendingPlatform: AutomationPlatform | null;
  onUpdateStatus: (listingId: string, status: ListingStatus) => Promise<void>;
  onDelete: (listingId: string) => Promise<void>;
  onRetryPlatform: (listing: Listing, platform: AutomationPlatform) => Promise<void>;
  isDeleting: boolean;
}) {
  const listingIdLabel = listing.id.slice(0, 8).toUpperCase();
  const listingImageUrls = getListingImageUrls(listing);
  const listingTitle = typeof listing.title === "string" && listing.title.trim() ? listing.title : "Untitled listing";
  const listingDescription = typeof listing.description === "string" ? listing.description : "";
  const listingPrice = typeof listing.price === "number" && Number.isFinite(listing.price) ? listing.price : 0;
  const listingQuantity = Number.isInteger(listing.quantity) && listing.quantity > 0 ? listing.quantity : 1;
  const listingStatus: ListingStatus =
    listing.status === "sold" || listing.status === "listed" || listing.status === "draft" ? listing.status : "draft";

  return (
    <article className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur">
      {listingImageUrls[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listingImageUrls[0]}
          alt={listingTitle}
          className="mb-4 h-48 w-full rounded-[1.5rem] object-cover"
        />
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-clay">
            {listing.topCategory || listing.category || "Listing"}
          </p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-ink/45">ID {listingIdLabel}</p>
          <h2 className="mt-2 text-xl font-semibold leading-tight text-ink">{listingTitle}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white">
              ${listingPrice.toFixed(2)}
            </span>
            <span className={clsx("rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em]", statusTone(listingStatus))}>
              {listingStatus}
            </span>
          </div>
        </div>

        <div className="text-right font-mono text-xs uppercase tracking-[0.16em] text-ink/45">
          Qty {listingQuantity}
        </div>
      </div>

      {(listing.brand || listing.size || listing.condition || listing.category || listingImageUrls.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-ink/60">
          {listing.brand ? <span className="rounded-full bg-sand px-3 py-1.5">{listing.brand}</span> : null}
          {listing.size ? <span className="rounded-full bg-sand px-3 py-1.5">Size {listing.size}</span> : null}
          {listing.condition ? <span className="rounded-full bg-sand px-3 py-1.5">{getConditionLabel(listing.condition)}</span> : null}
          {listing.category ? <span className="rounded-full bg-sand px-3 py-1.5">{listing.category}</span> : null}
          {listingImageUrls.length > 0 ? (
            <span className="rounded-full bg-sand px-3 py-1.5">{listingImageUrls.length} images</span>
          ) : null}
        </div>
      )}

      {(listing.poshmarkUrl ||
        listing.depopUrl ||
        listing.ebayUrl ||
        listing.poshmarkState ||
        listing.depopState ||
        listing.ebayState) && (
        <div className="mt-4 rounded-[1rem] border border-ink/10 bg-sand/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">Marketplace Links</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["poshmark", "depop", "ebay"] as const).map((platform) => {
              const url = listing[PLATFORM_URL_KEY[platform]];
              const state = listing[PLATFORM_STATE_KEY[platform]];

              if (state === "failed") {
                return (
                  <button
                    key={`${listing.id}-${platform}-retry`}
                    type="button"
                    onClick={() => void onRetryPlatform(listing, platform)}
                    disabled={Boolean(sendingPlatform)}
                    className="rounded-full border border-rose/30 bg-rose/10 px-3 py-1.5 text-xs font-semibold text-rose disabled:cursor-not-allowed disabled:text-rose/40"
                  >
                    Retry {PLATFORM_LABEL[platform]}
                  </button>
                );
              }

              if (!url) {
                return null;
              }

              return (
                <a
                  key={`${listing.id}-${platform}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  {PLATFORM_LABEL[platform]}
                </a>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["poshmark", "depop", "ebay"] as const).map((platform) => {
              const state = listing[PLATFORM_STATE_KEY[platform]];

              if (!state) {
                return null;
              }

              return (
                <span
                  key={`${listing.id}-${platform}-state`}
                  className={clsx(
                    "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    marketplaceStateTone(state),
                  )}
                >
                  {PLATFORM_LABEL[platform]}: {formatMarketplaceState(state)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-ink/70">{listingDescription}</p>

      <div className="mt-5">
        <StatusControl currentStatus={listingStatus} onChange={(status) => onUpdateStatus(listing.id, status)} />
      </div>

      {sendingPlatform ? (
        <div className="mt-5 rounded-[1.2rem] border border-ink/10 bg-sand px-4 py-3 text-sm font-semibold text-ink">
          Sending to {sendingPlatform === "ebay" ? "eBay" : sendingPlatform === "depop" ? "Depop" : "Poshmark"}...
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onUpdateStatus(listing.id, "sold")}
        className="mt-3 w-full rounded-[1.2rem] border border-rose/30 bg-rose/10 px-4 py-4 text-sm font-semibold text-rose"
      >
        Mark as Sold
      </button>

      <button
        type="button"
        disabled={isDeleting}
        onClick={() => onDelete(listing.id)}
        className="mt-3 w-full rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:text-ink/40"
      >
        {isDeleting ? "Deleting..." : "Delete Listing"}
      </button>
    </article>
  );
}

function ConnectedDashboard({ sessionUser }: { sessionUser: SessionUser }) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isExistingLinksSheetOpen, setIsExistingLinksSheetOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sendingMap, setSendingMap] = useState<Record<string, AutomationPlatform | null>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [automationBaseUrl, setAutomationBaseUrl] = useState(readAutomationBaseUrl);
  const [showSoldListings, setShowSoldListings] = useState(false);
  const [listingSearch, setListingSearch] = useState("");

  const { isLoading, error, data } = db!.useQuery({ listings: {} });
  const listings = sortListings(
    ((data?.listings as Listing[] | undefined) ?? []).filter((listing) => belongsToSessionUser(listing, sessionUser)),
  );
  const normalizedSearch = listingSearch.trim().toLowerCase();
  const visibleListings = listings
    .filter((listing) => showSoldListings || listing.status !== "sold")
    .filter((listing) => {
      if (!normalizedSearch) {
        return true;
      }

      const title = typeof listing.title === "string" ? listing.title.trim().toLowerCase() : "";
      return title.includes(normalizedSearch);
    });

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setAutomationBaseUrl(readAutomationBaseUrl());
  }, []);

  async function handleCreateListing(request: CreateListingRequest) {
    setIsSaving(true);

    try {
      const listingId = createId();
      const createdAt = Date.now();
      const listing: Listing =
        request.mode === "new"
          ? {
              id: listingId,
              ...request.input,
              status: "draft",
              createdByUserId: sessionUser.id,
              createdByUsername: sessionUser.username,
              createdAt,
            }
          : {
              id: listingId,
              title: request.title || "Imported listing",
              description: "Imported existing marketplace listing for monitoring/removal.",
              price: 0,
              quantity: 1,
              imageUrls: [],
              status: "listed",
              poshmarkUrl: request.poshmarkUrl,
              depopUrl: request.depopUrl,
              ebayUrl: request.ebayUrl,
              poshmarkState: request.poshmarkUrl ? "active" : undefined,
              depopState: request.depopUrl ? "active" : undefined,
              ebayState: request.ebayUrl ? "active" : undefined,
              createdByUserId: sessionUser.id,
              createdByUsername: sessionUser.username,
              createdAt,
            };

      await db!.transact(
        db!.tx.listings[listingId].update(listing),
      );
      setIsSheetOpen(false);
      setIsExistingLinksSheetOpen(false);
      if (request.mode === "new") {
        setToast("Listing saved. Sending to Poshmark, Depop, and eBay.");
        void Promise.allSettled([
          sendToAutomation(listing, "poshmark"),
          sendToAutomation(listing, "depop"),
          sendToAutomation(listing, "ebay"),
        ]);
      } else {
        setToast("Existing listing links saved for monitoring.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function sendToAutomation(listing: Listing, platform: AutomationPlatform) {
    const requestKey = `${listing.id}:${platform}`;
    const imageUrls = getListingImageUrls(listing);

    setSendingMap((current) => ({
      ...current,
      [requestKey]: platform,
    }));

    try {
      const response = await fetch(`${automationBaseUrl}/${platform}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-listmate-user-id": sessionUser.id,
        },
        body: JSON.stringify({
          userId: sessionUser.id,
          listingId: listing.id,
          title: listing.title,
          description: listing.description,
          price: listing.price,
          quantity: listing.quantity,
          brand: listing.brand,
          size: mapSizeForPlatform(listing.size, platform),
          category: mapCategoryForPlatform(listing.category, platform),
          topCategory: listing.topCategory,
          condition: mapConditionForPlatform(listing.condition, platform),
          imageUrls,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        listingId?: string;
        listingUrl?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || `Automation failed with ${response.status}`);
      }

      const urlKey = PLATFORM_URL_KEY[platform];
      const stateKey = PLATFORM_STATE_KEY[platform];
      const updates: Partial<Listing> = {
        [stateKey]: "active",
      };

      if (payload?.listingUrl) {
        updates[urlKey] = payload.listingUrl;
      } else if (platform === "ebay" && payload?.listingId) {
        updates.ebayUrl = `https://www.ebay.com/itm/${payload.listingId}`;
      }

      await db!.transact(db!.tx.listings[listing.id].update(updates));

      if (listing.status === "draft") {
        await updateStatus(listing.id, "listed");
      }

      setToast(payload?.message || `Sent to ${platform}`);
    } catch (error) {
      const message =
        error instanceof TypeError
          ? getAutomationNetworkErrorMessage(automationBaseUrl)
          : error instanceof Error
            ? error.message
            : "Automation request failed";

      const stateKey = PLATFORM_STATE_KEY[platform];
      try {
        await db!.transact(
          db!.tx.listings[listing.id].update({
            [stateKey]: "failed",
          }),
        );
      } catch {
        // Keep primary automation error surfaced even if state sync fails.
      }

      setToast(message);
    } finally {
      setSendingMap((current) => ({
        ...current,
        [requestKey]: null,
      }));
    }
  }

  async function updateStatus(listingId: string, status: ListingStatus) {
    await db!.transact(db!.tx.listings[listingId].update({ status }));
    setToast(status === "sold" ? "Marked as sold" : `Status: ${status}`);
  }

  async function deleteListing(listingId: string) {
    const confirmed = window.confirm("Delete this listing permanently?");

    if (!confirmed) {
      return;
    }

    setDeletingId(listingId);

    try {
      await db!.transact(db!.tx.listings[listingId].delete());
      setToast("Listing deleted");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-[1.6rem] border border-white/80 bg-white/85 p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/65">
              Total Listings: {isLoading ? "--" : listings.length}
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/55">
              Showing: {isLoading ? "--" : visibleListings.length}
            </p>
          </div>
          <input
            value={listingSearch}
            onChange={(event) => setListingSearch(event.target.value)}
            placeholder="Search listing name..."
            className="mt-3 w-full rounded-[1rem] border border-ink/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-clay"
          />
        </div>

        {error ? (
          <div className="rounded-[2rem] border border-rose/20 bg-white/80 p-6 text-sm text-rose shadow-card">
            Unable to load listings. Check your InstantDB app ID and permissions.
          </div>
        ) : null}

        {isLoading ? <LoadingState /> : listings.length > 0 ? null : <EmptyListings />}
        {!isLoading && listings.length > 0 && visibleListings.length === 0
          ? normalizedSearch
            ? <NoSearchMatches query={listingSearch.trim()} />
            : <NoVisibleListings />
          : null}

        {!isLoading &&
          visibleListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              sendingPlatform={
                sendingMap[`${listing.id}:poshmark`] ||
                sendingMap[`${listing.id}:depop`] ||
                sendingMap[`${listing.id}:ebay`] ||
                null
              }
              onUpdateStatus={updateStatus}
              onDelete={deleteListing}
              onRetryPlatform={sendToAutomation}
              isDeleting={deletingId === listing.id}
            />
          ))}
      </div>

      <div className="fixed bottom-20 left-1/2 z-20 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          className="rounded-[1.4rem] bg-ink px-4 py-4 text-sm font-semibold text-white shadow-2xl shadow-ink/20"
        >
          New Listing
        </button>
        <button
          type="button"
          onClick={() => setIsExistingLinksSheetOpen(true)}
          className="rounded-[1.4rem] border border-ink/10 bg-white px-4 py-4 text-sm font-semibold text-ink shadow-2xl shadow-ink/10"
        >
          Existing Links
        </button>
      </div>

      <label
        htmlFor="show-sold-listings"
        className="fixed bottom-5 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between rounded-[1.1rem] border border-ink/10 bg-white/95 px-4 py-3 text-sm font-medium text-ink shadow-card"
      >
        <span>Show Sold Listings</span>
        <input
          id="show-sold-listings"
          type="checkbox"
          checked={showSoldListings}
          onChange={(event) => setShowSoldListings(event.target.checked)}
          className="h-4 w-4 accent-ink"
        />
      </label>

      <NewListingSheet
        isOpen={isSheetOpen}
        isSaving={isSaving}
        onClose={() => setIsSheetOpen(false)}
        onSubmit={handleCreateListing}
      />

      <ExistingLinksSheet
        isOpen={isExistingLinksSheetOpen}
        isSaving={isSaving}
        onClose={() => setIsExistingLinksSheetOpen(false)}
        onSubmit={handleCreateListing}
      />

      {toast ? (
        <div className="fixed inset-x-0 bottom-36 z-20 mx-auto w-fit rounded-full bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  );
}

export function ListMateApp({ sessionUser }: { sessionUser: SessionUser }) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-28 pt-6 sm:px-6">
      <section className="rounded-[2.2rem] border border-white/80 bg-white/60 p-5 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-clay">ListMate</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-ink">
              Post in under 30 seconds.
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/70">
              {sessionUser.username} ({sessionUser.role})
            </p>
            <div className="flex gap-2">
              <Link
                href="/settings"
                className="rounded-full border border-ink/10 bg-white/85 px-4 py-2 text-sm font-semibold text-ink"
              >
                Settings
              </Link>
              <LogoutButton className="rounded-full border border-ink/10 bg-white/85 px-4 py-2 text-sm font-semibold text-ink" />
            </div>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
          Save a listing once, then send it straight into Poshmark, Depop, or eBay for final review and posting.
        </p>
      </section>

      <section className="mt-5">
        {hasInstantConfig ? <ConnectedDashboard sessionUser={sessionUser} /> : <SetupEmptyState />}
      </section>
    </main>
  );
}
