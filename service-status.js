#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const configArgIndex = args.indexOf("--config");
const configPathArg = configArgIndex >= 0 ? args[configArgIndex + 1] : null;
const configPath = path.resolve(process.cwd(), configPathArg || "service-instance.config.json");

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function loadConfig(targetPath) {
  const raw = fs.readFileSync(targetPath, "utf8");
  const parsed = JSON.parse(raw);
  const host = parsed?.network?.host || "127.0.0.1";
  const ports = {
    frontend: Number(parsed?.ports?.frontend || 3000),
    automation: Number(parsed?.ports?.automation || 3001),
    monitoring: Number(parsed?.ports?.monitoring || 3010),
  };
  return {
    instanceName: parsed?.instanceName || "listmate-instance",
    timing: {
      pollIntervalMs: Number(parsed?.timing?.statusIntervalMs || 5000),
      requestTimeoutMs: Number(parsed?.timing?.requestTimeoutMs || 4000),
    },
    urls: {
      frontend: normalizeBaseUrl(parsed?.urls?.frontend || `http://${host}:${ports.frontend}`),
      automation: normalizeBaseUrl(parsed?.urls?.automation || `http://${host}:${ports.automation}`),
      monitoring: normalizeBaseUrl(parsed?.urls?.monitoring || `http://${host}:${ports.monitoring}`),
    },
  };
}

let config = null;
try {
  config = loadConfig(configPath);
} catch (error) {
  console.error(
    `Failed to load config file at ${configPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exit(1);
}

const POLL_INTERVAL_MS = config.timing.pollIntervalMs;
const REQUEST_TIMEOUT_MS = config.timing.requestTimeoutMs;

function nowStamp() {
  const now = new Date();
  return now.toLocaleString();
}

function colorize(text, colorCode) {
  if (!process.stdout.isTTY) {
    return text;
  }

  return `\u001b[${colorCode}m${text}\u001b[0m`;
}

function padRight(text, width) {
  const value = String(text);
  if (value.length >= width) {
    return value;
  }

  return value + " ".repeat(width - value.length);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "ListMateServiceStatus/1.0",
      },
    });
    const elapsedMs = Date.now() - startedAt;

    let payload = null;
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    }

    return {
      ok: response.ok,
      status: response.status,
      elapsedMs,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkFrontend(frontendUrl) {
  const url = normalizeBaseUrl(frontendUrl);

  try {
    const result = await fetchWithTimeout(url);
    return {
      name: "Frontend",
      url,
      up: result.status >= 200 && result.status < 400,
      detail: `HTTP ${result.status}`,
      elapsedMs: result.elapsedMs,
    };
  } catch (error) {
    return {
      name: "Frontend",
      url,
      up: false,
      detail: error instanceof Error ? error.message : "Request failed",
      elapsedMs: null,
    };
  }
}

async function checkAutomation(automationBaseUrl) {
  const url = `${normalizeBaseUrl(automationBaseUrl)}/health`;

  try {
    const result = await fetchWithTimeout(url);
    const healthOk = Boolean(result.payload && result.payload.ok === true);
    return {
      name: "Automation",
      url,
      up: result.ok && healthOk,
      detail: result.ok ? "healthy" : `HTTP ${result.status}`,
      elapsedMs: result.elapsedMs,
    };
  } catch (error) {
    return {
      name: "Automation",
      url,
      up: false,
      detail: error instanceof Error ? error.message : "Request failed",
      elapsedMs: null,
    };
  }
}

async function checkMonitoring(monitoringBaseUrl) {
  const url = `${normalizeBaseUrl(monitoringBaseUrl)}/health`;

  try {
    const result = await fetchWithTimeout(url);
    const healthOk = Boolean(result.payload && result.payload.ok === true);
    return {
      name: "Monitoring",
      url,
      up: result.ok && healthOk,
      detail: result.ok ? "healthy" : `HTTP ${result.status}`,
      elapsedMs: result.elapsedMs,
    };
  } catch (error) {
    return {
      name: "Monitoring",
      url,
      up: false,
      detail: error instanceof Error ? error.message : "Request failed",
      elapsedMs: null,
    };
  }
}

function renderReport(results) {
  const upCount = results.filter((entry) => entry.up).length;
  const downCount = results.length - upCount;
  const summaryText =
    downCount === 0
      ? colorize(`All services online (${upCount}/${results.length})`, "32")
      : colorize(`${downCount} service(s) offline (${upCount}/${results.length} online)`, "31");

  return [
    `ListMate Service Status (${config.instanceName})`,
    `Config: ${configPath}`,
    summaryText,
    `Checked: ${nowStamp()}`,
    "",
    ...results.map((entry) => {
      const indicator = entry.up ? colorize("[UP]", "32") : colorize("[DOWN]", "31");
      const latency = entry.elapsedMs === null ? "--" : `${entry.elapsedMs}ms`;
      return `${indicator} ${padRight(entry.name, 11)} ${padRight(latency, 8)} ${entry.detail}  ${entry.url}`;
    }),
    "",
    "Press Ctrl+C to stop.",
  ].join("\n");
}

function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write("\u001bc");
  } else {
    console.log("");
  }
}

async function runCheck() {
  return Promise.all([
    checkFrontend(config.urls.frontend),
    checkAutomation(config.urls.automation),
    checkMonitoring(config.urls.monitoring),
  ]);
}

async function runOnce() {
  const results = await runCheck();
  console.log(renderReport(results));
  const allUp = results.every((entry) => entry.up);
  process.exit(allUp ? 0 : 1);
}

async function runWatch() {
  while (true) {
    const results = await runCheck();
    clearScreen();
    console.log(renderReport(results));
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (ONCE) {
  void runOnce();
} else {
  void runWatch();
}

