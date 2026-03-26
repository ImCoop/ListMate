#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const applyStagedUpdateArg = args.includes("--apply-staged-update");
const configArgIndex = args.indexOf("--config");
const configPathArg = configArgIndex >= 0 ? args[configArgIndex + 1] : null;
const configPath = path.resolve(process.cwd(), configPathArg || "service-instance.config.json");

function colorize(text, colorCode) {
  if (!process.stdout.isTTY) {
    return text;
  }

  return `\u001b[${colorCode}m${text}\u001b[0m`;
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

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function readJsonIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(targetPath, data) {
  ensureDirectory(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function runShellCommand(command, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...env,
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `Command failed (${command}) [code=${code === null ? "null" : code}]` +
            (stderr.trim() ? `: ${stderr.trim()}` : ""),
        ),
      );
    });
  });
}

function loadConfig(targetPath) {
  const raw = fs.readFileSync(targetPath, "utf8");
  const parsed = JSON.parse(raw);

  const host = parsed?.network?.host || "127.0.0.1";
  const frontendPort = Number(parsed?.ports?.frontend || 3000);
  const automationPort = Number(parsed?.ports?.automation || 3001);
  const monitoringPort = Number(parsed?.ports?.monitoring || 3010);

  const frontendBaseUrl = normalizeBaseUrl(parsed?.urls?.frontend || `http://${host}:${frontendPort}`);
  const automationBaseUrl = normalizeBaseUrl(parsed?.urls?.automation || `http://${host}:${automationPort}`);
  const monitoringBaseUrl = normalizeBaseUrl(parsed?.urls?.monitoring || `http://${host}:${monitoringPort}`);
  const updatesEnabled = Boolean(parsed?.updates?.enabled);
  const updatesRepoCwd = path.resolve(process.cwd(), parsed?.updates?.repoCwd || ".");
  const updatesStagingDir = path.resolve(process.cwd(), parsed?.updates?.stagingDir || ".update-staging");
  const updatesPendingFile = path.join(updatesStagingDir, "pending-update.json");
  const updatesApplyOnStart = Boolean(parsed?.updates?.applyStagedOnStart);
  const updatesCheckIntervalMs = Number(parsed?.updates?.checkIntervalMs || 60_000);
  const updatesRemote = parsed?.updates?.remote || "origin";
  const updatesBranch = parsed?.updates?.branch || "main";
  const updatesInstallCommand = parsed?.updates?.installCommand || "npm install";
  const updatesAutomationInstallCommand =
    parsed?.updates?.automationInstallCommand || "npm install";
  const updatesMonitoringInstallCommand =
    parsed?.updates?.monitoringInstallCommand || "npm install";
  const updatesBuildCommand = parsed?.updates?.buildCommand || "npm run build";
  const frontendCommand = isProd
    ? parsed?.services?.frontend?.prodCommand || parsed?.services?.frontend?.command || "npm run start"
    : parsed?.services?.frontend?.devCommand || "npm run dev";

  return {
    instanceName: parsed?.instanceName || "listmate-instance",
    timing: {
      requestTimeoutMs: Number(parsed?.timing?.requestTimeoutMs || 4000),
      statusIntervalMs: Number(parsed?.timing?.statusIntervalMs || 5000),
      startupDelayMs: Number(parsed?.timing?.startupDelayMs || 800),
    },
    frontend: {
      cwd: path.resolve(process.cwd(), parsed?.services?.frontend?.cwd || "."),
      command: frontendCommand,
      healthUrl: frontendBaseUrl,
      env: {
        PORT: String(frontendPort),
        NEXT_PUBLIC_AUTOMATION_BASE_URL: automationBaseUrl,
        ...(parsed?.services?.frontend?.env || {}),
      },
    },
    automation: {
      cwd: path.resolve(process.cwd(), parsed?.services?.automation?.cwd || "automation-service"),
      command: parsed?.services?.automation?.command || "npm run start",
      healthUrl: `${automationBaseUrl}/health`,
      env: {
        AUTOMATION_PORT: String(automationPort),
        PORT: String(automationPort),
        AUTOMATION_STORAGE_STATE_PATH:
          parsed?.services?.automation?.storageStatePath || "storageState.json",
        EBAY_TOKENS_PATH: parsed?.services?.automation?.ebayTokensPath || "ebay-tokens.json",
        ...(parsed?.services?.automation?.env || {}),
      },
    },
    monitoring: {
      cwd: path.resolve(process.cwd(), parsed?.services?.monitoring?.cwd || "monitoring-service"),
      command: parsed?.services?.monitoring?.command || "npm run start",
      healthUrl: `${monitoringBaseUrl}/health`,
      env: {
        MONITORING_PORT: String(monitoringPort),
        AUTOMATION_BASE_URL: automationBaseUrl,
        MONITORING_JOB_STORE_PATH:
          parsed?.services?.monitoring?.jobStorePath || "data/removal-jobs.json",
        ...(parsed?.services?.monitoring?.env || {}),
      },
    },
    updates: {
      enabled: updatesEnabled,
      repoCwd: updatesRepoCwd,
      stagingDir: updatesStagingDir,
      pendingFile: updatesPendingFile,
      applyStagedOnStart: updatesApplyOnStart,
      checkIntervalMs: updatesCheckIntervalMs,
      remote: updatesRemote,
      branch: updatesBranch,
      installCommand: updatesInstallCommand,
      automationInstallCommand: updatesAutomationInstallCommand,
      monitoringInstallCommand: updatesMonitoringInstallCommand,
      buildCommand: updatesBuildCommand,
    },
  };
}

