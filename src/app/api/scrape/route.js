import { exec } from "child_process";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db = null;

export async function POST(request) {
  const url = await request.json();

  function extractDomain(url) {
    const regex = /^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i; // Regex to match the domain
    const match = url.match(regex);
    return match ? match[1].split(".")[0] : null; // Return the first part of the domain
  }

  const domain = extractDomain(url.link);
  console.log(domain);
  let run = null;

  if (domain === "amazon") {
    run = `python amazon.py ${url.link}`;
  } else if (domain === "zara") {
    run = `python zara.py "${url.link}"`;
  } else if (domain === "ajio") {
    run = `python ajio.py ${url.link}`;
  } else if (domain === "converse") {
    run = `python converse.py "${url.link}"`;
  } else if (domain === "tatacliq") {
    run = `python tatacliq.py "${url.link}"`;
  } else if (domain === "flipkart") {
    run = `python flipkart.py "${url.link}"`;
  } else if (domain === "myntra") {
    run = `python myntra.py "${url.link}"`;
  } else if (domain === "adidas") {
    run = `python adidas.py "${url.link}"`;
  }

  // Execute the command
  try {
    const { stdout, stderr } = await execPromise(run);
    
    // Parse the JSON string returned from Python
    const data = JSON.parse(stdout.trim());
    const now = new Date();
const currentTime = now.toLocaleString(); // Outputs time in local format


    console.log(data.product_name," ",data.product_price," ",data.product_image_url," ",currentTime," ",domain," ",url.link);


    if (!db) {
        // If the database instance is not initialized, open the database connection
        db = await open({
          filename: "./collection.db", // Specify the database file path
          driver: sqlite3.Database, // Specify the database driver (sqlite3 in this case)
        });
      }
      const strr = `
    INSERT INTO data (website, link, name, image) VALUES
     (?,?,?,?)
    `;
  //  //console.log(body.type, body.category, body.description, body.date, body.amount);
    const result = await db.run(strr, [domain ,url.link ,data.product_name ,data.product_image_url])
      // //console.log("hello");
     
      const strrr = `
    INSERT INTO dataprice (dataid,date, price) VALUES
     (?,?,?)
    `;
    const resultt = await db.run(strrr, [result.lastID,currentTime,data.product_price])
      const str = 'SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, current_price_info.price AS current_price, current_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE (dataid, date) IN ( SELECT dataid, MAX(date) FROM dataprice GROUP BY dataid ) ) AS current_price_info ON d.transid = current_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link;';
    
    
      const items = await db.all(str);
    
    // Send your custom response
    return new Response(JSON.stringify(items), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
  } catch (error) {
    // Handle errors
    return new Response(JSON.stringify({ error: error.stderr || "An error occurred" }), { status: 500 });
  }
}

// Helper function to convert exec to return a promise
function execPromise(command) {
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
