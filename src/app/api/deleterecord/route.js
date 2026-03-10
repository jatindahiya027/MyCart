import sqlite3 from "sqlite3";
import { open } from "sqlite";
import Redis from "ioredis";
import { MeiliSearch } from "meilisearch";
// Set up Redis connection
const redis = new Redis({
  host: "localhost",
  port: 6379,
});
const client = new MeiliSearch({
  host: "http://localhost:7700",
  // apiKey: '16bc69fa-47e4-423e-bb5e-57b5b21502f5'
});
let db = null;
async function storeDataInRedis(key, value) {
  await redis.set(key, JSON.stringify(value), "EX", 60 * 60); // Cache data for 5 minutes
  console.log("Data stored in Redis");
}
export async function POST(request) {
  const id = await request.json();

  if (!db) {
    // If the database instance is not initialized, open the database connection
    db = await open({
      filename: "./collection.db", // Specify the database file path
      driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
    });
  }
  //  console.log(id.index," ",id.selectedOption);
  const str = "DELETE FROM data where transid = ? ";

  const result = await db.run(str, [id.index]);
  const strr = "DELETE FROM dataprice where dataid = ? ";
  const resultt = await db.run(strr, [id.index]);
  // Return the items as a JSON response with status 200
  let strrr = null;
  if (id.selectedOption === "Relevance")
    strrr =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;";
  else if (id.selectedOption === "Price (Highest first)")
    strrr =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY current_price DESC;";
  else if (id.selectedOption === "Price (Lowest first)")
    strrr =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY current_price ASC;";
  else if (id.selectedOption === "Date (Highest first)")
    strrr =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link  ORDER BY current_price_date DESC;";
  else if (id.selectedOption === "Date (Lowest first)")
    strrr =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link  ORDER BY current_price_date ASC;";
  else
    strrr =
      "SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link;";

  // const str ='SELECT * FROM data';
  const items = await db.all(strrr);
  await storeDataInRedis(strrr, items);
  try{
  client
    .index("mycart")
    .delete({})
    .then(() => {
      console.log("All documents have been deleted.");

      // Add new documents after deletion
      return client.index("mycart").addDocuments(items);
    })
    .then((res) => {
      console.log("New data added successfully:", res);
    })
    .catch((err) => {
      console.error("Error:", err);
    });}
    catch(err){
      console.log(err);
    }

  
  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
