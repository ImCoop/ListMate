import {
  closeAutomationContext,
  cleanupTempDir,
  createAutomationPage,
  ensureLoggedIn,
  fillFirstAvailable,
  logStep,
  prepareImageFiles,
  randomDelay,
  uploadImages,
} from "./common.js";
import fs from "node:fs";
import path from "node:path";

const POSHMARK_CREATE_URL = "https://poshmark.com/sell";
const POSHMARK_LOGIN_URL = "https://poshmark.com/login";
const POSHMARK_CATEGORY_MAP_JSON_PATH = path.resolve(process.cwd(), "data", "poshmark-category-map.json");

function normalizeCategoryKey(value) {
  return String(value || "").trim().toLowerCase();
}

function buildCategoryIndexFromJsonFile(raw) {
  const parsed = JSON.parse(raw);
  const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
  const indexMap = {};

  for (const category of categories) {
    const topName = normalizeCategoryKey(category?.topCategory);
    if (!topName) {
      continue;
    }

    const subcategories = Array.isArray(category?.subcategories) ? category.subcategories : [];
    const leafMap = {};

    for (const item of subcategories) {
      const leafName = normalizeCategoryKey(item?.subcategory);
      const index = Number(item?.index);
      if (!leafName || !Number.isInteger(index) || index < 0) {
        continue;
      }

      if (!(leafName in leafMap)) {
        leafMap[leafName] = index;
      }
    }

    if (Object.keys(leafMap).length > 0) {
      indexMap[topName] = leafMap;
    }
  }

  return indexMap;
}

function loadPoshmarkCategoryIndexMap() {
  try {
    if (fs.existsSync(POSHMARK_CATEGORY_MAP_JSON_PATH)) {
      const raw = fs.readFileSync(POSHMARK_CATEGORY_MAP_JSON_PATH, "utf8");
      const map = buildCategoryIndexFromJsonFile(raw);
      if (Object.keys(map).length > 0) {
        return map;
      }
    }
  } catch {
    // No usable json map.
  }

  return {};
}

const POSHMARK_CATEGORY_INDEX_MAP = loadPoshmarkCategoryIndexMap();

async function assertNoPageNotFound(page, contextLabel) {
  const title = String(await page.title().catch(() => "")).trim();

  if (/page not found/i.test(title)) {
    throw new Error(
      `Poshmark returned a Page Not Found screen${contextLabel ? ` (${contextLabel})` : ""}. URL: ${page.url()}`,
    );
  }
}

function normalizeUrl(value) {
  return String(value || "").split("#")[0].split("?")[0];
}

function isPoshmarkListingUrl(value) {
  return /poshmark\.com\/listing\//i.test(String(value || ""));
}

