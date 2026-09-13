import { getDatabase } from "../../../lib/database";
import { buildProductQuery, getAndCacheProductList } from "../../../lib/productList";
import { clearPriceHistory, normalizeProductIds } from "../../../lib/priceHistory";

export const runtime = "nodejs";

function jsonResponse(body, status = 200) {
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

  const ids = normalizeProductIds(body?.ids);
  if (!ids.length) {
    return jsonResponse({ error: "Select at least one product." }, 400);
  }

  const db = await getDatabase();
  const placeholders = ids.map(() => "?").join(", ");
  const existing = await db.all(
    `SELECT transid FROM data WHERE transid IN (${placeholders})`,
    ids
  );
  if (!existing.length) {
    return jsonResponse({ error: "The selected products were not found." }, 404);
  }

  await db.exec("BEGIN");
  let clearedCount;
  try {
    clearedCount = await clearPriceHistory(
      db,
      existing.map((item) => item.transid)
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    return jsonResponse(
      { error: error?.message || "Could not clear the price history." },
      500
    );
  }

  const query = buildProductQuery(body?.selectedOption);
  return jsonResponse({
    items: await getAndCacheProductList(db, query),
    clearedCount,
    productCount: existing.length,
  });
}