let loadedConfig = null;

try {
  loadedConfig = loadConfig(configPath);
} catch (error) {
  console.error(
    colorize(
      `Failed to load config file at ${configPath}: ${error instanceof Error ? error.message : "Unknown error"}`,
      31,
    ),
  );
  process.exit(1);
}

const REQUEST_TIMEOUT_MS = loadedConfig.timing.requestTimeoutMs;
const STATUS_INTERVAL_MS = loadedConfig.timing.statusIntervalMs;
const STARTUP_DELAY_MS = loadedConfig.timing.startupDelayMs;

const services = [
  {
    key: "frontend",
    name: "Frontend",
    color: 36,
    command: loadedConfig.frontend.command,
    cwd: loadedConfig.frontend.cwd,
    env: loadedConfig.frontend.env,
    healthUrl: loadedConfig.frontend.healthUrl,
  },
  {
    key: "automation",
    name: "Automation",
    color: 35,
    command: loadedConfig.automation.command,
    cwd: loadedConfig.automation.cwd,
    env: loadedConfig.automation.env,
    healthUrl: loadedConfig.automation.healthUrl,
  },
  {
    key: "monitoring",
    name: "Monitoring",
    color: 33,
    command: loadedConfig.monitoring.command,
    cwd: loadedConfig.monitoring.cwd,
    env: loadedConfig.monitoring.env,
    healthUrl: loadedConfig.monitoring.healthUrl,
  },
];

const updates = loadedConfig.updates;
let updateTimer = null;
let updateCheckInFlight = false;
const updateState = {
  enabled: updates.enabled,
  lastCheckAt: null,
  pending: readJsonIfExists(updates.pendingFile),
  lastError: "",
};

async function getGitHeadSha(repoCwd, ref) {
  const result = await runShellCommand(`git rev-parse ${ref}`, repoCwd);
  const sha = String(result.stdout || "").trim().split(/\s+/)[0];
  if (!sha) {
    throw new Error(`Unable to resolve git ref: ${ref}`);
  }
  return sha;
}

