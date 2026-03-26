import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

function loadIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath });
  }
}

export function loadLocalEnv() {
  const cwd = process.cwd();
  loadIfExists(path.join(cwd, ".env"));
  loadIfExists(path.join(cwd, ".env.local"));
  loadIfExists(path.resolve(cwd, "..", ".env"));
  loadIfExists(path.resolve(cwd, "..", ".env.local"));
}

export function readConfig() {
  return {
    port: Number(process.env.MONITORING_PORT || 3010),
    pollIntervalMs: Number(process.env.JOB_POLL_INTERVAL_MS || 5000),
    maxAttempts: Number(process.env.JOB_MAX_ATTEMPTS || 5),
    monitorIntervalMs: Number(process.env.MONITORING_INTERVAL_MS || 3 * 60 * 1000),
    monitorStartupDelayMs: Number(process.env.MONITORING_STARTUP_DELAY_MS || 5 * 60 * 1000),
    saleConfirmationCycles: Number(process.env.MONITORING_SALE_CONFIRMATION_CYCLES || 2),
    monitorRequestTimeoutMs: Number(process.env.MONITORING_REQUEST_TIMEOUT_MS || 15000),
  };
}
