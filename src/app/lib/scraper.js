import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRAPER_TIMEOUT_MS = 150_000;

const storeRegistry = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "scrapers", "supported_sites.json"),
    "utf8"
  )
);
const HOST_TO_WEBSITE = new Map(
  storeRegistry.sites.flatMap(({ hostname, aliases = [], site }) =>
    [hostname, ...aliases].map((candidate) => [
      candidate.toLowerCase().replace(/^www\./, ""),
      site,
    ])
  )
);
export const SUPPORTED_WEBSITES = new Set(HOST_TO_WEBSITE.values());

export class ProductScrapeError extends Error {
  constructor(message, { status = 422, cause } = {}) {
    super(message, { cause });
    this.name = "ProductScrapeError";
    this.status = status;
  }
}

export function getWebsite(productUrl) {
  let parsed;
  try {
    parsed = new URL(productUrl);
  } catch {
    throw new ProductScrapeError("A valid product URL is required.", { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ProductScrapeError("A valid http(s) product URL is required.", { status: 400 });
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const registeredHostname = [...HOST_TO_WEBSITE.keys()]
    .sort((left, right) => right.length - left.length)
    .find(
      (candidate) =>
        hostname === candidate || hostname.endsWith(`.${candidate}`)
    );
  const website = registeredHostname
    ? HOST_TO_WEBSITE.get(registeredHostname)
    : null;

  if (!SUPPORTED_WEBSITES.has(website)) {
    throw new ProductScrapeError(`Unsupported store: ${parsed.hostname}`, { status: 400 });
  }
  return website;
}

function pythonCandidates() {
  const projectRoot = process.cwd();
  const candidates = [
    process.env.MYCART_PYTHON,
    process.platform === "win32"
      ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
      : path.join(projectRoot, ".venv", "bin", "python"),
    process.platform === "win32" ? "python" : "python3",
    "python",
  ];
  return [...new Set(candidates.filter(Boolean))];
}

async function runScraper(productUrl) {
  const scriptPath = path.join(process.cwd(), "scrapers", "scrape_product.py");
  if (!existsSync(scriptPath)) {
    throw new ProductScrapeError("The Scrapling scraper entry point is missing.", {
      status: 500,
    });
  }

  let lastError;
  for (const python of pythonCandidates()) {
    if (python.includes(path.sep) && !existsSync(python)) continue;
    try {
      return await execFileAsync(python, [scriptPath, productUrl], {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
        timeout: SCRAPER_TIMEOUT_MS,
        windowsHide: true,
      });
    } catch (error) {
      if (error?.code === "ENOENT") {
        lastError = error;
        continue;
      }
      // The scraper uses a non-zero exit code for controlled extraction errors,
      // while still returning a JSON message on stdout.
      return {
        stdout: error?.stdout || "",
        stderr: error?.stderr || "",
        processError: error,
      };
    }
  }

  throw new ProductScrapeError(
    "Python 3.10+ was not found. Run the app launcher or install requirements.txt.",
    { status: 500, cause: lastError }
  );
}

function parseScraperOutput(stdout, stderr, processError) {
  let payload;
  try {
    payload = JSON.parse(String(stdout || "").trim());
  } catch (error) {
    const detail = String(stderr || processError?.message || "").trim();
    throw new ProductScrapeError(
      `Scrapling returned an invalid response${detail ? `: ${detail.slice(-500)}` : "."}`,
      { status: 500, cause: error }
    );
  }

  if (payload?.error) {
    throw new ProductScrapeError(payload.error, { cause: processError });
  }

  const price = Number(payload?.product_price);
  if (
    !payload?.product_name ||
    !payload?.product_image_url ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new ProductScrapeError("Scrapling did not return complete product data.");
  }

  return {
    product_name: String(payload.product_name).trim(),
    product_price: price,
    product_image_url: String(payload.product_image_url).trim(),
  };
}

export async function scrapeProduct(productUrl) {
  getWebsite(productUrl);
  const result = await runScraper(productUrl);
  return parseScraperOutput(result.stdout, result.stderr, result.processError);
}