async function applyPendingUpdate() {
  const pending = readJsonIfExists(updates.pendingFile);
  if (!pending?.remoteHeadSha) {
    return false;
  }

  await runShellCommand(
    `git pull --ff-only ${updates.remote} ${updates.branch}`,
    updates.repoCwd,
  );

  await runShellCommand(updates.installCommand, updates.repoCwd);
  await runShellCommand(updates.automationInstallCommand, loadedConfig.automation.cwd);
  await runShellCommand(updates.monitoringInstallCommand, loadedConfig.monitoring.cwd);

  if (isProd) {
    await runShellCommand(updates.buildCommand, updates.repoCwd);
  }

  try {
    fs.unlinkSync(updates.pendingFile);
  } catch {}

  updateState.pending = null;
  updateState.lastError = "";
  return true;
}

async function stageUpdateIfAvailable() {
  await runShellCommand(`git fetch ${updates.remote} ${updates.branch}`, updates.repoCwd);

  const localHeadSha = await getGitHeadSha(updates.repoCwd, "HEAD");
  const remoteHeadSha = await getGitHeadSha(updates.repoCwd, "FETCH_HEAD");

  updateState.lastCheckAt = new Date().toISOString();

  if (localHeadSha === remoteHeadSha) {
    return false;
  }

  const existingPending = readJsonIfExists(updates.pendingFile);
  if (existingPending?.remoteHeadSha === remoteHeadSha) {
    updateState.pending = existingPending;
    return true;
  }

  const pending = {
    instanceName: loadedConfig.instanceName,
    remote: updates.remote,
    branch: updates.branch,
    localHeadSha,
    remoteHeadSha,
    stagedAt: new Date().toISOString(),
  };
  writeJson(updates.pendingFile, pending);
  updateState.pending = pending;
  return true;
}

async function runUpdateCheck() {
  if (!updates.enabled || updateCheckInFlight || shuttingDown) {
    return;
  }

  updateCheckInFlight = true;
  try {
    await stageUpdateIfAvailable();
    updateState.lastError = "";
  } catch (error) {
    updateState.lastError = error instanceof Error ? error.message : "Update check failed";
  } finally {
    updateCheckInFlight = false;
  }
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

function spawnService(service) {
  const child = spawn(service.command, {
    shell: true,
    cwd: service.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...service.env,
    },
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
    `ListMate Service Hub (${loadedConfig.instanceName})`,
    `Config: ${configPath}`,
    summary,
    `Checked: ${new Date().toLocaleString()}`,
    "",
  ];

  if (updates.enabled) {
    const pending = updateState.pending || readJsonIfExists(updates.pendingFile);
    const updateStatus = pending
      ? colorize("PENDING UPDATE", 33)
      : colorize("No pending update", 32);
    lines.push(`Updater: ${updateStatus}`);
    lines.push(`  source: ${updates.remote}/${updates.branch}`);
    if (updateState.lastCheckAt) {
      lines.push(`  last check: ${new Date(updateState.lastCheckAt).toLocaleString()}`);
    }
    if (pending?.remoteHeadSha) {
      lines.push(`  staged: ${String(pending.remoteHeadSha).slice(0, 12)} (${pending.stagedAt || "unknown time"})`);
    }
    if (updateState.lastError) {
      lines.push(`  error: ${truncate(updateState.lastError, 140)}`);
    }
    lines.push("");
  }

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
    lines.push(`  cmd: ${service.command}`);
    lines.push(`  cwd: ${service.cwd}`);
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
  if (updates.enabled && (updates.applyStagedOnStart || applyStagedUpdateArg)) {
    try {
      const applied = await applyPendingUpdate();
      if (applied) {
        updateState.lastCheckAt = new Date().toISOString();
      }
    } catch (error) {
      updateState.lastError = error instanceof Error ? error.message : "Failed to apply staged update";
    }
  }

  for (const service of services) {
    service.lastLog = `Starting: ${service.command}`;
    spawnService(service);
    await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY_MS));
  }

  if (updates.enabled) {
    void runUpdateCheck();
    updateTimer = setInterval(() => {
      void runUpdateCheck();
    }, updates.checkIntervalMs);
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
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
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

void startAll();

