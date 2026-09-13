import { getDatabase } from "../../lib/database";
import { getAndCacheProductList } from "../../lib/productList";
import { compactPriceHistory, insertCompressedPricePoint } from "../../lib/priceHistory";
import { ProductScrapeError, scrapeProduct } from "../../lib/scraper";
import { recordScrapeError } from "../../lib/scrapeLogs";

export const runtime = "nodejs";

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "A JSON request body is required." }, 400);
  }

  const transid = Number(body?.transid);
  const link = typeof body?.link === "string" ? body.link.trim() : "";
  if (!Number.isInteger(transid) || transid <= 0 || !link) {
    return jsonResponse({ error: "A valid transid and link are required." }, 400);
  }

  let db;
  let trackedItem;
  try {
    db = await getDatabase();
    trackedItem = await db.get(
      `SELECT d.transid, d.website, d.name, d.image, d.link,
        (SELECT price FROM dataprice WHERE dataid = d.transid ORDER BY rowid DESC LIMIT 1) AS current_price
       FROM data d WHERE d.transid = ? AND d.link = ?`,
      [transid, link]
    );
    if (!trackedItem) {
      return jsonResponse({ error: "The tracked product was not found." }, 404);
    }

    const product = await scrapeProduct(link);
    await compactPriceHistory(db, transid);
    await insertCompressedPricePoint(
      db,
      transid,
      new Date().toLocaleString(),
      product.product_price
    );

    return jsonResponse(await getAndCacheProductList(db), 200);
  } catch (error) {
    console.error("Single-product scrape failed:", error?.message || error);
    await recordScrapeError({
      productId: transid,
      source: "manual-single",
      product: trackedItem || { transid, link },
      error,
      db,
    });
    const status = error instanceof ProductScrapeError ? error.status : 500;
    return jsonResponse(
      { error: error?.message || "An unexpected scraping error occurred." },
      status
    );
  }
}
