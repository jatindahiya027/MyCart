import { getDatabase } from "./database.js";
import { normalizeProductImages } from "./productImage.js";

function errorMessage(error) {
  return error?.message || String(error || "Unknown scraping error");
}

function errorDetails(error) {
  const details = error?.stack || errorMessage(error);
  return String(details).slice(0, 8000);
}

export async function recordScrapeError({
  runId = null,
  productId = null,
  source,
  product = null,
  error,
  db: providedDb = null,
}) {
  try {
    const db = providedDb || (await getDatabase());
    let context = product;
    if (!context && productId) {
      context = await db.get(
        `SELECT d.transid, d.website, d.name, d.image, d.link,
          (SELECT price FROM dataprice WHERE dataid = d.transid ORDER BY rowid DESC LIMIT 1) AS current_price
         FROM data d WHERE d.transid = ?`,
        [productId]
      );
    }

    const result = await db.run(
      `INSERT INTO scrape_logs
        (run_id, product_id, source, website, product_name, product_image_url,
         product_url, current_price, error_message, error_details, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        productId || context?.transid || null,
        source || "unknown",
        context?.website || null,
        context?.name || null,
        context?.image || null,
        context?.link || null,
        context?.current_price ?? null,
        errorMessage(error),
        errorDetails(error),
        new Date().toISOString(),
      ]
    );
    return result.lastID;
  } catch (loggingError) {
    console.error("Could not persist scrape error:", loggingError?.message || loggingError);
    return null;
  }
}

export async function getScrapeErrors(limit = 200) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const logs = await (await getDatabase()).all(
    `SELECT id, run_id, product_id, source, website, product_name,
      product_image_url, product_url, current_price, error_message,
      error_details, occurred_at
     FROM scrape_logs
     ORDER BY id DESC
     LIMIT ?`,
    [safeLimit]
  );
  return normalizeProductImages(logs, "product_image_url");
}
