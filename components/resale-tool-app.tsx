"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getAutomationNetworkErrorMessage, readAutomationBaseUrl } from "@/lib/automation";
import { createId, db, hasInstantConfig } from "@/lib/instant";
import type { Listing, ListingInput, ListingStatus, PoshmarkTopCategory } from "@/lib/types";

const POSHMARK_TOP_CATEGORIES: PoshmarkTopCategory[] = ["Women", "Men", "Kids", "Home", "Pets", "Electronics"];

const emptyForm = {
  title: "",
  description: "",
  price: "",
  quantity: "1",
  imageUrls: [] as string[],
  brand: "",
  size: "",
  category: "",
  topCategory: "Women" as PoshmarkTopCategory,
  condition: "",
};

type FormState = typeof emptyForm;

function sortListings(listings: Listing[]) {
  return [...listings].sort((a, b) => b.createdAt - a.createdAt);
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
  onSubmit: (input: ListingInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForm(emptyForm);
      setIsProcessingImages(false);
    }
  }, [isOpen]);

  async function handleImageSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 6);

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
      event.target.value = "";
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await onSubmit({
      title: form.title.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      quantity: Number(form.quantity),
      imageUrls: form.imageUrls,
      brand: form.brand.trim() || undefined,
      size: form.size.trim() || undefined,
      category: form.category.trim() || undefined,
      topCategory: form.topCategory,
      condition: form.condition.trim() || undefined,
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
              <label className="flex cursor-pointer items-center justify-center rounded-[1.2rem] bg-sand px-4 py-4 text-center text-sm font-semibold text-ink transition hover:bg-sand/80">
                <input
                  multiple
                  accept="image/*"
                  capture="environment"
                  type="file"
                  onChange={handleImageSelection}
                  className="sr-only"
                />
                {isProcessingImages ? "Processing photos..." : "Take or upload photos"}
              </label>

              <p className="mt-3 text-xs leading-5 text-ink/55">
                Up to 6 images. Photos are resized before save for faster mobile use.
              </p>

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
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Poshmark Category">
              <select
                value={form.topCategory}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    topCategory: event.target.value as PoshmarkTopCategory,
                  }))
                }
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
              >
                {POSHMARK_TOP_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Subcategory Hint">
              <input
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
                placeholder="Outerwear"
              />
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
              <input
                value={form.size}
                onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
                placeholder="L"
              />
            </Field>

            <Field label="Condition">
              <input
                value={form.condition}
                onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-clay"
                placeholder="New With Tags"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={isSaving || isProcessingImages}
            className="w-full rounded-[1.4rem] bg-ink px-5 py-4 text-base font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            {isSaving ? "Saving..." : isProcessingImages ? "Preparing photos..." : "Save listing"}
          </button>
        </form>
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

type AutomationPlatform = "poshmark" | "depop" | "ebay";

function ListingCard({
  listing,
  sendingPlatform,
  onUpdateStatus,
  onDelete,
  isDeleting,
}: {
  listing: Listing;
  sendingPlatform: AutomationPlatform | null;
  onUpdateStatus: (listingId: string, status: ListingStatus) => Promise<void>;
  onDelete: (listingId: string) => Promise<void>;
  isDeleting: boolean;
}) {
  return (
    <article className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur">
      {listing.imageUrls[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.imageUrls[0]}
          alt={listing.title}
          className="mb-4 h-48 w-full rounded-[1.5rem] object-cover"
        />
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-clay">
            {listing.topCategory || listing.category || "Listing"}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-tight text-ink">{listing.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink px-3 py-2 text-sm font-semibold text-white">
              ${listing.price.toFixed(2)}
            </span>
            <span className={clsx("rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em]", statusTone(listing.status))}>
              {listing.status}
            </span>
          </div>
        </div>

        <div className="text-right font-mono text-xs uppercase tracking-[0.16em] text-ink/45">
          Qty {listing.quantity}
        </div>
      </div>

      {(listing.brand || listing.size || listing.condition || listing.category || listing.imageUrls.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-ink/60">
          {listing.brand ? <span className="rounded-full bg-sand px-3 py-1.5">{listing.brand}</span> : null}
          {listing.size ? <span className="rounded-full bg-sand px-3 py-1.5">Size {listing.size}</span> : null}
          {listing.condition ? <span className="rounded-full bg-sand px-3 py-1.5">{listing.condition}</span> : null}
          {listing.category ? <span className="rounded-full bg-sand px-3 py-1.5">{listing.category}</span> : null}
          {listing.imageUrls.length > 0 ? (
            <span className="rounded-full bg-sand px-3 py-1.5">{listing.imageUrls.length} images</span>
          ) : null}
        </div>
      )}

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-ink/70">{listing.description}</p>

      <div className="mt-5">
        <StatusControl currentStatus={listing.status} onChange={(status) => onUpdateStatus(listing.id, status)} />
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

function ConnectedDashboard() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sendingMap, setSendingMap] = useState<Record<string, AutomationPlatform | null>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [automationBaseUrl, setAutomationBaseUrl] = useState(readAutomationBaseUrl);

  const { isLoading, error, data } = db!.useQuery({ listings: {} });
  const listings = sortListings((data?.listings as Listing[] | undefined) ?? []);

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

  async function handleCreateListing(input: ListingInput) {
    setIsSaving(true);

    try {
      const listingId = createId();
      const listing: Listing = {
        id: listingId,
        ...input,
        status: "draft",
        createdAt: Date.now(),
      };

      await db!.transact(
        db!.tx.listings[listingId].update(listing),
      );
      setIsSheetOpen(false);
      setToast("Listing saved. Sending to Poshmark, Depop, and eBay.");

      void Promise.allSettled([
        sendToAutomation(listing, "poshmark"),
        sendToAutomation(listing, "depop"),
        sendToAutomation(listing, "ebay"),
      ]);
    } finally {
      setIsSaving(false);
    }
  }

  async function sendToAutomation(listing: Listing, platform: AutomationPlatform) {
    const requestKey = `${listing.id}:${platform}`;

    setSendingMap((current) => ({
      ...current,
      [requestKey]: platform,
    }));

    try {
      const response = await fetch(`${automationBaseUrl}/${platform}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId: listing.id,
          title: listing.title,
          description: listing.description,
          price: listing.price,
          quantity: listing.quantity,
          brand: listing.brand,
          size: listing.size,
          category: listing.category,
          topCategory: listing.topCategory,
          condition: listing.condition,
          imageUrls: listing.imageUrls,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || `Automation failed with ${response.status}`);
      }

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
        {error ? (
          <div className="rounded-[2rem] border border-rose/20 bg-white/80 p-6 text-sm text-rose shadow-card">
            Unable to load listings. Check your InstantDB app ID and permissions.
          </div>
        ) : null}

        {isLoading ? <LoadingState /> : listings.length > 0 ? null : <EmptyListings />}

        {!isLoading &&
          listings.map((listing) => (
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
              isDeleting={deletingId === listing.id}
            />
          ))}
      </div>

      <button
        type="button"
        onClick={() => setIsSheetOpen(true)}
        className="fixed bottom-5 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-[1.4rem] bg-ink px-5 py-4 text-base font-semibold text-white shadow-2xl shadow-ink/20"
      >
        New Listing
      </button>

      <NewListingSheet
        isOpen={isSheetOpen}
        isSaving={isSaving}
        onClose={() => setIsSheetOpen(false)}
        onSubmit={handleCreateListing}
      />

      {toast ? (
        <div className="fixed inset-x-0 bottom-24 z-20 mx-auto w-fit rounded-full bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  );
}

export function ResaleToolApp() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-28 pt-6 sm:px-6">
      <section className="rounded-[2.2rem] border border-white/80 bg-white/60 p-5 shadow-card backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.32em] text-clay">Resale tool</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight text-ink">
              Post in under 30 seconds.
            </h1>
          </div>
          <Link
            href="/settings"
            className="rounded-full border border-ink/10 bg-white/85 px-4 py-2 text-sm font-semibold text-ink"
          >
            Settings
          </Link>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
          Save a listing once, then send it straight into Poshmark, Depop, or eBay for final review and posting.
        </p>
      </section>

      <section className="mt-5">
        {hasInstantConfig ? <ConnectedDashboard /> : <SetupEmptyState />}
      </section>
    </main>
  );
}
