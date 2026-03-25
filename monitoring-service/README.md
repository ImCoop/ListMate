# Monitoring Service

Standalone queue-based service for cross-platform listing reconciliation and availability monitoring.

When a sale is detected on one platform, this service:

- marks the dashboard listing as sold
- marks other marketplaces as `remove_pending`
- queues removal jobs for the other platforms
- processes removal jobs in the background with retries

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
- `POST /jobs/clear-failed`
- `POST /events/sale-detected`
- `POST /monitor/run`

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

## Automatic Monitoring

Every `MONITORING_INTERVAL_MS` (default 300000 = 5 minutes), the service:

1. Queries listings from InstantDB.
2. Checks each active marketplace URL for availability.
3. If a listing page is sold/unavailable:
4. Marks the listing `status="sold"` in the dashboard.
5. Marks sold platform state as `sold` and all other platform states as `remove_pending`.
6. Queues cross-platform removal jobs.

The worker then executes queued removals using `AUTOMATION_BASE_URL`:

- `POST /poshmark/remove`
- `POST /depop/remove`
- `POST /ebay/remove`

## Current Status

- Job queue persistence is implemented (`monitoring-service/data/removal-jobs.json`).
- Retry with exponential backoff is implemented.
- Automatic sale detection monitor is implemented.
- Dashboard sold/remove state sync is implemented through InstantDB admin writes.
