import { getDatabase } from "../../lib/database";
import { buildProductQuery, getAndCacheProductList } from "../../lib/productList";

export async function POST(request) {
  const body = await request.json();
  const id = Number(body?.index);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response(JSON.stringify({ error: "A valid item id is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = await getDatabase();
  await db.exec("BEGIN");
  try {
    await db.run("DELETE FROM data WHERE transid = ?", [id]);
    await db.run("DELETE FROM dataprice WHERE dataid = ?", [id]);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }

  const query = buildProductQuery(body?.selectedOption);
  const items = await getAndCacheProductList(db, query);
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
