import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_INPUT = path.resolve(process.cwd(), "data", "poshmark.txt");
const DEFAULT_OUTPUT = path.resolve(process.cwd(), "data", "poshmark-category-map.json");

function parseArgs(argv) {
  const parsed = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--input" && value) {
      parsed.input = path.resolve(process.cwd(), value);
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

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildMapFromLog(raw) {
  const byTop = new Map();
  const lines = String(raw || "").split(/\r?\n/);
  const pattern = /Scraping subcategory:\s*([^>]+)>\s*(.+)\s*$/i;

  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;
    const topCategory = normalize(match[1]);
    const subcategory = normalize(match[2]);
    if (!topCategory || !subcategory) continue;

    if (!byTop.has(topCategory)) {
      byTop.set(topCategory, []);
    }
    const current = byTop.get(topCategory);
    if (!current.includes(subcategory)) {
      current.push(subcategory);
    }
  }

  const categories = Array.from(byTop.entries()).map(([topCategory, subcategories]) => ({
    topCategory,
    subcategories: subcategories.map((subcategory, index) => ({
      subcategory,
      index,
    })),
  }));

  return {
    generatedAt: new Date().toISOString(),
    source: "poshmark.txt",
    categories,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputRaw = await fs.readFile(args.input, "utf8");
  const output = buildMapFromLog(inputRaw);

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        input: args.input,
        output: args.output,
        topCategories: output.categories.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
