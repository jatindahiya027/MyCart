import { getDatabase } from "../../lib/database";
import { getAndCacheProductList } from "../../lib/productList";
import { insertCompressedPricePoint } from "../../lib/priceHistory";
import { getWebsite, ProductScrapeError, scrapeProduct } from "../../lib/scraper";
import { recordScrapeError } from "../../lib/scrapeLogs";

export const runtime = "nodejs";

function extensionCorsHeaders(request) {
  const origin = request?.headers?.get("origin") || "";
  if (!origin.startsWith("chrome-extension://")) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extensionCorsHeaders(request) },
  });
}

export function OPTIONS(request) {
  return new Response(null, { status: 204, headers: extensionCorsHeaders(request) });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "A JSON request body is required." }, 400, request);
  }

  const link = typeof body?.link === "string" ? body.link.trim() : "";
  if (!link) {
    return jsonResponse({ error: "A product link is required." }, 400, request);
  }

  try {
    const website = getWebsite(link);
    const product = await scrapeProduct(link);
    const db = await getDatabase();
    let insertedId;

    await db.exec("BEGIN");
    try {
      const result = await db.run(
        "INSERT INTO data (website, link, name, image) VALUES (?, ?, ?, ?)",
        [website, link, product.product_name, product.product_image_url]
      );
      insertedId = result.lastID;
      await insertCompressedPricePoint(
        db,
        insertedId,
        new Date().toLocaleString(),
        product.product_price
      );
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }

    console.log("Scraped product:", {
      website,
      link,
      product_name: product.product_name,
      product_price: product.product_price,
      product_image_url: product.product_image_url,
    });
    const items = await getAndCacheProductList(db);
    if (body?.details === true) {
      return jsonResponse(
        {
          items,
          product: {
            transid: insertedId,
            website,
            link,
            name: product.product_name,
            price: product.product_price,
            image: product.product_image_url,
            source: "scrapling",
          },
        },
        200,
        request
      );
    }
    return jsonResponse(items, 200, request);
  } catch (error) {
    console.error("Product scrape failed:", error?.message || error);
    let website = null;
    try {
      website = getWebsite(link);
    } catch {
      // The validation error itself is the useful log message.
    }
    await recordScrapeError({
      source: "add-product",
      product: { website, link },
      error,
    });
    const status = error instanceof ProductScrapeError ? error.status : 500;
    return jsonResponse(
      { error: error?.message || "An unexpected scraping error occurred." },
      status,
      request
    );
  }
}
