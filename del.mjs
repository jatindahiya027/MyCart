import sqlite3 from "sqlite3";
import { open } from "sqlite";
let db = null;

    
   
    if (!db) {
        // If the database instance is not initialized, open the database connection
        db = await open({
          filename: "./test.db", // Specify the database file path
          driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
        });
      }
    //  console.log(id.index," ",id.selectedOption);
       
      const strr = 'DELETE FROM dataprice where date > "11/10/2024, 6:00:00 pm" ';
      const resultt = await db.run(strr);
      // Return the items as a JSON response with status 200
      