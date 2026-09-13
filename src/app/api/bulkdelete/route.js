import { getDatabase } from "../../lib/database";
import { buildProductQuery, getAndCacheProductList } from "../../lib/productList";

export async function POST(request) {
  const body = await request.json();
  const ids = Array.isArray(body?.ids)
    ? body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (!ids.length) {
    return new Response(JSON.stringify({ error: "No valid item ids were provided." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = await getDatabase();
  const placeholders = ids.map(() => "?").join(", ");
  await db.exec("BEGIN");
  try {
    await db.run(`DELETE FROM data WHERE transid IN (${placeholders})`, ids);
    await db.run(`DELETE FROM dataprice WHERE dataid IN (${placeholders})`, ids);
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
