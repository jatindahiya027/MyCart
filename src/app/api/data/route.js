import sqlite3 from "sqlite3";
import { open } from "sqlite";
let db = null;
export async function POST(request){
   const sort = await request.json();
    if (!db) {
        // If the database instance is not initialized, open the database connection
        db = await open({
          filename: "./collection.db", // Specify the database file path
          driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
        });
      }
      let str = null;
      // console.log(sort.selectedOption);
      if(sort.selectedOption==="Relevance")
        str = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, current_price_info.price AS current_price, current_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE (dataid, date) IN ( SELECT dataid, MAX(date) FROM dataprice GROUP BY dataid ) ) AS current_price_info ON d.transid = current_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link;';
      else if(sort.selectedOption==="Price (Highest first)")
        str = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, current_price_info.price AS current_price, current_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE (dataid, date) IN ( SELECT dataid, MAX(date) FROM dataprice GROUP BY dataid ) ) AS current_price_info ON d.transid = current_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY current_price DESC;';
      else if(sort.selectedOption==="Price (Lowest first)")
        str = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, current_price_info.price AS current_price, current_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE (dataid, date) IN ( SELECT dataid, MAX(date) FROM dataprice GROUP BY dataid ) ) AS current_price_info ON d.transid = current_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY current_price ASC;';
      else if(sort.selectedOption==="Date (Highest first)")
        str = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, current_price_info.price AS current_price, current_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE (dataid, date) IN ( SELECT dataid, MAX(date) FROM dataprice GROUP BY dataid ) ) AS current_price_info ON d.transid = current_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link  ORDER BY current_price_date DESC;';
      else if(sort.selectedOption==="Date (Lowest first)")
        str = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, current_price_info.price AS current_price, current_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE (dataid, date) IN ( SELECT dataid, MAX(date) FROM dataprice GROUP BY dataid ) ) AS current_price_info ON d.transid = current_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link  ORDER BY current_price_date ASC;';
      else
      str = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, current_price_info.price AS current_price, current_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE (dataid, date) IN ( SELECT dataid, MAX(date) FROM dataprice GROUP BY dataid ) ) AS current_price_info ON d.transid = current_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link;';
    
      // const str ='SELECT * FROM data';
      const items = await db.all(str);
    
      // Return the items as a JSON response with status 200
      return new Response(JSON.stringify(items), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
}