async function resolvePostedPoshmarkListingUrl(page) {
  await page.waitForTimeout(2500);
  await page.locator(".card").first().click({ timeout: 10000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1200);

  const listingUrl = normalizeUrl(page.url());

  if (!isPoshmarkListingUrl(listingUrl)) {
    throw new Error("Poshmark listing URL was not captured after posting.");
  }

  return listingUrl;
}

function createReadyCheck() {
  return async (page) => {
    const readyLocators = [
      page.getByRole("textbox", { name: /what are you selling/i }),
      page.locator(".dropdown__selector.dropdown__selector--select-tag").first(),
      page.locator('[data-test="size"]'),
    ];

    for (const locator of readyLocators) {
      try {
        if (await locator.first().isVisible({ timeout: 800 })) {
          return true;
        }
      } catch {
        // Keep checking.
      }
    }

    return false;
  };
}

function normalizeCondition(value) {
  const lowered = String(value || "").toLowerCase();

  if (lowered.includes("new")) {
    return /new with tags|nwt|new/i;
  }

  if (lowered.includes("excellent")) {
    return /excellent/i;
  }

  if (lowered.includes("fair")) {
    return /fair/i;
  }

  return /good/i;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandKidsCustomSize(size) {
  const normalized = String(size || "").trim();
  const upper = normalized.toUpperCase();
  const customSizeMap = {
    XXS: "XX Small",
    XS: "X Small",
    S: "Small",
    M: "Medium",
    L: "Large",
    XL: "X Large",
    XXL: "XX Large",
    XXXL: "XXX Large",
  };

  return customSizeMap[upper] || normalized;
}

async function openSellComposer(page) {
  try {
    const sellLink = page.getByRole("banner").getByRole("link", { name: /sell on poshmark/i });
    if (await sellLink.isVisible({ timeout: 1500 })) {
      await sellLink.click();
      return;
    }
  } catch {
    // Continue on current page.
  }
}

async function fillDescriptionField(page, value) {
  const specificField = page.getByRole("textbox", { name: /^form__text$/i });

  try {
    const count = await specificField.count();

    if (count > 1) {
      await specificField.nth(1).click();
      await specificField.nth(1).fill(String(value));
      return true;
    }

    if (count === 1) {
      await specificField.first().click();
      await specificField.first().fill(String(value));
      return true;
    }
  } catch {
    // Fall back below.
  }

  return fillFirstAvailable(page, { platform: "poshmark", name: "description" }, value, [
    (currentPage) => currentPage.getByLabel(/description/i),
    (currentPage) => currentPage.getByPlaceholder(/description/i),
    (currentPage) => currentPage.getByRole("textbox", { name: /description/i }),
  ]);
}

async function selectCategory(page, topCategory, subcategory) {
  const categoryDropdown = page.locator(".dropdown__selector.dropdown__selector--select-tag").first();
  const openCategoryDropdown = async () => {
    await categoryDropdown.click();
    await page.waitForTimeout(300);
  };

  const tryClickExactListValue = async (value) => {
    const exactPattern = new RegExp(`^\\s*${escapeRegExp(String(value).trim())}\\s*$`, "i");
    const candidates = [
      page.getByRole("link", { name: exactPattern }).first(),
      page.getByRole("listitem", { name: exactPattern }).first(),
      page.getByRole("option", { name: exactPattern }).first(),
      page.locator("a").filter({ hasText: exactPattern }).first(),
      page.locator("li").filter({ hasText: exactPattern }).first(),
      page.getByText(exactPattern).first(),
    ];

    for (const candidate of candidates) {
      try {
        if (await candidate.isVisible({ timeout: 900 })) {
          await candidate.scrollIntoViewIfNeeded().catch(() => {});
          await candidate.click({ timeout: 3000 });
          return true;
        }
      } catch {
        // Try next selector.
      }
    }

    return false;
  };

  const dropdownContainsText = async (value) => {
    const pattern = new RegExp(escapeRegExp(String(value).trim()), "i");
    try {
      const text = await categoryDropdown.innerText({ timeout: 1200 });
      return pattern.test(text);
    } catch {
      return false;
    }
  };

  const isSubcategoryVisibleInOpenList = async (value) => {
    const exactPattern = new RegExp(`^\\s*${escapeRegExp(String(value).trim())}\\s*$`, "i");
    const candidates = [
      page.getByRole("listitem").filter({ hasText: exactPattern }).first(),
      page.getByRole("option", { name: exactPattern }).first(),
      page.locator("li").filter({ hasText: exactPattern }).first(),
      page.locator("a").filter({ hasText: exactPattern }).first(),
      page.getByText(exactPattern).first(),
    ];

    for (const candidate of candidates) {
      try {
        if (await candidate.isVisible({ timeout: 900 })) {
          return true;
        }
      } catch {
        // Try next selector.
      }
    }

    return false;
  };

  await openCategoryDropdown();

  const resolvedTopCategory = String(topCategory || "Women");
  if (!(await tryClickExactListValue(resolvedTopCategory))) {
    throw new Error(`Unable to select Poshmark top category "${resolvedTopCategory}".`);
  }

  // Give Poshmark time to load the second-level leaf list after top-level selection.
  await page.waitForTimeout(1000);

  if (subcategory) {
    const normalizedSubcategory = String(subcategory).trim();

    if (!(await isSubcategoryVisibleInOpenList(normalizedSubcategory))) {
      // Retry top-category selection once in case the menu did not switch levels.
      await openCategoryDropdown();
      if (!(await tryClickExactListValue(resolvedTopCategory))) {
        throw new Error(`Unable to re-select Poshmark top category "${resolvedTopCategory}".`);
      }
      await page.waitForTimeout(1000);
    }

    const trySelectSubcategory = async () => {
      const subcategoryCandidates = [
        page.getByRole("listitem").filter({ hasText: new RegExp(`^\\s*${escapeRegExp(normalizedSubcategory)}\\s*$`, "i") }).first(),
        page.getByRole("option", { name: new RegExp(`^\\s*${escapeRegExp(normalizedSubcategory)}\\s*$`, "i") }).first(),
        page.getByRole("button", { name: new RegExp(`^\\s*${escapeRegExp(normalizedSubcategory)}\\s*$`, "i") }).first(),
        page.locator("li").filter({ hasText: new RegExp(`^\\s*${escapeRegExp(normalizedSubcategory)}\\s*$`, "i") }).first(),
        page.locator("a").filter({ hasText: new RegExp(`^\\s*${escapeRegExp(normalizedSubcategory)}\\s*$`, "i") }).first(),
        page.getByText(new RegExp(`^\\s*${escapeRegExp(normalizedSubcategory)}\\s*$`, "i")).first(),
      ];

      for (const candidate of subcategoryCandidates) {
        try {
          if (await candidate.isVisible({ timeout: 1200 })) {
            await candidate.scrollIntoViewIfNeeded().catch(() => {});
            await candidate.click({ timeout: 3000 });
            await page.waitForTimeout(350);
            if (await dropdownContainsText(normalizedSubcategory)) {
              return true;
            }
          }
        } catch {
          // Try next selector.
        }
      }

      return false;
    };

    if (await trySelectSubcategory()) {
      return;
    }

    const topKey = normalizeCategoryKey(resolvedTopCategory);
    const leafKey = normalizeCategoryKey(normalizedSubcategory);
    const mappedIndex = POSHMARK_CATEGORY_INDEX_MAP?.[topKey]?.[leafKey];
    if (Number.isInteger(mappedIndex) && mappedIndex >= 0) {
      try {
        const firstLeafCandidates = [
          page.getByRole("listitem").first(),
          page.getByRole("option").first(),
          page.locator("li").first(),
        ];

        for (const firstLeaf of firstLeafCandidates) {
          try {
            if (await firstLeaf.isVisible({ timeout: 1000 })) {
              await firstLeaf.click({ timeout: 2000 });
              break;
            }
          } catch {
            // Try next focus target.
          }
        }

        await page.keyboard.press("Home").catch(() => {});
        await page.waitForTimeout(120);

        for (let step = 0; step < mappedIndex; step += 1) {
          await page.keyboard.press("ArrowDown");
          await page.waitForTimeout(90);
        }

        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
        if (await dropdownContainsText(normalizedSubcategory)) {
          return;
        }
      } catch {
        // Fall through to final retry below.
      }
    }

    // Retry once after reopening selector to handle intermittent popup rerender.
    await openCategoryDropdown();
    await page.waitForTimeout(400);
    if (!(await tryClickExactListValue(resolvedTopCategory))) {
      throw new Error(`Unable to re-open top category "${resolvedTopCategory}" during retry.`);
    }
    await page.waitForTimeout(1000);
    if (await trySelectSubcategory()) {
      return;
    }

    throw new Error(`Unable to select Poshmark subcategory "${normalizedSubcategory}".`);
  }
}

async function selectInventoryMode(page, quantity) {
  await page.getByRole("button", { name: /single item/i }).click();
}

async function selectSize(page, size, topCategory) {
  if (!size) {
    return;
  }

  await page.locator('[data-test="size"]').click();

  if (String(topCategory || "").trim().toLowerCase() === "kids") {
    const customSizeValue = expandKidsCustomSize(size);
    const customTabCandidates = [
      page.getByRole("tab", { name: /custom/i }).first(),
      page.getByRole("button", { name: /custom/i }).first(),
      page.getByText(/^custom$/i).first(),
    ];

    let openedCustomTab = false;
    for (const candidate of customTabCandidates) {
      try {
        if (await candidate.isVisible({ timeout: 1200 })) {
          await candidate.click({ timeout: 3000 });
          openedCustomTab = true;
          break;
        }
      } catch {
        // Try next candidate.
      }
    }

    if (!openedCustomTab) {
      throw new Error("Could not open Poshmark custom size tab for Kids listing.");
    }

    const customInputCandidates = [
      page.getByRole("textbox").first(),
      page.locator('input[type="text"]').first(),
      page.locator("input").first(),
      page.locator("textarea").first(),
    ];

    let filledCustomSize = false;
    for (const input of customInputCandidates) {
      try {
        if (await input.isVisible({ timeout: 1200 })) {
          await input.click({ timeout: 2000 });
          await input.fill(customSizeValue);
          filledCustomSize = true;
          break;
        }
      } catch {
        // Try next input candidate.
      }
    }

    if (!filledCustomSize) {
      throw new Error(`Could not fill custom Poshmark size "${customSizeValue}" for Kids listing.`);
    }

    const saveCandidates = [
      page.getByRole("button", { name: /^save$/i }).first(),
      page.getByText(/^save$/i).first(),
    ];

    let savedCustomSize = false;
    for (const candidate of saveCandidates) {
      try {
        if (await candidate.isVisible({ timeout: 1200 })) {
          await candidate.click({ timeout: 3000 });
          savedCustomSize = true;
          break;
        }
      } catch {
        // Try next save candidate.
      }
    }

    if (!savedCustomSize) {
      throw new Error(`Could not save custom Poshmark size "${customSizeValue}" for Kids listing.`);
    }

    await page.waitForTimeout(300);

    try {
      await page.getByRole("button", { name: /^done$/i }).click({ timeout: 1500 });
    } catch {
      // Some flows close automatically after saving.
    }

    return;
  }

  const exactSizeIdButton = page.locator(`button#size-${String(size)}`);
  const exactSizeButton = page.getByRole("button", { name: String(size), exact: true });
  const exactSizeOption = page.getByRole("option", { name: String(size), exact: true });
  const looseSizeButton = page.getByText(new RegExp(`^${escapeRegExp(String(size))}$`, "i"));

  try {
    if (await exactSizeIdButton.first().isVisible({ timeout: 1200 })) {
      await exactSizeIdButton.first().click();
      return;
    }
  } catch {
    // Keep checking alternate size paths.
  }

  try {
    if (await exactSizeButton.first().isVisible({ timeout: 1200 })) {
      await exactSizeButton.first().click();
      return;
    }
  } catch {
    // Keep checking alternate size paths.
  }

  try {
    if (await exactSizeOption.first().isVisible({ timeout: 700 })) {
      await exactSizeOption.first().click();
      return;
    }
  } catch {
    // Keep checking alternate size paths.
  }

  try {
    if (await looseSizeButton.first().isVisible({ timeout: 700 })) {
      await looseSizeButton.first().click();
      return;
    }
  } catch {
    // No existing visible match found.
  }
  logStep("poshmark", `No existing size match found for "${size}". Leaving size unselected.`);

  try {
    await page.getByRole("button", { name: /^done$/i }).click({ timeout: 700 });
  } catch {
    // Size chooser may already be closed.
  }
}

async function selectCondition(page, condition) {
  await page.getByText(/select condition/i).click();
  await page.getByText(normalizeCondition(condition)).first().click();
}

async function fillPrice(page, price) {
  const numericRequiredInput = page.locator(
    'input.listing-price-input[placeholder="*Required"][type="number"]',
  );

  try {
    if (await numericRequiredInput.first().isVisible({ timeout: 1200 })) {
      await numericRequiredInput.first().click();
      await numericRequiredInput.first().fill(String(price));
      return;
    }
  } catch {
    // Fall back to alternate price selectors below.
  }

  const listingPriceInput = page.locator('[data-vv-name="listingPrice"]');

  try {
    if (await listingPriceInput.first().isVisible({ timeout: 1200 })) {
      await listingPriceInput.first().click();
	  await page.wait(1000);
      await listingPriceInput.first().fill(String(price));
      return;
    }
  } catch {
    // Fall back to older selectors below.
  }

  const requiredInputs = page.getByPlaceholder("*Required");
  const requiredCount = await requiredInputs.count();

  if (requiredCount >= 3) {
    await requiredInputs.nth(2).fill(String(price));
    return;
  }

  await fillFirstAvailable(page, { platform: "poshmark", name: "price" }, price, [
    (currentPage) => currentPage.getByLabel(/price/i),
    (currentPage) => currentPage.getByPlaceholder(/\$|price/i),
    (currentPage) => currentPage.getByRole("spinbutton", { name: /form__text/i }),
  ]);
}

async function fillBrand(page, brand) {
  if (!brand) {
    return;
  }

  const brandInput = page.getByPlaceholder("Enter the Brand/Designer");
  await brandInput.click();
  await brandInput.fill(String(brand));
  await page.waitForTimeout(500);

  const exactMatch = page.getByText(new RegExp(`^${escapeRegExp(String(brand))}$`, "i"));

  try {
    await exactMatch.first().click({ timeout: 1000 });
    return;
  } catch {
    // Fall back to enter when the site accepts a custom brand or first suggestion.
  }

  await brandInput.press("Enter");
}

export async function automatePoshmark(payload) {
  const userId = payload?.userId || "default";
  const { context, page } = await createAutomationPage(userId);
  let tempDir = null;

  try {
    logStep("poshmark", "Opening create listing page.");
    await page.goto(POSHMARK_CREATE_URL, { waitUntil: "domcontentloaded" });
    await assertNoPageNotFound(page, "open create listing");
    await ensureLoggedIn({
      page,
      platform: "poshmark",
      loginUrl: POSHMARK_LOGIN_URL,
      readyCheck: createReadyCheck(),
      userId,
    });

    await page.goto(POSHMARK_CREATE_URL, { waitUntil: "domcontentloaded" });
    await assertNoPageNotFound(page, "open create listing after login");
    await openSellComposer(page);
    await randomDelay(page);

    const { filePaths, tempDir: nextTempDir } = await prepareImageFiles(payload.imageUrls);
    tempDir = nextTempDir;

    await page.locator("div").filter({ hasText: /^ADD PHOTOS & VIDEO$/ }).first().click();
    await uploadImages(page, "poshmark", filePaths, [
      (currentPage) => currentPage.getByRole("button", { name: /img-file-input/i }),
      (currentPage) => currentPage.locator('input[type="file"]'),
    ]);

    await page.getByRole("button", { name: /^apply$/i }).click();
    await randomDelay(page);

    await fillFirstAvailable(page, { platform: "poshmark", name: "title" }, payload.title, [
      (currentPage) => currentPage.getByRole("textbox", { name: /what are you selling/i }),
    ]);

    await randomDelay(page);
    await fillDescriptionField(page, payload.description);

    await randomDelay(page);
    await selectCategory(page, payload.topCategory, payload.category);

    await randomDelay(page);
    await selectInventoryMode(page, payload.quantity);

    await randomDelay(page);
    await selectSize(page, payload.size, payload.topCategory);

    await randomDelay(page);
    await selectCondition(page, payload.condition);

    await randomDelay(page);
    await fillBrand(page, payload.brand);

    await randomDelay(page);
    await fillPrice(page, payload.price);

    await page.getByRole("button", { name: /^done$/i }).click();
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.getByRole("button", { name: /list this item/i }).click();

    const listingUrl = await resolvePostedPoshmarkListingUrl(page);

    logStep("poshmark", "Listing submitted.");

    return {
      ok: true,
      message: "Poshmark listing submitted.",
      listingUrl,
    };
  } finally {
    await cleanupTempDir(tempDir);
    await closeAutomationContext(context, userId);
  }
}

export async function startPoshmarkManualLogin({ userId } = {}) {
  const resolvedUserId = userId || "default";
  const { context, page } = await createAutomationPage(resolvedUserId);

  try {
    logStep("poshmark", "Opening Poshmark login flow.");
    await page.goto(POSHMARK_CREATE_URL, { waitUntil: "domcontentloaded" });
    await assertNoPageNotFound(page, "manual login start");
    await ensureLoggedIn({
      page,
      platform: "poshmark",
      loginUrl: POSHMARK_LOGIN_URL,
      readyCheck: createReadyCheck(),
      userId: resolvedUserId,
    });

    return {
      ok: true,
      message: "Poshmark login completed and session saved.",
    };
  } finally {
    await closeAutomationContext(context, resolvedUserId);
  }
}

export async function removePoshmarkListing({ listingId, url, userId }) {
  const listingUrl = String(url || "").trim();
  const resolvedUserId = userId || "default";

  if (!listingUrl) {
    return {
      ok: false,
      error: "A Poshmark listing URL is required for removal.",
    };
  }

  if (!/poshmark\.com\/listing\//i.test(listingUrl)) {
    return {
      ok: false,
      error: "Poshmark removal requires a listing URL (https://poshmark.com/listing/...), not a closet/profile URL.",
    };
  }

  const { context, page } = await createAutomationPage(resolvedUserId);

  try {
    logStep("poshmark", `Opening listing for removal: ${listingUrl}`);
    await page.goto(listingUrl, { waitUntil: "domcontentloaded" });
    await assertNoPageNotFound(page, "open listing for removal");

    if (page.url().includes("/login")) {
      await ensureLoggedIn({
        page,
        platform: "poshmark",
        loginUrl: POSHMARK_LOGIN_URL,
        readyCheck: async (currentPage) => !currentPage.url().includes("/login"),
        userId: resolvedUserId,
      });

      await page.goto(listingUrl, { waitUntil: "domcontentloaded" });
      await assertNoPageNotFound(page, "open listing for removal after login");
    }

    logStep("poshmark", "Opening edit listing menu.");
    await page.getByText(/edit listing/i).first().click({ timeout: 10000 });

    logStep("poshmark", "Setting Availability to Not For Sale.");
    await page.waitForTimeout(900);

    const availabilityLabel = page.getByText(/^availability$/i).first();
    try {
      if (await availabilityLabel.isVisible({ timeout: 1500 })) {
        await availabilityLabel.click({ timeout: 3000 });
      }
    } catch {
      // Continue to fallback selector path.
    }

    const availabilitySelectorCandidates = [
      page.locator('[data-test*="availability"]').first(),
      page.locator("button").filter({ hasText: /for sale|not for sale/i }).first(),
      page.locator(".dropdown__selector").filter({ hasText: /for sale|not for sale/i }).first(),
      page.locator("div").filter({ hasText: /^for sale$/i }).first(),
    ];

    let openedAvailability = false;
    for (const selector of availabilitySelectorCandidates) {
      try {
        if (await selector.isVisible({ timeout: 900 })) {
          await selector.click({ timeout: 3000 });
          openedAvailability = true;
          break;
        }
      } catch {
        // Try next selector.
      }
    }

    if (!openedAvailability) {
      throw new Error("Could not open Availability selector on Poshmark edit page.");
    }

    const notForSaleOptionCandidates = [
      page.getByRole("option", { name: /not for sale/i }).first(),
      page.getByRole("button", { name: /not for sale/i }).first(),
      page.getByText(/^not for sale$/i).first(),
      page.locator("li").filter({ hasText: /not for sale/i }).first(),
      page.locator("a").filter({ hasText: /not for sale/i }).first(),
    ];

    let selectedNotForSale = false;
    for (const option of notForSaleOptionCandidates) {
      try {
        if (await option.isVisible({ timeout: 1200 })) {
          await option.click({ timeout: 4000 });
          selectedNotForSale = true;
          break;
        }
      } catch {
        // Try next option selector.
      }
    }

    if (!selectedNotForSale) {
      throw new Error("Could not select 'Not For Sale' in Availability.");
    }

    const saveButtonCandidates = [
      page.getByRole("button", { name: /^next$/i }).first(),
      page.getByRole("button", { name: /^done$/i }).first(),
      page.getByRole("button", { name: /^save$/i }).first(),
      page.getByRole("button", { name: /update listing/i }).first(),
      page.getByRole("button", { name: /list this item/i }).first(),
    ];

    for (const button of saveButtonCandidates) {
      try {
        if (await button.isVisible({ timeout: 1200 })) {
          await button.click({ timeout: 5000 });
          break;
        }
      } catch {
        // Keep trying next save candidate.
      }
    }

    await page.waitForTimeout(1500);

    return {
      ok: true,
      message: `Poshmark listing set to Not For Sale${listingId ? ` (${listingId})` : ""}.`,
      listingUrl,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Poshmark listing removal failed.",
    };
  } finally {
    await closeAutomationContext(context, resolvedUserId);
  }
}
