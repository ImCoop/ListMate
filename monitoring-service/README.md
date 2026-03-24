# Monitoring Service

Standalone queue-based service for cross-platform listing reconciliation.

When a sale is detected on one platform, this service queues removal jobs for the other platforms and processes them in the background with retries.

## Why Separate

This service is intentionally separate from `automation-service/` so monitoring/reconciliation logic can evolve independently from listing-creation automation.

## Setup

1. Install dependencies:

```bash
cd monitoring-service
npm install
```

2. Configure environment:

```bash
copy .env.example .env.local
```

3. Start service:

```bash
npm run start
```

Default URL: `http://localhost:3010`

## Endpoints

- `GET /health`
- `GET /jobs`
- `POST /jobs/:id/retry`
- `POST /events/sale-detected`

### `POST /events/sale-detected` payload

```json
{
  "listingId": "abc123",
  "soldOnPlatform": "ebay",
  "poshmarkUrl": "https://poshmark.com/listing/...",
  "depopUrl": "https://depop.com/products/...",
  "ebayUrl": "https://www.ebay.com/itm/..."
}
```

The service will queue removal jobs for every URL present except the sold platform.

## Current Status

- Job queue persistence is implemented (`monitoring-service/data/removal-jobs.json`).
- Retry with exponential backoff is implemented.
- Platform removal adapters are stubbed and currently return `not implemented`.

Next step is wiring real platform deletion/end-listing APIs in:

- `src/platforms/poshmark.js`
- `src/platforms/depop.js`
- `src/platforms/ebay.js`
