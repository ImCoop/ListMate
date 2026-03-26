import cors from "cors";
import express from "express";

import { loadLocalEnv, readConfig } from "./env.js";
import { runMonitoringCycle } from "./monitor.js";
import { buildRemovalJobsFromSaleEvent, processJob } from "./reconciler.js";
import { claimDueJob, clearFailedJobs, enqueueJobs, listJobs, retryJob } from "./store/job-store.js";

loadLocalEnv();

const app = express();
const config = readConfig();

app.use(
  cors({
    origin: true,
  }),
);
app.use(express.json());

function validateSaleEvent(payload) {
  const soldOnPlatform = String(payload?.soldOnPlatform || "").trim().toLowerCase();
  const listingId = String(payload?.listingId || "").trim();

  if (!listingId) {
    return "listingId is required";
  }

  if (!["poshmark", "depop", "ebay"].includes(soldOnPlatform)) {
    return "soldOnPlatform must be one of: poshmark, depop, ebay";
  }

  return null;
}

let workerBusy = false;
let monitorBusy = false;
let lastMonitorResult = null;

async function tickWorker() {
  if (workerBusy) {
    return;
  }

  workerBusy = true;

  try {
    const job = await claimDueJob();

    if (!job) {
      return;
    }

    await processJob(job);
  } finally {
    workerBusy = false;
  }
}

async function tickMonitor() {
  if (monitorBusy) {
    return;
  }

  monitorBusy = true;

  try {
    const result = await runMonitoringCycle(config);
    lastMonitorResult = {
      ...result,
      checkedAt: Date.now(),
    };
  } catch (error) {
    lastMonitorResult = {
      ok: false,
      skipped: false,
      checkedAt: Date.now(),
      error: error instanceof Error ? error.message : "Monitoring cycle failed",
    };
  } finally {
    monitorBusy = false;
  }
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "monitoring-service",
    monitorIntervalMs: config.monitorIntervalMs,
    lastMonitorResult,
  });
});

app.get("/jobs", async (_request, response) => {
  const jobs = await listJobs();
  response.json({
    ok: true,
    count: jobs.length,
    jobs,
  });
});

app.post("/jobs/:id/retry", async (request, response) => {
  const job = await retryJob(request.params.id);

  if (!job) {
    response.status(404).json({ error: "Job not found" });
    return;
  }

  response.json({
    ok: true,
    job,
  });
});

app.post("/jobs/clear-failed", async (_request, response) => {
  const result = await clearFailedJobs();

  response.json({
    ok: true,
    ...result,
  });
});

app.post("/monitor/run", async (_request, response) => {
  await tickMonitor();

  response.json({
    ok: true,
    monitor: lastMonitorResult,
  });
});

app.post("/events/sale-detected", async (request, response) => {
  const validationError = validateSaleEvent(request.body);

  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  const soldOnPlatform = String(request.body.soldOnPlatform).trim().toLowerCase();
  const listingId = String(request.body.listingId).trim();
  const event = {
    listingId,
    userId: typeof request.body.userId === "string" ? request.body.userId.trim() : "",
    soldOnPlatform,
    poshmarkUrl: typeof request.body.poshmarkUrl === "string" ? request.body.poshmarkUrl.trim() : "",
    depopUrl: typeof request.body.depopUrl === "string" ? request.body.depopUrl.trim() : "",
    ebayUrl: typeof request.body.ebayUrl === "string" ? request.body.ebayUrl.trim() : "",
  };

  const jobs = buildRemovalJobsFromSaleEvent(event, config.maxAttempts);
  const created = await enqueueJobs(jobs);

  response.json({
    ok: true,
    message: `Queued ${created.length} removal job(s) for listing ${listingId}.`,
    jobs: created,
  });
});

const workerInterval = setInterval(() => {
  void tickWorker();
}, config.pollIntervalMs);

const monitorInterval = setInterval(() => {
  void tickMonitor();
}, config.monitorIntervalMs);

void tickMonitor();

process.on("SIGINT", () => {
  clearInterval(workerInterval);
  clearInterval(monitorInterval);
  process.exit(0);
});

process.on("SIGTERM", () => {
  clearInterval(workerInterval);
  clearInterval(monitorInterval);
  process.exit(0);
});

app.listen(config.port, () => {
  console.log(`Monitoring service listening on http://localhost:${config.port}`);
  console.log(`Worker polling every ${config.pollIntervalMs}ms`);
  console.log(`Listing monitor polling every ${config.monitorIntervalMs}ms`);
});
