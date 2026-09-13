import { getLatestUpdateRun } from "../../lib/updateProgress";

export const dynamic = "force-dynamic";

export async function GET() {
  const run = await getLatestUpdateRun();

  return new Response(JSON.stringify(run), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
