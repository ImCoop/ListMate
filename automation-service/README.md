# Automation Service

Local Express service that receives listing data from the web app. It uses Playwright for Poshmark and Depop, and the official eBay APIs for eBay listing creation.

## Install

```bash
cd automation-service
npm install
npm run install:browser
```

## Run

```bash
npm run start
```

The service listens on `http://localhost:3001`.

## Removal endpoints (used by monitoring-service)

- `POST /ebay/remove` (implemented via eBay Trading API `EndFixedPriceItem`)
- `POST /poshmark/remove` (implemented via Playwright UI flow)
- `POST /depop/remove` (implemented via Playwright UI flow)

## eBay API setup

Create `automation-service/.env` or `automation-service/.env.local` with:

```bash
EBAY_CLIENT_ID=your-ebay-client-id
EBAY_CLIENT_SECRET=your-ebay-client-secret
EBAY_RUNAME=your-ebay-runame
EBAY_MARKETPLACE_ID=EBAY_US
```

The eBay RuName must be configured in the eBay Developer Portal so its accept URL points to:

```bash
http://localhost:3001/ebay/oauth/callback
```

## First-time login flow

1. Start the service.
2. In the main web app, click `Send to Poshmark` or `Send to Depop`.
3. A visible Chromium window opens.
4. If login is needed:
   - use the web app's `/settings` page to open manual Poshmark or Depop login
   - or paste a Depop magic link and let the service open it
   - or use `Connect eBay API` to complete eBay OAuth consent
5. The service saves browser sessions to `storageState.json`.
6. The service saves eBay OAuth tokens to `ebay-tokens.json`.
6. Future runs reuse that session until it expires.

## Notes

- The browser always runs headful.
- Poshmark and Depop use a visible browser. eBay does not; it uses the Inventory API, Account API, Taxonomy API, and eBay Picture Services.
- Playwright and eBay token persistence are now per-app-user when requests include `x-listmate-user-id`.
- Poshmark upload handling confirms the photo editor's `Apply`/`Next` step before filling the listing form.
- Uploaded photos are written to a temporary folder and deleted after Playwright hands them to the page.
- eBay API listings require business policies and at least one enabled inventory location in the connected seller account.
- If you use the web app from another device, point the frontend at your desktop by setting `NEXT_PUBLIC_AUTOMATION_BASE_URL`.
