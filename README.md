# ListMate

Mobile-first listing manager built with Next.js. Create one listing, then send it to marketplace automation flows for Poshmark, Depop, and eBay.

## What It Does

- Create and save listings in InstantDB
- Enforce server-side login with secure session cookies
- Manage users in InstantDB with admin-only controls in Settings
- Generate a unique ID for each listing
- Mark listings as `draft`, `listed`, or `sold`
- Hide sold listings from the home feed by default
- Show sold listings with the bottom toggle: `Show Sold Listings`
- Launch local automation requests for Poshmark, Depop, and eBay

## Tech Stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS
- InstantDB
- Node.js automation service (Playwright + eBay APIs)

## Project Structure

```text
app/                  # Next.js routes
components/           # UI components (home dashboard, settings UI)
lib/                  # Shared types and helpers
automation-service/   # Local automation API for marketplaces
monitoring-service/   # Sale monitoring and cross-platform removal queue
```

## Prerequisites

- Node.js 20+
- npm 10+
- InstantDB account/app ID

## 1) App Setup (Frontend)

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
copy .env.example .env.local
```

3. Update `/.env.local` values:

```bash
NEXT_PUBLIC_INSTANT_APP_ID=your-instant-app-id
INSTANT_APP_ID=your-instant-app-id
INSTANT_APP_ADMIN_TOKEN=your-instant-admin-token
LISTMATE_SESSION_SECRET=your-long-random-secret-min-32-chars
LISTMATE_DEFAULT_ADMIN_USERNAME=admin
LISTMATE_DEFAULT_ADMIN_PASSWORD=admin1234!
NEXT_PUBLIC_AUTOMATION_BASE_URL=http://localhost:3001
```

4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## 2) Automation Service Setup

1. Install service dependencies:

```bash
cd automation-service
npm install
npm run install:browser
```

2. Create service env file (optional but recommended):

```bash
copy .env.example .env.local
```

3. Add eBay credentials (required for eBay API listing):

```bash
EBAY_CLIENT_ID=your-ebay-client-id
EBAY_CLIENT_SECRET=your-ebay-client-secret
EBAY_RUNAME=your-ebay-runame
EBAY_MARKETPLACE_ID=EBAY_US
```

4. Start the automation API:

```bash
npm run start
```

Service default URL: `http://localhost:3001`

## 3) Monitoring Service Setup

1. Install monitoring service dependencies:

```bash
cd monitoring-service
npm install
```

2. Configure environment:

```bash
copy .env.example .env.local
```

3. Start monitoring service:

```bash
npm run start
```

Monitoring service default URL: `http://localhost:3010`

## 4) First-Run Configuration

1. Open the web app.
2. Sign in on `/login` using the default admin username/password from env.
3. Go to `/settings`.
4. In **User management** (admin-only), create normal users/admins.
5. Confirm the automation base URL.
6. Run health check.
7. Complete manual marketplace login/bootstrap steps as needed.

## Listing IDs and Sold Visibility

- Every listing is stored with a unique ID (`id`).
- The home cards show a short display form of that ID for quick reference.
- Sold listings are hidden on the home page by default.
- Enable `Show Sold Listings` at the bottom of the screen to include sold items in the feed.

## Marketplace URL Tracking

- Each listing can store per-platform addresses:
  - `poshmarkUrl`
  - `depopUrl`
  - `ebayUrl`
- Platform listing state is tracked with:
  - `poshmarkState`
  - `depopState`
  - `ebayState`
- The separate monitoring service ingests `sale-detected` events and queues cross-platform removal jobs.
- Queue worker retries failed removals with backoff and persists queue state on disk.

## Scripts

Frontend (`/`):

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - run ESLint
- `npm run typecheck` - run TypeScript checks

Automation (`/automation-service`):

- `npm run start` - start local automation server
- `npm run install:browser` - install Playwright browser dependencies

Monitoring (`/monitoring-service`):

- `npm run start` - start monitoring queue worker/API
- `npm run dev` - run with Node watch mode

## Deployment (Vercel)

1. Push this repository to GitHub.
2. Import into Vercel.
3. Add required frontend env vars in Vercel:

```bash
NEXT_PUBLIC_INSTANT_APP_ID=your-instant-app-id
INSTANT_APP_ID=your-instant-app-id
INSTANT_APP_ADMIN_TOKEN=your-instant-admin-token
LISTMATE_SESSION_SECRET=your-long-random-secret-min-32-chars
NEXT_PUBLIC_AUTOMATION_BASE_URL=https://your-automation-host
```

4. Deploy.

## Notes

- App auth is server-enforced using signed, HTTP-only session cookies.
- `INSTANT_APP_ADMIN_TOKEN` is required for server user management.
- Rotate the default admin password immediately after first login.
- Keep secrets out of Git; use `.env.local` / deployment environment variables.
- For phone testing, point `NEXT_PUBLIC_AUTOMATION_BASE_URL` to your desktop LAN IP.

## Multi-Instance Service Config

Use a single config file to run frontend + automation + monitoring together:

- Default config: `service-instance.config.json`
- Template for new instances: `service-instance.config.template.json`

### Start all services from one window

```bash
npm run hub
```

Production frontend mode:

```bash
npm run hub:prod
```

Status-only dashboard using the same config:

```bash
npm run status
node service-status.js --once
```

### Optional: Auto-Update Staging From GitHub

The hub can periodically fetch updates, detect new commits, and stage a pending update marker for installation.

1. Enable updater in your service config (`service-instance.config.json`):

```json
"updates": {
  "enabled": true,
  "remote": "origin",
  "branch": "main",
  "checkIntervalMs": 60000,
  "applyStagedOnStart": false
}
```

2. Start the hub as usual:

```bash
npm run hub:prod
```

When a newer commit exists on `origin/main`, the hub fetches it and writes:

- `.update-staging/pending-update.json`

3. Apply staged updates on next restart:

```bash
node service-hub.js --prod --apply-staged-update
```

Or set `"applyStagedOnStart": true` to apply automatically whenever the hub starts.

### Run multiple instances on one machine

1. Copy the template into per-instance files (for example `service-instance.a.json`, `service-instance.b.json`).
2. Assign unique frontend/automation/monitoring ports in each file.
3. Assign unique local state file paths per instance:
   - `services.automation.storageStatePath`
   - `services.automation.ebayTokensPath`
   - `services.monitoring.jobStorePath`
4. Start each instance with its config:

```bash
node service-hub.js --config service-instance.a.json --prod
node service-hub.js --config service-instance.b.json --prod
```
