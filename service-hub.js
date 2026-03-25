#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const readline = require("node:readline");

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
const AUTOMATION_URL = (process.env.AUTOMATION_URL || "http://localhost:3001").replace(/\/$/, "");
const MONITORING_URL = (process.env.MONITORING_URL || "http://localhost:3010").replace(/\/$/, "");

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 4000);
const STATUS_INTERVAL_MS = Number(process.env.STATUS_INTERVAL_MS || 5000);
const STARTUP_DELAY_MS = Number(process.env.STARTUP_DELAY_MS || 800);

const isProd = process.argv.includes("--prod");

const FRONTEND_CMD = process.env.FRONTEND_CMD || (isProd ? "npm run start" : "npm run dev");
const AUTOMATION_CMD = process.env.AUTOMATION_CMD || "npm --prefix automation-service run start";
const MONITORING_CMD = process.env.MONITORING_CMD || "npm --prefix monitoring-service run start";

const services = [
  {
    key: "frontend",
    name: "Frontend",
    command: FRONTEND_CMD,
    healthUrl: FRONTEND_URL,
    color: 36,
  },
  {
    key: "automation",
    name: "Automation",
    command: AUTOMATION_CMD,
    healthUrl: `${AUTOMATION_URL}/health`,
    color: 35,
  },
  {
    key: "monitoring",
    name: "Monitoring",
    command: MONITORING_CMD,
    healthUrl: `${MONITORING_URL}/health`,
    color: 33,
  },
];

function colorize(text, colorCode) {
  if (!process.stdout.isTTY) {
    return text;
  }

  return `\u001b[${colorCode}m${text}\u001b[0m`;
}

function timestamp() {
  const now = new Date();
  return now.toLocaleTimeString();
}

function prefixLine(service, line) {
  const label = colorize(service.name.padEnd(10, " "), service.color);
  return `[${timestamp()}] ${label} | ${line}`;
}

function printLine(service, line) {
  const cleaned = String(line || "").replace(/\r/g, "").trimEnd();
  if (!cleaned) {
    return;
  }

  const parts = cleaned.split("\n");
  service.lastLog = parts[parts.length - 1];
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "user-agent": "ListMateServiceHub/1.0" },
    });
    const elapsedMs = Date.now() - started;
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkServiceHealth(service) {
  try {
    const result = await fetchWithTimeout(service.healthUrl);
    return {
      up: result.ok || (service.key === "frontend" && result.status >= 200 && result.status < 400),
      detail: `HTTP ${result.status}`,
      elapsedMs: result.elapsedMs,
    };
  } catch (error) {
    return {
      up: false,
      detail: error instanceof Error ? error.message : "Request failed",
      elapsedMs: null,
    };
  }
}

function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write("\u001bc");
  } else {
    console.log("");
  }
}

function padRight(text, width) {
  const value = String(text);
  if (value.length >= width) {
    return value;
  }

  return value + " ".repeat(width - value.length);
}

function truncate(text, max) {
  const value = String(text || "");
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function spawnService(service) {
  const child = spawn(service.command, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  service.child = child;
  service.exited = false;

  child.stdout.on("data", (chunk) => {
    printLine(service, String(chunk));
  });

  child.stderr.on("data", (chunk) => {
    printLine(service, String(chunk));
  });

  child.on("exit", (code, signal) => {
    service.exited = true;
    service.lastLog = `Exited (code=${code === null ? "null" : code}, signal=${signal || "none"})`;
  });
}

function terminateChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }

  child.kill("SIGTERM");
}

let statusTimer = null;
let shuttingDown = false;

async function renderDashboard() {
  const checks = await Promise.all(
    services.map(async (service) => ({
      service,
      health: await checkServiceHealth(service),
    })),
  );

  const upCount = checks.filter((entry) => entry.health.up).length;
  const summary =
    upCount === checks.length
      ? colorize(`All services online (${upCount}/${checks.length})`, 32)
      : colorize(`${checks.length - upCount} service(s) offline`, 31);

  const lines = [
    "ListMate Service Hub",
    summary,
    `Checked: ${new Date().toLocaleString()}`,
    "",
  ];

  for (const { service, health } of checks) {
    const processState = service.exited
      ? colorize("EXITED", 31)
      : service.child && service.child.exitCode === null
        ? colorize("RUNNING", 32)
        : colorize("STOPPED", 31);
    const healthState = health.up ? colorize("UP", 32) : colorize("DOWN", 31);
    const latency = health.elapsedMs === null ? "--" : `${health.elapsedMs}ms`;
    lines.push(
      `${padRight(service.name, 11)} process:${padRight(processState, 13)} health:${padRight(healthState, 8)} ${padRight(latency, 8)} ${health.detail}`,
    );
    lines.push(`  url: ${service.healthUrl}`);
    if (service.lastLog) {
      lines.push(`  last: ${truncate(service.lastLog, 120)}`);
    }
    lines.push("");
  }

  lines.push("Ctrl+C to stop all services.");
  clearScreen();
  console.log(lines.join("\n"));
}

async function startAll() {
  for (const service of services) {
    service.lastLog = `Starting: ${service.command}`;
    spawnService(service);
    await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
  }

  await renderDashboard();

  statusTimer = setInterval(() => {
    void renderDashboard();
  }, STATUS_INTERVAL_MS);
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }

  for (const service of services) {
    service.lastLog = "Stopping...";
    terminateChild(service.child);
  }

  await new Promise((resolve) => setTimeout(resolve, 1200));
  await renderDashboard();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(false);
}

void startAll();
