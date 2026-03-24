import {
  authenticateWithMagicLink,
  buildTextPattern,
  cleanupTempDir,
  clickFirstVisible,
  closeAutomationContext,
  createAutomationPage,
  logStep,
  prepareImageFiles,
  randomDelay,
  waitForAnyVisible,
} from "./common.js";

const DEPOP_LOGIN_URL = "https://www.depop.com/login";
const DEPOP_HOME_URL = "https://www.depop.com/";
const DEPOP_SELL_URL = "https://www.depop.com/sell/";

const PACKAGE_SIZE_KEYWORDS = [
  { size: "Extra Small", keywords: ["ring", "bracelet", "earring", "necklace", "jewelry", "wallet", "cardholder"] },
  { size: "Small", keywords: ["t-shirt", "tee", "top", "shorts", "skirt", "beanie", "cap", "hat", "scarf"] },
  { size: "Medium", keywords: ["pants", "jeans", "sweatpants", "hoodie", "sweater", "dress", "jacket", "shirt"] },
  { size: "Large", keywords: ["coat", "boots", "sneakers", "shoes", "blanket", "bag", "backpack"] },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildExactTextPattern(value) {
  return new RegExp(`^${escapeRegExp(value)}$`, "i");
}

function buildLooseTerms(payload) {
  return [payload.category, payload.brand, payload.condition, payload.size, payload.title, payload.description]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
}

function inferPackageSize(payload) {
  const text = buildLooseTerms(payload);

  for (const option of PACKAGE_SIZE_KEYWORDS) {
    if (option.keywords.some((keyword) => text.includes(keyword))) {
      return option.size;
    }
  }

  return "Medium";
}

async function isLoggedIntoDepop(page) {
  try {
    await page.goto(DEPOP_LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  } catch {
    // Keep the last loaded state and inspect the page directly.
  }

  const currentUrl = page.url().toLowerCase();

  if (!currentUrl.includes("/login")) {
    return true;
  }

  const loginIndicators = [
    page.getByRole("button", { name: /continue with email|log in|sign in/i }),
    page.getByRole("textbox", { name: /email/i }),
    page.getByText(/magic link|enter your email/i),
  ];

  const loginVisible = await waitForAnyVisible(
    page,
    loginIndicators.map((locator) => () => locator),
    2500,
  );

  return !loginVisible;
}

async function isDepopSessionReady(page) {
  const currentUrl = page.url().toLowerCase();

  if (!currentUrl.includes("depop.com")) {
    return false;
  }

  if (!currentUrl.includes("/login")) {
    return true;
  }

  const loggedInIndicators = [
    page.getByRole("link", { name: /^sell now$/i }),
    page.getByRole("button", { name: /^post$/i }),
    page.getByTestId("upload-input__input"),
  ];

  return waitForAnyVisible(
    page,
    loggedInIndicators.map((locator) => () => locator),
    1500,
  );
}

async function ensureDepopSession(page) {
  logStep("depop", "Checking saved Depop session.");

  if (await isLoggedIntoDepop(page)) {
    return;
  }

  throw new Error("Depop is not logged in. Go to Settings and run the magic link login setup again.");
}

async function uploadDepopImages(page, filePaths) {
  if (filePaths.length === 0) {
    logStep("depop", "No images supplied.");
    return;
  }

  const uploadInput = page.getByTestId("upload-input__input");
  await uploadInput.setInputFiles(filePaths);
  logStep("depop", `Uploaded ${filePaths.length} image(s).`);
}

async function fillDepopDescription(page, payload) {
  const descriptionField = page.getByRole("textbox", { name: /description/i }).first();
  const description = [payload.title, payload.description].filter(Boolean).join("\n\n");

  logStep("depop", "Filling description.");
  await descriptionField.click({ delay: 80 });
  await descriptionField.fill(description);
}

async function selectComboboxOption(page, fieldName, value, fallbackValue = value) {
  if (!value && !fallbackValue) {
    return false;
  }

  const combobox = page.getByRole("combobox", { name: new RegExp(fieldName, "i") }).first();
  const desiredValue = String(value || fallbackValue).trim();

  if (!desiredValue) {
    return false;
  }

  await combobox.click({ delay: 80 });

  try {
    await combobox.fill(desiredValue);
  } catch {
    // Some Depop comboboxes are selectable but not fillable.
  }

  await page.waitForTimeout(500);

  const exactOptions = [
    page.getByRole("option", { name: buildExactTextPattern(desiredValue) }),
    page.getByRole("button", { name: buildExactTextPattern(desiredValue) }),
    page.getByText(buildExactTextPattern(desiredValue)),
  ];

  for (const option of exactOptions) {
    try {
      if (await option.first().isVisible({ timeout: 700 })) {
        await option.first().click({ delay: 80 });
        return true;
      }
    } catch {
      // Try next option locator.
    }
  }

  const looseOptions = [
    page.getByRole("option", { name: buildTextPattern(desiredValue) }),
    page.getByRole("button", { name: buildTextPattern(desiredValue) }),
    page.getByText(buildTextPattern(desiredValue)),
  ];

  for (const option of looseOptions) {
    try {
      if (await option.first().isVisible({ timeout: 700 })) {
        await option.first().click({ delay: 80 });
        return true;
      }
    } catch {
      // Try next option locator.
    }
  }

  return false;
}

async function selectDepopCategory(page, payload) {
  const category = payload.category || payload.topCategory || payload.title;

  if (!category) {
    return;
  }

  logStep("depop", "Selecting category.");
  await selectComboboxOption(page, "Category", category, payload.title);
}

async function selectDepopBrand(page, payload) {
  const brand = payload.brand || "Other";
  logStep("depop", "Selecting brand.");
  await selectComboboxOption(page, "Brand", brand, brand);
}

function normalizeConditionValue(condition) {
  const normalized = String(condition || "").trim().toLowerCase();

  if (!normalized) {
    return "Used - Good";
  }

  if (normalized.includes("new")) {
    return "Brand new";
  }

  if (normalized.includes("excellent") || normalized.includes("like new")) {
    return "Used - Excellent";
  }

  if (normalized.includes("fair")) {
    return "Used - Fair";
  }

  return "Used - Good";
}

async function selectDepopCondition(page, payload) {
  const condition = normalizeConditionValue(payload.condition);

  logStep("depop", "Selecting condition.");
  await selectComboboxOption(page, "Condition", condition, "Used - Good");
}

async function selectDepopSize(page, payload) {
  if (!payload.size) {
    return;
  }

  const toggle = page.locator("#variants-toggle-button").first();

  try {
    if (await toggle.isVisible({ timeout: 1000 })) {
      logStep("depop", "Opening size selector.");
      await toggle.click({ delay: 80 });
      await page.waitForTimeout(500);
    }
  } catch {
    return;
  }

  const exactOptions = [
    page.getByRole("button", { name: buildExactTextPattern(String(payload.size)) }),
    page.getByRole("option", { name: buildExactTextPattern(String(payload.size)) }),
    page.getByText(buildExactTextPattern(String(payload.size))),
  ];

  for (const option of exactOptions) {
    try {
      if (await option.first().isVisible({ timeout: 700 })) {
        logStep("depop", "Selecting size.");
        await option.first().click({ delay: 80 });
        return;
      }
    } catch {
      // Try next option locator.
    }
  }

  const looseOption = page.getByText(buildTextPattern(String(payload.size)));

  try {
    if (await looseOption.first().isVisible({ timeout: 700 })) {
      logStep("depop", "Selecting size.");
      await looseOption.first().click({ delay: 80 });
    }
  } catch {
    // Leave size unselected if not found.
  }
}

async function fillDepopPrice(page, payload) {
  const priceField = page.getByTestId("priceAmount__input").first();

  logStep("depop", "Filling price.");
  await priceField.click({ delay: 80 });
  await priceField.fill(String(payload.price));
}

async function selectDepopPackageSize(page, payload) {
  const packageSize = inferPackageSize(payload);
  logStep("depop", "Selecting package size.");
  await selectComboboxOption(page, "Package size", packageSize, "Medium");
}

export async function automateDepop(payload) {
  const { context, page } = await createAutomationPage();
  let tempDir = null;

  try {
    await ensureDepopSession(page);

    logStep("depop", "Opening sell page.");
    await page.goto(DEPOP_SELL_URL, { waitUntil: "domcontentloaded" });
    await randomDelay(page);

    await clickFirstVisible(page, "depop", "Opening seller flow.", [
      (currentPage) => currentPage.getByRole("link", { name: /^sell now$/i }),
    ]);

    const { filePaths, tempDir: nextTempDir } = await prepareImageFiles(payload.imageUrls);
    tempDir = nextTempDir;

    await uploadDepopImages(page, filePaths);
    await randomDelay(page);
    await fillDepopDescription(page, payload);
    await randomDelay(page);
    await selectDepopCategory(page, payload);
    await randomDelay(page);
    await selectDepopBrand(page, payload);
    await randomDelay(page);
    await selectDepopCondition(page, payload);
    await randomDelay(page);
    await selectDepopSize(page, payload);
    await randomDelay(page);
    await fillDepopPrice(page, payload);
    await randomDelay(page);
    await selectDepopPackageSize(page, payload);
    await randomDelay(page);

    logStep("depop", "Submitting listing.");
    await page.getByRole("button", { name: /^post$/i }).click({ delay: 80 });
	
	await page.waitForTimeout(5000);

    return {
      ok: true,
      message: "Depop listing submitted.",
    };
  } finally {
    await cleanupTempDir(tempDir);
    await closeAutomationContext(context);
  }
}

export async function startDepopManualLogin() {
  const { context, page } = await createAutomationPage();

  try {
    logStep("depop", "Opening Depop login flow.");
    await page.goto(DEPOP_LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.bringToFront();
    await page.waitForURL((url) => !url.toString().toLowerCase().includes("/login"), {
      timeout: 15 * 60 * 1000,
    });

    return {
      ok: true,
      message: "Depop login completed and session saved.",
    };
  } finally {
    await closeAutomationContext(context);
  }
}

export async function authenticateDepopMagicLink(magicLink) {
  const { context, page } = await createAutomationPage();

  try {
    await authenticateWithMagicLink({
      page,
      platform: "depop",
      magicLink,
      readyCheck: isDepopSessionReady,
      successUrlPattern: /depop\.com\/(sell|products|feed|home|login\/magic-link)/i,
      postAuthUrl: DEPOP_HOME_URL,
    });

    return {
      ok: true,
      message: "Depop session authenticated from the pasted magic link.",
    };
  } finally {
    await closeAutomationContext(context);
  }
}
