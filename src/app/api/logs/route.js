import { getScrapeErrors } from "../../lib/scrapeLogs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    const limit = new URL(request.url).searchParams.get("limit");
    return new Response(JSON.stringify(await getScrapeErrors(limit)), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || "Could not load scrape logs." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
