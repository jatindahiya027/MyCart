import { getPublicSettings, saveSettings } from "../../lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    return jsonResponse(await getPublicSettings());
  } catch (error) {
    return jsonResponse({ error: error?.message || "Could not load settings." }, 500);
  }
}

export async function PUT(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "A JSON request body is required." }, 400);
  }

  try {
    const settings = await saveSettings(body || {});
    const { configureCronSchedule } = await import("../../cronjob");
    await configureCronSchedule(
      settings.cronIntervalHours,
      settings.cronScheduleVersion,
      settings.cronEnabled
    );
    const { cronScheduleVersion: _cronScheduleVersion, ...publicSettings } = settings;
    return jsonResponse(publicSettings);
  } catch (error) {
    return jsonResponse({ error: error?.message || "Could not save settings." }, 400);
  }
}
