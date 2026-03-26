import fs from "node:fs/promises";
import path from "node:path";

import { closeAutomationContext, createAutomationPage, ensureLoggedIn, logStep } from "../src/automation/common.js";

const DEPOP_LOGIN_URL = "https://www.depop.com/login";
const DEPOP_SELL_URL = "https://www.depop.com/products/create/";
const DEFAULT_OUTPUT = path.resolve(process.cwd(), "data", "depop-category-tree.json");
const SKIP_TEXT = new Set(["search", "cancel", "clear", "done", "back"]);

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

function createReadyCheck() {
  return async (page) => {
    const readyLocators = [
      page.getByRole("combobox", { name: /category/i }).first(),
      page.getByRole("button", { name: /^post$/i }).first(),
      page.getByTestId("upload-input__input").first(),
    ];
    for (const locator of readyLocators) {
      try {
        if (await locator.isVisible({ timeout: 700 })) {
          return true;
        }
      } catch {
        // continue
      }
    }
    return !page.url().toLowerCase().includes("/login");
  };
}

async function openCategoryCombobox(page) {
  const combobox = page.getByRole("combobox", { name: /category/i }).first();
  await combobox.focus();
  await combobox.click({ timeout: 8000 });
  await page.waitForTimeout(450);
}

async function readCategoryComboboxValue(page) {
  const combobox = page.getByRole("combobox", { name: /category/i }).first();
  const value = await combobox.inputValue().catch(() => "");
  if (value && value.trim()) {
    return normalizeText(value);
  }
  const text = await combobox.innerText().catch(() => "");
  return normalizeText(text);
}

async function getActiveOptions(page) {
  const options = await page.evaluate(() => {
    function visible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (rect.width < 20 || rect.height < 10) return false;
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }

    const roots = Array.from(document.querySelectorAll("[role='listbox'], [role='dialog'], .react-aria-Popover"))
      .filter((root) => root instanceof HTMLElement && visible(root));

    let bestRoot = null;
    let bestScore = -1;
    for (const root of roots) {
      const score = root.querySelectorAll("[role='option'], li, button, a").length;
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
    for (const node of bestRoot.querySelectorAll("[role='option'], li, button, a")) {
      if (!(node instanceof HTMLElement)) continue;
      if (!visible(node)) continue;
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  });

  return options
    .map(normalizeText)
    .filter((item) => item && !SKIP_TEXT.has(item.toLowerCase()) && item.length <= 80);
}

async function selectByArrowIndex(page, index) {
  const combobox = page.getByRole("combobox", { name: /category/i }).first();
  await combobox.focus();
  await combobox.press("Home").catch(() => {});
  await page.waitForTimeout(120);

  for (let step = 0; step < index; step += 1) {
    await combobox.press("ArrowDown");
    await page.waitForTimeout(80);
  }

  const before = await readCategoryComboboxValue(page);
  await combobox.press("Enter");
  await page.waitForTimeout(450);
  const after = await readCategoryComboboxValue(page);

  if (!after || after === before || SKIP_TEXT.has(after.toLowerCase())) {
    return { ok: false, label: after || before || null };
  }

  return { ok: true, label: after };
}

async function enterTopLevelByIndex(page, index) {
  await page.goto(DEPOP_SELL_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await openCategoryCombobox(page);
  const result = await selectByArrowIndex(page, index);
  return { ok: result.ok, outOfRange: false, label: result.label };
}

async function scrapeDepopTwoLevel(page) {
  const tree = {
    capturedAt: new Date().toISOString(),
    source: DEPOP_SELL_URL,
    topCategories: [],
    notes: ["Index-based scrape over Depop category list; stops after 5 consecutive failures."],
  };

  let consecutiveFailures = 0;

  for (let topIndex = 0; consecutiveFailures < 5; topIndex += 1) {
    const top = await enterTopLevelByIndex(page, topIndex);

    if (!top.ok || !top.label) {
      consecutiveFailures += 1;
      continue;
    }
    consecutiveFailures = 0;

    logStep("depop-scrape", `Scraping top category: ${top.label}`);
    const secondLevel = await getActiveOptions(page);

    tree.topCategories.push({
      name: top.label,
      subcategories: secondLevel.map((name) => ({
        name,
        children: [],
        isLeaf: true,
      })),
    });
  }

  return tree;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { context, page } = await createAutomationPage(args.userId);

  try {
    logStep("depop-scrape", "Opening sell page.");
    await maximizeWindow(page);
    await page.goto(DEPOP_SELL_URL, { waitUntil: "domcontentloaded" });
    if (page.url().toLowerCase().includes("/login")) {
      await ensureLoggedIn({
        page,
        platform: "depop",
        loginUrl: DEPOP_LOGIN_URL,
        readyCheck: createReadyCheck(),
        userId: args.userId,
      });
    }

    const tree = await scrapeDepopTwoLevel(page);
    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, `${JSON.stringify(tree, null, 2)}\n`, "utf8");

    logStep("depop-scrape", `Saved category tree to ${args.output}`);
    console.log(JSON.stringify({ ok: true, output: args.output, topCategories: tree.topCategories.length }, null, 2));
  } finally {
    await closeAutomationContext(context, args.userId);
  }
}

main().catch((error) => {
  console.error(`[depop-scrape] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
