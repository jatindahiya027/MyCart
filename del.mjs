import sqlite3 from "sqlite3";
import { open } from "sqlite";
import Redis from "ioredis";
const redis = new Redis({
  host: "localhost",
  port: 6379,
});
async function storeDataInRedis(key, value) {
  await redis.set(key, JSON.stringify(value), "EX", 60 * 60); // Cache data for 5 minutes
  console.log("Data stored in Redis");
}
let db = null;

    
   
    if (!db) {
        // If the database instance is not initialized, open the database connection
        db = await open({
          filename: "./collection.db", // Specify the database file path
          driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
        });
      }
    //  console.log(id.index," ",id.selectedOption);
       
       const strrr = 'DELETE FROM data where transid = 121';
       const strrrr= 'DELETE FROM dataprice where dataid = 121';
      const resultt = await db.run(strrr);
      const resulttt = await db.run(strrrr);
      const strr="SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;";
      // Return the items as a JSON response with status 200
      const items = await db.all(strr);
      await storeDataInRedis(strr, items);
      
      console.log(items);
      