import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const STORAGE_STATE_DIR = path.resolve(process.cwd(), process.env.AUTOMATION_STORAGE_STATE_DIR || "storage");
const TMP_ROOT = path.resolve(process.cwd(), "tmp");

let browserPromise;

export function logStep(platform, message) {
  console.log(`[${platform}] ${message}`);
}

export function logError(platform, error) {
  console.error(`[${platform}] ${error instanceof Error ? error.stack || error.message : String(error)}`);
}

export async function ensureBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: false });
  }

  return browserPromise;
}

function sanitizeUserId(userId) {
  const normalized = String(userId || "default").trim().toLowerCase();
  return normalized.replace(/[^a-z0-9_-]/g, "_").slice(0, 80) || "default";
}

async function ensureStorageStateDir() {
  await fs.mkdir(STORAGE_STATE_DIR, { recursive: true });
}

function getStorageStatePath(userId) {
  return path.join(STORAGE_STATE_DIR, `storage-state.${sanitizeUserId(userId)}.json`);
}

export async function createAutomationContext(userId = "default") {
  await ensureStorageStateDir();
  const browser = await ensureBrowser();
  const storageStatePath = getStorageStatePath(userId);
  const hasStorageState = await fileExists(storageStatePath);

  return browser.newContext(
    hasStorageState
      ? {
          storageState: storageStatePath,
        }
      : undefined,
  );
}

export async function createAutomationPage(userId = "default") {
  const context = await createAutomationContext(userId);
  const page = await context.newPage();

  return { context, page };
}

export async function saveStorageState(context, userId = "default") {
  await ensureStorageStateDir();
  await context.storageState({ path: getStorageStatePath(userId) });
}

export async function closeAutomationContext(context, userId = "default") {
  if (!context) {
    return;
  }

  try {
    await saveStorageState(context, userId);
  } catch {
    // Best effort persistence.
  }

  await context.close();
}

