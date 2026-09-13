import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const python = process.env.MYCART_PYTHON || (
  process.platform === "win32"
    ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
    : path.join(projectRoot, ".venv", "bin", "python")
);
const scraper = path.join(projectRoot, "scrapers", "scrape_product.py");
const fixturePath = path.join(projectRoot, "tests", "live_product_urls.json");
const registryPath = path.join(projectRoot, "scrapers", "supported_sites.json");
const completeResultsPath = path.join(projectRoot, "tests", "live_scraper_results.json");
const selectedResultsPath = path.join(projectRoot, "tests", "live_scraper_results.selected.json");
const samples = JSON.parse(readFileSync(fixturePath, "utf8"));
const registry = JSON.parse(readFileSync(registryPath, "utf8")).sites;
const requested = process.argv.slice(2).map((term) => term.toLowerCase());
const workers = Math.max(1, Number.parseInt(process.env.LIVE_SCRAPER_WORKERS || "6", 10));
const timeout = Math.max(1_000, Number.parseInt(process.env.LIVE_SCRAPER_TIMEOUT_MS || "150000", 10));

if (!existsSync(python)) {
  throw new Error(`Python environment not found at ${python}`);
}

const registryHosts = new Set(registry.map(({ hostname }) => hostname));
const fixtureHosts = new Set(samples.map(({ hostname }) => hostname));
if (
  samples.length !== registry.length ||
  fixtureHosts.size !== registry.length ||
  [...registryHosts].some((hostname) => !fixtureHosts.has(hostname))
) {
  throw new Error(
    `Live fixture coverage mismatch: ${samples.length} rows/${fixtureHosts.size} domains for ${registry.length} registered domains. ` +
    "Run scripts/build-live-product-fixture.mjs first."
  );
}

const selected = requested.length
  ? samples.filter((sample) => requested.some((term) =>
      [sample.name, sample.site, sample.hostname].some((value) => value.toLowerCase().includes(term))
    ))
  : samples;
const resultsPath = requested.length ? selectedResultsPath : completeResultsPath;

if (!selected.length) {
  throw new Error("No live samples matched the requested store name, site key, or hostname.");
}

const extractDetail = (error) => {
  const values = [error?.stdout, error?.stderr, error?.message, error]
    .filter(Boolean)
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
  return values.join("\n").slice(-2_000);
};

const classifyFailure = (detail, error) => {
  const text = detail.toLowerCase();
  if (error?.killed || error?.code === "ETIMEDOUT" || /timed?\s*out|timeout/.test(text)) return "timeout";
  if (/http\s*403|\(403\)|status(?:\s*code)?[:= ]+403|forbidden/.test(text)) return "http_403";
  if (/http\s*429|\(429\)|status(?:\s*code)?[:= ]+429|too many requests/.test(text)) return "http_429";
  if (/http\s*402|\(402\)|status(?:\s*code)?[:= ]+402|payment required/.test(text)) return "http_402";
  if (/http\s*404|\(404\)|status(?:\s*code)?[:= ]+404|not found/.test(text)) return "http_404";
  if (/incomplete product data|missing product|could not extract complete product data/.test(text)) return "incomplete";
  return "error";
};

const runSample = async (sample) => {
  const startedAt = performance.now();
  let payload = {};
  try {
    const { stdout } = await execFileAsync(python, [scraper, sample.url], {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout,
    });
    payload = JSON.parse(stdout.trim());
    const price = Number(payload.product_price);
    if (!payload.product_name || !payload.product_image_url || !Number.isFinite(price) || price <= 0) {
      throw new Error(payload.error || "incomplete product data");
    }
    return {
      ...sample,
      status: "pass",
      durationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
      productName: payload.product_name,
      productPrice: price,
      productImageUrl: payload.product_image_url,
      error: null,
    };
  } catch (error) {
    try {
      payload = JSON.parse(String(error?.stdout || "").trim());
    } catch {
      // Keep the empty/partially parsed payload and retain the complete diagnostics below.
    }
    const detail = extractDetail(error);
    const classificationDetail = `${payload.error || ""}\n${detail}`;
    return {
      ...sample,
      status: classifyFailure(classificationDetail, error),
      durationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(3)),
      productName: payload.product_name || null,
      productPrice: Number(payload.product_price) || null,
      productImageUrl: payload.product_image_url || null,
      error: payload.error || detail || "Unknown scraper failure",
    };
  }
};

const results = new Array(selected.length);
let nextIndex = 0;
const worker = async () => {
  while (true) {
    const index = nextIndex++;
    if (index >= selected.length) return;
    results[index] = await runSample(selected[index]);
    const result = results[index];
    const label = result.status === "pass" ? "PASS" : result.status.toUpperCase();
    const detail = result.status === "pass" ? result.productName : result.error.replace(/\s+/g, " ").slice(-240);
    const stream = result.status === "pass" ? console.log : console.error;
    stream(`${label.padEnd(10)} ${result.name.padEnd(36)} ${result.durationSeconds.toFixed(2).padStart(7)}s  ${detail}`);
  }
};

await Promise.all(Array.from({ length: Math.min(workers, selected.length) }, () => worker()));

const summary = results.reduce((counts, { status }) => {
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});
const report = {
  generatedAt: new Date().toISOString(),
  totalRegisteredDomains: registry.length,
  totalTested: selected.length,
  workers: Math.min(workers, selected.length),
  timeoutMilliseconds: timeout,
  summary,
  results,
};
writeFileSync(resultsPath, `${JSON.stringify(report, null, 2)}\n`);

const failures = selected.length - (summary.pass || 0);
console.log(`\nTested ${selected.length}/${registry.length} registered domains. Results: ${JSON.stringify(summary)}.`);
console.log(`Full result data: ${resultsPath}`);
if (failures) process.exitCode = 1;
