# Resale Listing Tool

Lean, mobile-first Next.js app for creating a product listing once, then copying platform-ready versions for resale marketplaces.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- InstantDB
- Vercel-ready

## Features

- Create a listing with title, description, price, quantity, photos, brand, size, and category
- Mobile-first dashboard with thumb-friendly cards and actions
- One-tap copy for:
  - Poshmark
  - Depop
  - Generic listing text
- Quick open links for:
  - Poshmark create listing
  - Depop sell page
- Status management:
  - Draft
  - Listed
  - Sold
- Permanent delete for saved listings
- Sticky `New Listing` button
- Clipboard toast feedback
- Direct camera capture or image upload with preview thumbnails
- Local Playwright automation buttons for Poshmark and Depop
- eBay listing creation through the official eBay APIs
- Depop magic-link session bootstrap from the main app
- Dedicated settings/admin page for automation service setup and manual marketplace login

## InstantDB setup

1. Create an app in InstantDB.
2. Copy your app ID.
3. Create `.env.local` from `.env.example`.
4. Set:

```bash
NEXT_PUBLIC_INSTANT_APP_ID=your-instant-app-id
NEXT_PUBLIC_AUTOMATION_BASE_URL=http://localhost:3001
```

For eBay API listing creation, also configure these values for the automation service in `automation-service/.env`, `automation-service/.env.local`, or your shell environment:

```bash
EBAY_CLIENT_ID=your-ebay-client-id
EBAY_CLIENT_SECRET=your-ebay-client-secret
EBAY_RUNAME=your-ebay-runame
EBAY_MARKETPLACE_ID=EBAY_US
```

This app uses a `listings` collection with the following fields stored per record:

- `title`
- `description`
- `price`
- `quantity`
- `imageUrls`
- `brand`
- `size`
- `category`
- `status`
- `createdAt`

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000`

## Run the automation service

1. Install service dependencies:

```bash
cd automation-service
npm install
npm run install:browser
```

2. Start the local automation server:

```bash
npm run start
```

3. Use `Send to Poshmark`, `Send to Depop`, or `Send to eBay` from the listing card.
4. Use `/settings` in the web app to:
   - set the automation service URL
   - run a health check
   - open manual Poshmark or Depop login flows
   - connect eBay API access
   - paste a Depop magic link
5. After marketplace setup:
   - Playwright sessions are saved in `automation-service/storageState.json`
   - eBay OAuth tokens are saved in `automation-service/ebay-tokens.json`

If you open the web app from another device, set `NEXT_PUBLIC_AUTOMATION_BASE_URL` to the desktop running the automation service, for example `http://192.168.1.25:3001`.

## Deploy to Vercel

1. Push this project to GitHub.
2. Import the repo into Vercel.
3. Add the environment variable below in Vercel project settings:

```bash
NEXT_PUBLIC_INSTANT_APP_ID=your-instant-app-id
NEXT_PUBLIC_AUTOMATION_BASE_URL=http://localhost:3001
```

4. Deploy.

## Notes

- Opening Poshmark or Depop automatically moves a draft listing to `listed`.
- Copy actions format text specifically for each marketplace and write directly to the clipboard.
- Photos are captured or uploaded in the form and stored in `imageUrls` after client-side resizing.
- Poshmark and Depop automation open the marketplace page, fill fields and images, then stop before final submission.
- eBay listing creation uses OAuth plus the official Inventory/Account/Taxonomy APIs and uploads images to eBay Picture Services before publishing.
- Poshmark automation explicitly confirms the photo upload step before field entry.
- There is no authentication in the main app.
