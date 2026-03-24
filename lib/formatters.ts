import type { Listing } from "@/lib/types";

const MAX_POSHMARK_TITLE = 60;

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shortenTitle(title: string, maxLength: number) {
  const cleanTitle = compactWhitespace(title);

  if (cleanTitle.length <= maxLength) {
    return cleanTitle;
  }

  return `${cleanTitle.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildHashtags(listing: Listing) {
  const tokens = [
    listing.brand,
    listing.category,
    listing.size,
    ...listing.title.split(/\s+/),
    ...listing.description.split(/\s+/).slice(0, 12),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((value) => value.length > 2);

  const uniqueTags = Array.from(
    new Set(["fashion", "style", "poshmark", "closet", "sale", ...tokens]),
  ).slice(0, 10);

  return uniqueTags.map((tag) => `#${tag}`);
}

function buildDepopTags(listing: Listing) {
  const tagPool = [
    listing.category,
    listing.brand,
    listing.size ? `size ${listing.size}` : undefined,
    "streetwear",
    "vintage",
    "trendy",
    "resale",
  ]
    .filter(Boolean)
    .map((value) => compactWhitespace(String(value)).toLowerCase());

  return Array.from(new Set(tagPool)).slice(0, 6).join(", ");
}

function optionalDetails(listing: Listing) {
  const details = [
    listing.brand ? `Brand: ${listing.brand}` : null,
    listing.size ? `Size: ${listing.size}` : null,
    listing.category ? `Category: ${listing.category}` : null,
    `Quantity: ${listing.quantity}`,
  ].filter(Boolean);

  return details.join("\n");
}

export function formatPoshmarkCopy(listing: Listing) {
  const lines = [
    `✨ ${shortenTitle(listing.title, MAX_POSHMARK_TITLE)}`,
    "",
    `Price: $${listing.price.toFixed(2)}`,
    "",
    compactWhitespace(listing.description),
    optionalDetails(listing) ? `\n${optionalDetails(listing)}` : "",
    "",
    buildHashtags(listing).join(" "),
  ];

  return lines.filter(Boolean).join("\n");
}

export function formatDepopCopy(listing: Listing) {
  const lines = [
    shortenTitle(listing.title, 80),
    "",
    `${compactWhitespace(listing.description)} Easy add-to-cart piece with fast shipping and clean details.`,
    optionalDetails(listing) ? `\n${optionalDetails(listing)}` : "",
    "",
    `Price: $${listing.price.toFixed(2)}`,
    "Shipping available",
    "",
    `Tags: ${buildDepopTags(listing)}`,
  ];

  return lines.filter(Boolean).join("\n");
}

export function formatGenericCopy(listing: Listing) {
  const lines = [
    compactWhitespace(listing.title),
    "",
    `Price: $${listing.price.toFixed(2)}`,
    `Quantity: ${listing.quantity}`,
    listing.brand ? `Brand: ${listing.brand}` : null,
    listing.size ? `Size: ${listing.size}` : null,
    listing.category ? `Category: ${listing.category}` : null,
    "",
    compactWhitespace(listing.description),
    listing.imageUrls.length > 0 ? "" : null,
    listing.imageUrls.length > 0 ? `Images: ${listing.imageUrls.join(", ")}` : null,
  ];

  return lines.filter(Boolean).join("\n");
}
