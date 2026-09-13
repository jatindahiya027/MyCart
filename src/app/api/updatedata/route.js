import { refreshProducts } from "../../lib/refreshProducts";
import { normalizeProductIds } from "../../lib/priceHistory";

export const runtime = "nodejs";

export async function POST(request) {
  let requestedIds = [];
  try {
    const body = await request.json();
    requestedIds = normalizeProductIds(body?.ids);
    if (Array.isArray(body?.ids) && body.ids.length && !requestedIds.length) {
      return new Response(JSON.stringify({ error: "No valid product ids were provided." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    // An empty request body means refresh every tracked product.
  }

  try {
    const source = requestedIds.length ? "manual-selected" : "manual-all";
    const items = await refreshProducts(source, requestedIds.length ? requestedIds : null);
    return new Response(JSON.stringify(items), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Bulk product refresh failed:", error?.message || error);
    return new Response(
      JSON.stringify({ error: error?.message || "The product refresh failed." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
