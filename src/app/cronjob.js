var cron = require('node-cron');
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { exec } from "child_process";
let db = null;

function extractDomain(url) {
  const regex = /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i; // Regex to match the domain
  const match = url.match(regex);
  return match ? match[1].split(".")[0] : null; // Return the first part of the domain
}

function execPromise(command) {
  console.log(command);
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
// Schedule the task every 2 minutes
cron.schedule('0 */5 * * *', () => {
  updatedata();
});

  console.log("Cron job initialized");

 async function updatedata(){
    if (!db) {
      // If the database instance is not initialized, open the database connection
      db = await open({
        filename: "./collection.db", // Specify the database file path
        driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
      });
    }
  
    // //console.log("hello");
    const str = "SELECT link,transid FROM data";
  
    const items = await db.all(str);
    for (let x in items) {
      console.log(items[x].link);
      const domain = extractDomain(items[x].link);
      console.log(domain);
      let run = null;
  
      if (domain === "amazon") {
        run = `python amazon.py "${items[x].link}"`;
      } else if (domain === "zara") {
        run = `python zara.py "${items[x].link}"`;
      } else if (domain === "ajio") {
        run = `python ajio.py ${items[x].link}`;
      } else if (domain === "converse") {
        run = `python converse.py "${items[x].link}"`;
      } else if (domain === "tatacliq") {
        run = `python tatacliq.py "${items[x].link}"`;
      } else if (domain === "flipkart") {
        run = `python flipkart.py "${items[x].link}"`;
      } else if (domain === "myntra") {
        run = `python myntra.py "${items[x].link}"`;
      } else if (domain === "adidas") {
        run = `python adidas.py "${items[x].link}"`;
      }
      try {
        const { stdout, stderr } = await execPromise(run);
        // Parse the JSON string returned from Python
        const data = JSON.parse(stdout.trim());
        console.log(data.product_price);
        const now = new Date();
        const currentTime = now.toLocaleString();
        const strrr = `
      INSERT INTO dataprice (dataid,date, price) VALUES
       (?,?,?)
      `;
        const resultt = await db.run(strrr, [
          items[x].transid,
          currentTime,
          data.product_price,
        ]);
      } catch (error) {
        console.log("error occured ", error);
      }
    }
  
  }