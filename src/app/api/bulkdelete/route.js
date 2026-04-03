import sqlite3 from "sqlite3";
import { open } from "sqlite";
import Redis from "ioredis";
import { MeiliSearch } from "meilisearch";

const redis = new Redis({ host: "localhost", port: 6379 });
const client = new MeiliSearch({ host: "http://localhost:7700" });

let db = null;

async function storeDataInRedis(key, value) {
  await redis.set(key, JSON.stringify(value), "EX", 60 * 60);
}

function buildQuery(selectedOption) {
  const base =
    "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link";

  const orderMap = {
    "Price (Highest first)": " ORDER BY current_price DESC;",
    "Price (Lowest first)": " ORDER BY current_price ASC;",
    "Date (Highest first)": " ORDER BY current_price_date DESC;",
    "Date (Lowest first)": " ORDER BY current_price_date ASC;",
    Relevance: " ORDER BY d.transid DESC;",
  };

  return base + (orderMap[selectedOption] ?? " ORDER BY d.transid DESC;");
}

export async function POST(request) {
  const { ids, selectedOption } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({ error: "No ids provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!db) {
    db = await open({
      filename: "./collection.db",
      driver: sqlite3.Database,
    });
  }

  const placeholders = ids.map(() => "?").join(", ");

  await db.run(`DELETE FROM data WHERE transid IN (${placeholders})`, ids);
  await db.run(`DELETE FROM dataprice WHERE dataid IN (${placeholders})`, ids);

  const query = buildQuery(selectedOption);
  const items = await db.all(query);

  await storeDataInRedis(query, items);

  try {
    await client
      .index("mycart")
      .delete({})
      .then(() => client.index("mycart").addDocuments(items));
  } catch (err) {
    console.error("MeiliSearch error:", err);
  }

  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
