#!/usr/bin/env node
"use strict";

const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const DEFAULT_AUTOMATION_BASE_URL = process.env.AUTOMATION_URL || "http://localhost:3001";
const DEFAULT_MONITORING_BASE_URL = process.env.MONITORING_URL || "http://localhost:3010";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 4000);
const ONCE = process.argv.includes("--once");

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

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
  const url = normalizeBaseUrl(frontendUrl) || DEFAULT_FRONTEND_URL;

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
  const baseUrl = normalizeBaseUrl(automationBaseUrl) || DEFAULT_AUTOMATION_BASE_URL;
  const url = `${baseUrl}/health`;

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
  const baseUrl = normalizeBaseUrl(monitoringBaseUrl) || DEFAULT_MONITORING_BASE_URL;
  const url = `${baseUrl}/health`;

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
    "ListMate Service Status",
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
    checkFrontend(DEFAULT_FRONTEND_URL),
    checkAutomation(DEFAULT_AUTOMATION_BASE_URL),
    checkMonitoring(DEFAULT_MONITORING_BASE_URL),
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

