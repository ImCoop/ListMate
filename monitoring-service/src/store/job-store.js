import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "removal-jobs.json");

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, "[]\n", "utf8");
  }
}

async function readAll() {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(jobs) {
  await ensureStoreFile();
  await fs.writeFile(STORE_PATH, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
}

export async function listJobs() {
  return readAll();
}

export async function enqueueJobs(nextJobs) {
  const existing = await readAll();
  const createdAt = Date.now();
  const normalized = nextJobs.map((job) => ({
    id: crypto.randomUUID(),
    status: "queued",
    attempts: 0,
    createdAt,
    updatedAt: createdAt,
    lastAttemptAt: null,
    nextAttemptAt: createdAt,
    error: null,
    ...job,
  }));

  await writeAll([...existing, ...normalized]);
  return normalized;
}

export async function claimDueJob() {
  const now = Date.now();
  const jobs = await readAll();
  const index = jobs.findIndex((job) => job.status === "queued" && (job.nextAttemptAt || 0) <= now);

  if (index < 0) {
    return null;
  }

  const current = jobs[index];
  const claimed = {
    ...current,
    status: "processing",
    updatedAt: now,
  };
  jobs[index] = claimed;
  await writeAll(jobs);
  return claimed;
}

export async function completeJob(jobId, updates) {
  const jobs = await readAll();
  const index = jobs.findIndex((job) => job.id === jobId);

  if (index < 0) {
    return null;
  }

  const next = {
    ...jobs[index],
    ...updates,
    updatedAt: Date.now(),
  };
  jobs[index] = next;
  await writeAll(jobs);
  return next;
}

export async function retryJob(jobId) {
  return completeJob(jobId, {
    status: "queued",
    nextAttemptAt: Date.now(),
    error: null,
  });
}
