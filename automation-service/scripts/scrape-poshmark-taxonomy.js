import fs from "node:fs/promises";
import path from "node:path";

import { closeAutomationContext, createAutomationPage, ensureLoggedIn, logStep } from "../src/automation/common.js";

const POSHMARK_SELL_URL = "https://poshmark.com/sell";
const POSHMARK_LOGIN_URL = "https://poshmark.com/login";
const DEFAULT_OUTPUT = path.resolve(process.cwd(), "data", "poshmark-taxonomy.json");
const TOP_CATEGORIES = ["Women", "Men", "Kids", "Home", "Pets", "Electronics"];
const CATEGORY_UI_SKIP = new Set(["all categories", "shop all", "done", "cancel", "save", "next", "back", "apply"]);
const SIZE_UI_SKIP = new Set(["done", "cancel", "save", "next", "back", "apply", "custom"]);

function parseArgs(argv) {
  const parsed = { userId: "default", output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--userId" && value) {
      parsed.userId = value;
      index += 1;
      continue;
    }
    if (token === "--output" && value) {
      parsed.output = path.resolve(process.cwd(), value);
      index += 1;
    }
  }
  return parsed;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toExactRegex(text) {
  const escaped = String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escaped}\\s*$`, "i");
}

async function maximizeWindow(page) {
  try {
    const session = await page.context().newCDPSession(page);
    const { windowId } = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
    return;
  } catch {
    // Fall back below.
  }

  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
  } catch {
    // Best effort only.
  }
}

async function openCategoryPicker(page) {
  const selector = page.locator(".dropdown__selector.dropdown__selector--select-tag").first();
  await selector.click({ timeout: 8000 });
  await page.waitForTimeout(400);
}

async function openSizePicker(page) {
  const selector = page.locator('[data-test="size"]').first();
  await selector.click({ timeout: 8000 });
  await page.waitForTimeout(400);
}

async function clickExactVisibleItem(page, text) {
  const exact = toExactRegex(text);
  const candidates = [
    page.getByRole("link", { name: exact }).first(),
    page.getByRole("listitem", { name: exact }).first(),
    page.getByRole("option", { name: exact }).first(),
    page.getByRole("button", { name: exact }).first(),
    page.locator("a").filter({ hasText: exact }).first(),
    page.locator("li").filter({ hasText: exact }).first(),
    page.getByText(exact).first(),
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
}

async function collectVisibleMenuItems(page, skipSet) {
  const items = await page.evaluate(({ skipItems, topCategories }) => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (rect.width < 16 || rect.height < 10) return false;
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    const roots = Array.from(
      document.querySelectorAll(".dropdown__menu, [role='listbox'], .dropdown__content, .dropdown, .modal"),
    ).filter((root) => root instanceof HTMLElement && visible(root));

    let bestRoot = null;
    let bestScore = -1;
    for (const root of roots) {
      const score = root.querySelectorAll("li, [role='listitem'], [role='option'], a, button").length;
      if (score > bestScore) {
        bestScore = score;
        bestRoot = root;
      }
    }

    if (!bestRoot) {
      return [];
    }

    const out = [];
    const seen = new Set();
    const topSet = new Set(topCategories.map((entry) => entry.toLowerCase()));
    const skip = new Set(skipItems.map((entry) => entry.toLowerCase()));
    const nodes = bestRoot.querySelectorAll("li, [role='listitem'], [role='option'], a, button");
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!visible(node)) continue;
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const lowered = text.toLowerCase();
      if (seen.has(lowered) || skip.has(lowered) || topSet.has(lowered)) continue;
      seen.add(lowered);
      out.push(text);
    }

    return out;
  }, { skipItems: [...skipSet], topCategories: TOP_CATEGORIES });

  return items.map(normalizeText).filter(Boolean);
}

async function clickDoneIfPresent(page) {
  const doneCandidates = [
    page.getByRole("button", { name: /^done$/i }).first(),
    page.getByText(/^done$/i).first(),
  ];

  for (const candidate of doneCandidates) {
    try {
      if (await candidate.isVisible({ timeout: 600 })) {
        await candidate.click({ timeout: 2000 });
        return true;
      }
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

function createReadyCheck() {
  return async (page) => {
    const readyLocators = [
      page.getByRole("textbox", { name: /what are you selling/i }),
      page.locator(".dropdown__selector.dropdown__selector--select-tag").first(),
      page.locator('[data-test="size"]').first(),
    ];

    for (const locator of readyLocators) {
      try {
        if (await locator.isVisible({ timeout: 700 })) {
          return true;
        }
      } catch {
        // Continue checking.
      }
    }

    return false;
  };
}

async function gotoSellComposer(page) {
  await page.goto(POSHMARK_SELL_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
}

async function enterTopCategory(page, topCategory) {
  await gotoSellComposer(page);
  await openCategoryPicker(page);
  const selected = await clickExactVisibleItem(page, topCategory);
  if (!selected) {
    return false;
  }
  await page.waitForTimeout(1000);
  return true;
}

async function collectSubcategories(page, topCategory) {
  const ready = await enterTopCategory(page, topCategory);
  if (!ready) {
    return [];
  }

  return collectVisibleMenuItems(page, CATEGORY_UI_SKIP);
}

async function collectSizesForSubcategory(page, topCategory, subcategory) {
  const ready = await enterTopCategory(page, topCategory);
  if (!ready) {
    throw new Error(`Could not re-enter top category "${topCategory}".`);
  }

  const selectedSubcategory = await clickExactVisibleItem(page, subcategory);
  if (!selectedSubcategory) {
    throw new Error(`Could not select subcategory "${topCategory} > ${subcategory}".`);
  }
  await page.waitForTimeout(600);

  await openSizePicker(page);
  const hasCustomTab = await clickExactVisibleItem(page, "Custom");
  if (hasCustomTab) {
    // Switch back to the preset size list before scraping visible sizes.
    await openSizePicker(page).catch(() => {});
  }

  const sizes = await collectVisibleMenuItems(page, SIZE_UI_SKIP);
  await clickDoneIfPresent(page).catch(() => {});

  return {
    sizes,
    hasCustomSize: hasCustomTab,
  };
}

async function scrapeTaxonomy(page) {
  const taxonomy = {
    capturedAt: new Date().toISOString(),
    source: POSHMARK_SELL_URL,
    notes: [
      "Captured from the live authenticated Poshmark sell flow.",
      "Public support pages do not expose the full category and size matrix.",
    ],
    topCategories: [],
  };

  for (const topCategory of TOP_CATEGORIES) {
    logStep("poshmark-taxonomy", `Scraping top category: ${topCategory}`);
    const subcategoryNames = await collectSubcategories(page, topCategory);
    const subcategories = [];

    for (const subcategory of subcategoryNames) {
      logStep("poshmark-taxonomy", `  Scraping ${topCategory} > ${subcategory}`);
      try {
        const { sizes, hasCustomSize } = await collectSizesForSubcategory(page, topCategory, subcategory);
        subcategories.push({
          name: subcategory,
          sizes,
          hasCustomSize,
        });
      } catch (error) {
        subcategories.push({
          name: subcategory,
          sizes: [],
          hasCustomSize: false,
          scrapeError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    taxonomy.topCategories.push({
      name: topCategory,
      subcategories,
    });
  }

  return taxonomy;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { context, page } = await createAutomationPage(args.userId);

  try {
    logStep("poshmark-taxonomy", "Opening sell page.");
    await maximizeWindow(page);
    await page.goto(POSHMARK_SELL_URL, { waitUntil: "domcontentloaded" });

    if (page.url().toLowerCase().includes("/login")) {
      await ensureLoggedIn({
        page,
        platform: "poshmark",
        loginUrl: POSHMARK_LOGIN_URL,
        readyCheck: createReadyCheck(),
        userId: args.userId,
      });
    }

    const taxonomy = await scrapeTaxonomy(page);
    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, `${JSON.stringify(taxonomy, null, 2)}\n`, "utf8");

    logStep("poshmark-taxonomy", `Saved taxonomy to ${args.output}`);
    console.log(
      JSON.stringify(
        {
          ok: true,
          output: args.output,
          topCategories: taxonomy.topCategories.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeAutomationContext(context, args.userId);
  }
}

main().catch((error) => {
  console.error(`[poshmark-taxonomy] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
