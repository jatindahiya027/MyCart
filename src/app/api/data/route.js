import { getDatabase } from "../../lib/database";
import {
  buildProductQuery,
  getAndCacheProductList,
  getCachedProductList,
} from "../../lib/productList";

export async function POST(request) {
  let selectedOption = "Relevance";
  try {
    selectedOption = (await request.json())?.selectedOption || selectedOption;
  } catch {
    // Relevance is a safe default for an empty or malformed request body.
  }

  const query = buildProductQuery(selectedOption);
  const cached = await getCachedProductList(query);
  const items = cached || (await getAndCacheProductList(await getDatabase(), query));

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
