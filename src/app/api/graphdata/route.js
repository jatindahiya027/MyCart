import sqlite3 from "sqlite3";
import { open } from "sqlite";
let db = null;
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

  const strr = "select date, price FROM dataprice where dataid = ? ";
  //   const resultt = await db.run(strr, [id.index]);
  // Return the items as a JSON response with status 200

  // const str ='SELECT * FROM data';
  const items = await db.all(strr, [id.index]);
  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
