import { requestStopLatestUpdateRun } from "../../../lib/updateProgress";

export const dynamic = "force-dynamic";

export async function POST() {
  const run = await requestStopLatestUpdateRun();

  return new Response(JSON.stringify(run), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