export async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function randomDelay(page, min = 300, max = 1200) {
  const duration = Math.floor(Math.random() * (max - min + 1)) + min;
  await page.waitForTimeout(duration);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function isLocatorVisible(locator) {
  try {
    return await locator.first().isVisible({ timeout: 700 });
  } catch {
    return false;
  }
}

export function buildTextPattern(value) {
  return new RegExp(escapeRegExp(value), "i");
}

export async function fillFirstAvailable(page, label, value, locatorFactories) {
  if (!value) {
    return false;
  }

  for (const createLocator of locatorFactories) {
    const locator = createLocator(page);

    if (!(await isLocatorVisible(locator))) {
      continue;
    }

    logStep(label.platform || "automation", `Filling ${label.name}`);
    await locator.first().click({ delay: 80 });
    await locator.first().fill(String(value));
    return true;
  }

  return false;
}

export async function selectFirstAvailable(page, label, value, locatorFactories) {
  if (!value) {
    return false;
  }

  for (const createLocator of locatorFactories) {
    const locator = createLocator(page);

    if (!(await isLocatorVisible(locator))) {
      continue;
    }

    logStep(label.platform || "automation", `Selecting ${label.name}`);
    await locator.first().click({ delay: 80 });
    await page.waitForTimeout(400);

    const optionLocators = [
      page.getByRole("option", { name: buildTextPattern(String(value)) }),
      page.getByRole("button", { name: buildTextPattern(String(value)) }),
      page.getByRole("link", { name: buildTextPattern(String(value)) }),
      page.getByText(buildTextPattern(String(value))),
    ];

    for (const option of optionLocators) {
      if (await isLocatorVisible(option)) {
        await option.first().click({ delay: 80 });
        return true;
      }
    }

    try {
      await locator.first().fill(String(value));
      await page.waitForTimeout(500);
      const typedOption = page.getByText(buildTextPattern(String(value)));

      if (await isLocatorVisible(typedOption)) {
        await typedOption.first().click({ delay: 80 });
        return true;
      }
    } catch {
      // Some comboboxes are not fillable.
    }
  }

  return false;
}

export async function ensureLoggedIn({
  page,
  platform,
  loginUrl,
  readyCheck,
  userId = "default",
}) {
  if (await readyCheck(page)) {
    return;
  }

  logStep(platform, "Login required. Waiting for manual sign-in.");
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.bringToFront();

  const timeoutAt = Date.now() + 15 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    if ((await readyCheck(page)) || !page.url().includes("/login")) {
      await saveStorageState(page.context(), userId);
      logStep(platform, "Session saved.");
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Timed out waiting for ${platform} login`);
}

export async function authenticateWithMagicLink({
  page,
  platform,
  magicLink,
  readyCheck,
  successUrlPattern,
  postAuthUrl,
  userId = "default",
}) {
  if (!magicLink || !/^https?:\/\//i.test(magicLink)) {
    throw new Error("A valid magic link URL is required");
  }

  logStep(platform, "Opening magic link.");
  await page.goto(magicLink, { waitUntil: "domcontentloaded" });
  await page.bringToFront();

  const timeoutAt = Date.now() + 2 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    if (await readyCheck(page)) {
      await saveStorageState(page.context(), userId);
      logStep(platform, "Magic link accepted. Session saved.");
      return;
    }

    if (successUrlPattern && successUrlPattern.test(page.url())) {
      if (postAuthUrl) {
        logStep(platform, "Magic link accepted. Opening post-auth page.");
        await page.goto(postAuthUrl, { waitUntil: "domcontentloaded" });
        await page.bringToFront();
        await page.waitForTimeout(1500);

        if (await readyCheck(page)) {
          await saveStorageState(page.context(), userId);
          logStep(platform, "Magic link accepted. Session saved.");
          return;
        }
      } else {
        await saveStorageState(page.context(), userId);
        logStep(platform, "Magic link accepted. Session saved.");
        return;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Timed out waiting for ${platform} magic link login`);
}

export async function makeTempDir() {
  const folder = path.join(TMP_ROOT, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.mkdir(folder, { recursive: true });
  return folder;
}

export async function cleanupTempDir(folderPath) {
  if (!folderPath) {
    return;
  }

  await fs.rm(folderPath, { recursive: true, force: true });
}

function extensionFromMime(mimeType) {
  if (mimeType.includes("png")) {
    return ".png";
  }

  if (mimeType.includes("webp")) {
    return ".webp";
  }

  return ".jpg";
}

async function writeDataUrlToFile(dataUrl, directory, index) {
  const matches = dataUrl.match(/^data:(.+?);base64,(.+)$/);

  if (!matches) {
    throw new Error("Invalid data URL image");
  }

  const [, mimeType, base64] = matches;
  const filePath = path.join(directory, `image-${index}${extensionFromMime(mimeType)}`);
  await fs.writeFile(filePath, Buffer.from(base64, "base64"));
  return filePath;
}

async function downloadImageToFile(imageUrl, directory, index) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  const filePath = path.join(directory, `image-${index}${extensionFromMime(contentType)}`);
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

export async function prepareImageFiles(imageUrls = []) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return { tempDir: null, filePaths: [] };
  }

  const tempDir = await makeTempDir();
  const filePaths = [];

  for (const [index, imageUrl] of imageUrls.entries()) {
    if (typeof imageUrl !== "string" || !imageUrl.trim()) {
      continue;
    }

    const filePath = imageUrl.startsWith("data:")
      ? await writeDataUrlToFile(imageUrl, tempDir, index)
      : await downloadImageToFile(imageUrl, tempDir, index);

    filePaths.push(filePath);
  }

  return { tempDir, filePaths };
}

export async function uploadImages(page, platform, filePaths, locatorFactories) {
  if (filePaths.length === 0) {
    logStep(platform, "No images supplied.");
    return;
  }

  for (const createLocator of locatorFactories) {
    const locator = createLocator(page);

    try {
      if ((await locator.count()) > 0) {
        await locator.first().setInputFiles(filePaths);
        logStep(platform, `Uploaded ${filePaths.length} image(s).`);
        return;
      }
    } catch {
      // Try next upload target.
    }
  }

  throw new Error("Could not find an image upload input");
}

export async function clickFirstVisible(page, platform, stepName, locatorFactories) {
  for (const createLocator of locatorFactories) {
    const locator = createLocator(page);

    if (!(await isLocatorVisible(locator))) {
      continue;
    }

    logStep(platform, stepName);
    await locator.first().click({ delay: 80 });
    return true;
  }

  return false;
}

export async function waitForAnyVisible(page, locatorFactories, timeout = 10000) {
  const timeoutAt = Date.now() + timeout;

  while (Date.now() < timeoutAt) {
    for (const createLocator of locatorFactories) {
      const locator = createLocator(page);

      if (await isLocatorVisible(locator)) {
        return true;
      }
    }

    await page.waitForTimeout(250);
  }

  return false;
}
