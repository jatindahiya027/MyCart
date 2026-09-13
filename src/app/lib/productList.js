import Redis from "ioredis";
import { addPriceIndicators } from "./itemIndicators";
import { normalizeProductImages } from "./productImage";

export const FETCH_PRODUCTS_QUERY =
  "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;";

const PRODUCT_QUERY_BASE =
  "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link";

export function buildProductQuery(selectedOption) {
  const orderBy = {
    "Price (Highest first)": " ORDER BY current_price DESC;",
    "Price (Lowest first)": " ORDER BY current_price ASC;",
    "Date (Highest first)": " ORDER BY current_price_date DESC;",
    "Date (Lowest first)": " ORDER BY current_price_date ASC;",
    Relevance: " ORDER BY d.transid DESC;",
  };
  return PRODUCT_QUERY_BASE + (orderBy[selectedOption] || orderBy.Relevance);
}

let redis;

function getRedis() {
  if (redis) return redis;
  redis = new Redis({
    host: "localhost",
    port: 6379,
    lazyConnect: true,
    connectTimeout: 750,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  // Redis is an optional cache. SQLite remains the source of truth.
  redis.on("error", () => {});
  return redis;
}

export async function cacheProductList(key, items) {
  try {
    const client = getRedis();
    if (client.status === "wait") await client.connect();
    if (client.status !== "ready") return;
    await client.set(key, JSON.stringify(items), "EX", 60 * 60);
  } catch (error) {
    console.warn("Redis cache unavailable; continuing with SQLite:", error?.message || error);
  }
}

export async function getCachedProductList(key) {
  try {
    const client = getRedis();
    if (client.status === "wait") await client.connect();
    if (client.status !== "ready") return null;
    const value = await client.get(key);
    return value ? normalizeProductImages(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export async function getProductList(db, query = FETCH_PRODUCTS_QUERY) {
  return normalizeProductImages(
    await addPriceIndicators(db, await db.all(query))
  );
}

export async function getAndCacheProductList(db, query = FETCH_PRODUCTS_QUERY) {
  const items = await getProductList(db, query);
  await cacheProductList(query, items);
  return items;
}
