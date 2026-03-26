import fs from "node:fs/promises";
import path from "node:path";

import { closeAutomationContext, createAutomationPage, ensureLoggedIn, logStep } from "../src/automation/common.js";

const POSHMARK_SELL_URL = "https://poshmark.com/sell";
const POSHMARK_LOGIN_URL = "https://poshmark.com/login";
const DEFAULT_OUTPUT = path.resolve(process.cwd(), "data", "poshmark-category-tree.json");
const TOP_CATEGORIES = ["Women", "Men", "Kids", "Home", "Pets", "Electronics"];
const UI_SKIP = new Set(["all categories", "shop all", "done", "cancel", "save", "next", "back", "apply"]);

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
    // fallback
  }
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
  } catch {
    // best effort
  }
}

async function openCategoryPicker(page) {
  const selector = page.locator(".dropdown__selector.dropdown__selector--select-tag").first();
  await selector.click({ timeout: 8000 });
  await page.waitForTimeout(450);
}

async function clickTopCategory(page, topCategory) {
  const exact = toExactRegex(topCategory);
  const candidates = [
    page.locator("a").filter({ hasText: exact }).first(),
    page.getByRole("link", { name: exact }).first(),
    page.getByText(exact).first(),
  ];
  for (const candidate of candidates) {
    try {
      if ((await candidate.count()) > 0) {
        await candidate.click({ timeout: 3000 });
        await page.waitForTimeout(500);
        return true;
      }
    } catch {
      // try next
    }
  }
  return false;
}

async function activeMenuItems(page) {
  const items = await page.evaluate(() => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (rect.width < 16 || rect.height < 10) return false;
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    const roots = Array.from(
      document.querySelectorAll(".dropdown__menu, [role='listbox'], .dropdown__content, .dropdown"),
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
    const nodes = bestRoot.querySelectorAll("li, [role='listitem'], [role='option'], a, button");
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!visible(node)) continue;
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const lowered = text.toLowerCase();
      if (seen.has(lowered)) continue;
      seen.add(lowered);
      out.push(text);
    }
    return out;
  });

  const topSet = new Set(TOP_CATEGORIES.map((item) => item.toLowerCase()));
  return items
    .map(normalizeText)
    .filter((entry) => entry && !UI_SKIP.has(entry.toLowerCase()) && !topSet.has(entry.toLowerCase()));
}

async function clickActiveItemByIndex(page, index) {
  return page.evaluate((targetIndex) => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (rect.width < 16 || rect.height < 10) return false;
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    const roots = Array.from(
      document.querySelectorAll(".dropdown__menu, [role='listbox'], .dropdown__content, .dropdown"),
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
    if (!bestRoot) return false;

    const nodes = Array.from(bestRoot.querySelectorAll("li, [role='listitem'], [role='option'], a, button")).filter(
      (node) => node instanceof HTMLElement && visible(node),
    );
    if (targetIndex < 0 || targetIndex >= nodes.length) return false;
    const target = nodes[targetIndex];
    target.scrollIntoView({ block: "center", inline: "nearest" });
    target.click();
    return true;
  }, index);
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
        if (await locator.first().isVisible({ timeout: 700 })) return true;
      } catch {
        // continue
      }
    }
    return false;
  };
}

async function enterTopCategory(page, topCategory) {
  await page.goto(POSHMARK_SELL_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await openCategoryPicker(page);
  return clickTopCategory(page, topCategory);
}

async function scrapeTwoLevelTree(page) {
  const tree = {
    capturedAt: new Date().toISOString(),
    source: POSHMARK_SELL_URL,
    topCategories: [],
    notes: ["Iterates second-level by index under each fixed top category."],
  };

  for (const topCategory of TOP_CATEGORIES) {
    logStep("poshmark-scrape", `Scraping top category: ${topCategory}`);
    const entered = await enterTopCategory(page, topCategory);
    const subcategories = [];

    if (entered) {
      const levelTwoLabels = await activeMenuItems(page);

      for (let idx = 0; idx < levelTwoLabels.length; idx += 1) {
        const ready = await enterTopCategory(page, topCategory);
        if (!ready) {
          break;
        }

        const labelsNow = await activeMenuItems(page);
        if (idx >= labelsNow.length) {
          break;
        }

        const label = labelsNow[idx];
        logStep("poshmark-scrape", `  Scraping subcategory: ${topCategory} > ${label}`);

        const clicked = await clickActiveItemByIndex(page, idx);
        if (!clicked) {
          continue;
        }
        await page.waitForTimeout(500);

        const leafCandidates = await activeMenuItems(page);
        subcategories.push({
          name: label,
          children: leafCandidates,
          isLeaf: leafCandidates.length === 0,
        });
      }
    }

    tree.topCategories.push({
      name: topCategory,
      subcategories,
    });
  }

  return tree;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { context, page } = await createAutomationPage(args.userId);

  try {
    logStep("poshmark-scrape", "Opening sell page.");
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

    const tree = await scrapeTwoLevelTree(page);
    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, `${JSON.stringify(tree, null, 2)}\n`, "utf8");

    logStep("poshmark-scrape", `Saved category tree to ${args.output}`);
    console.log(JSON.stringify({ ok: true, output: args.output, topCategories: tree.topCategories.length }, null, 2));
  } finally {
    await closeAutomationContext(context, args.userId);
  }
}

main().catch((error) => {
  console.error(`[poshmark-scrape] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
