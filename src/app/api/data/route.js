import sqlite3 from "sqlite3";
import { open } from "sqlite";
import Redis from "ioredis";

// Set up Redis connection
const redis = new Redis({
  host: "localhost",
  port: 6379,
});
let db = null;
async function fetchData(query) {
  // Check if data is cached in Redis
  const cachedData = await redis.get(query);
  if (cachedData) {
    console.log("Data fetched from Redis");
    return JSON.parse(cachedData); // Return parsed JSON data from cache
  } else {
    // If data is not in Redis, fetch from SQLite
    // const db = await connectToDatabase();
    const data = await db.all(query);
    await storeDataInRedis(query, data);
    // Cache the result in Redis for future requests
    // redis.set(query, JSON.stringify(data), 'EX', 60 * 10); // Cache data for 5 minutes

    console.log("Data fetched from SQLite");
    return data;
  }
}
async function storeDataInRedis(key, value) {
  await redis.set(key, JSON.stringify(value), "EX", 60 * 60); // Cache data for 5 minutes
  console.log("Data stored in Redis");
}
export async function POST(request) {
  const sort = await request.json();
  if (!db) {
    // If thlinke database instance is not initialized, open the database connection
    db = await open({
      filename: "./collection.db", // Specify the database file path
      driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
    });
  }
  let str = null;
  // console.log(sort.selectedOption);
  if (sort.selectedOption === "Relevance")
    str =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;";
  else if (sort.selectedOption === "Price (Highest first)")
    str =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY current_price DESC;";
  else if (sort.selectedOption === "Price (Lowest first)")
    str =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY current_price ASC;";
  else if (sort.selectedOption === "Date (Highest first)")
    str =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link  ORDER BY current_price_date DESC;";
  else if (sort.selectedOption === "Date (Lowest first)")
    str =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link  ORDER BY current_price_date ASC;";
  else
    str =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link;";

  const data = await fetchData(str);
  // const str ='SELECT * FROM data';
  // const items = await db.all(str);

  // Return the items as a JSON response with status 200
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
