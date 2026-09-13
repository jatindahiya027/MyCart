import { getDatabase } from "../../lib/database";
import { compactPriceHistory } from "../../lib/priceHistory";
let db = null;
export async function POST(request) {
  const id = await request.json();

  if (!db) {
    // If the database instance is not initialized, open the database connection
    db = await getDatabase();
  }
  //  console.log(id.index," ",id.selectedOption);

  const strr = "select date, price FROM dataprice where dataid = ? ";
  await compactPriceHistory(db, id.index);
  //   const resultt = await db.run(strr, [id.index]);
  // Return the items as a JSON response with status 200

  // const str ='SELECT * FROM data';
  const items = await db.all(strr, [id.index]);
  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
