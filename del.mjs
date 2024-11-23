import sqlite3 from "sqlite3";
import { open } from "sqlite";
let db = null;

    
   
    if (!db) {
        // If the database instance is not initialized, open the database connection
        db = await open({
          filename: "./collection.db", // Specify the database file path
          driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
        });
      }
    //  console.log(id.index," ",id.selectedOption);
       
      // const strr = 'DELETE FROM dataprice where date > "11/10/2024, 6:00:00 pm" ';
      // const resultt = await db.run(strr);
      const strr="SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link;"
      // Return the items as a JSON response with status 200
      const items = await db.all(strr);
      console.log(items);
      