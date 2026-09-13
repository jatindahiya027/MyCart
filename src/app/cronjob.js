import cron from "node-cron";
import nodemailer from "nodemailer";
import { refreshProducts } from "./lib/refreshProducts";
import { recordScrapeError } from "./lib/scrapeLogs";
import { getMailCredentials } from "./lib/settings";
import {
  acquireDueCronLease,
  acquireCronLease,
  activateCronTask,
  deactivateCronTask,
  ensureCronNextRunAt,
  getCronScheduleConfig,
  getCronScheduleVersion,
  initializeCronRuntime,
  isCronScheduleCurrent,
  keepCronLeaseAlive,
  nextCronRunAt,
  releaseCronLease,
  shouldActivateCronTask,
} from "./lib/cronControl";

export function cronExpressionForHours(hours) {
  // The persisted next_run_at value owns the interval. Cron only supplies a
  // lightweight minute heartbeat so non-divisors of 24 remain exact.
  nextCronRunAt(hours);
  return "* * * * *";
}

async function sendPriceDropEmail(items) {
  const credentials = await getMailCredentials();
  if (!credentials) return;

  const products = items.filter(
    (item) =>
      Number(item.current_price) <= Number(item.min_price) &&
      Number(item.max_price) !== Number(item.min_price)
  );
  if (!products.length) return;

  const rows = products
    .map(
      (product) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd">
            <a href="${product.link}"><img src="${product.image}" alt="${product.name}" style="width:70px;height:auto;border-radius:5px" /></a>
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd"><a href="${product.link}">${product.name}</a></td>
          <td style="padding:8px;border-bottom:1px solid #ddd">${product.current_price}</td>
        </tr>`
    )
    .join("");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: credentials.user, pass: credentials.password },
  });
  await transporter.sendMail({
    from: credentials.user,
    to: credentials.to,
    subject: "Price Drop Alert from MyCart!",
    html: `<html><body style="font-family:Arial,sans-serif;color:#333"><h1>Products at their lowest price</h1><table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></body></html>`,
  });
}

export async function runScheduledUpdate({
  scheduleVersion = null,
  intervalHours = null,
  dueOnly = false,
} = {}) {
  let version = scheduleVersion;
  let hours = intervalHours;
  let enabled = true;
  if (version == null || (dueOnly && hours == null)) {
    const config = await getCronScheduleConfig();
    version ??= config.version;
    hours ??= config.hours;
    enabled = config.enabled;
  }
  version ??= await getCronScheduleVersion();
  if (dueOnly && !enabled) return { skipped: true, disabled: true };

  const lease = dueOnly
    ? await acquireDueCronLease({ scheduleVersion: version, hours })
    : await acquireCronLease({ scheduleVersion: version });
  if (!lease) {
    if (!dueOnly) {
      console.log(
        `Skipped cron update for obsolete or already-running schedule version ${version}`
      );
    }
    return { skipped: true };
  }

  const stopLeaseHeartbeat = keepCronLeaseAlive(lease);
  try {
    let items;
    try {
      items = await refreshProducts("cron", null, {
        shouldContinue: () => isCronScheduleCurrent(version),
      });
    } catch (error) {
      console.error("Scheduled product refresh failed:", error?.message || error);
      await recordScrapeError({ source: "cron", error });
      return { skipped: false, success: false };
    }

    if (!(await isCronScheduleCurrent(version))) {
      return { skipped: true, success: false, obsolete: true };
    }

    try {
      await sendPriceDropEmail(items);
    } catch (error) {
      console.error("Price-drop email failed:", error?.message || error);
      await recordScrapeError({ source: "email", error });
    }
    return { skipped: false, success: true };
  } finally {
    stopLeaseHeartbeat();
    await releaseCronLease(lease);
  }
}

export async function configureCronSchedule(
  intervalHours = null,
  scheduleVersion = null,
  cronEnabled = null
) {
  let hours = intervalHours;
  let version = scheduleVersion;
  let enabled = cronEnabled;
  if (hours == null || version == null || enabled == null) {
    const savedSchedule = await getCronScheduleConfig();
    hours ??= savedSchedule.hours;
    version ??= savedSchedule.version;
    enabled ??= savedSchedule.enabled;
  }
  const state = globalThis.__myCartCronState;
  if (!enabled) {
    globalThis.__myCartCronState = deactivateCronTask(state, hours, version);
    console.log("Cron job disabled");
    return globalThis.__myCartCronState;
  }
  await ensureCronNextRunAt({
    scheduleVersion: version,
    hours,
  });
  if (!shouldActivateCronTask(state, hours, version)) return state;

  const task = cron.schedule(
    cronExpressionForHours(hours),
    () =>
      runScheduledUpdate({
        scheduleVersion: version,
        intervalHours: hours,
        dueOnly: true,
      }),
    { scheduled: false }
  );
  globalThis.__myCartCronState = activateCronTask(
    state,
    task,
    hours,
    version
  );
  console.log(`Cron job initialized with Scrapling every ${hours} hour${hours === 1 ? "" : "s"}`);
  return globalThis.__myCartCronState;
}

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

if (!isProductionBuild) {
  initializeCronRuntime(globalThis, async () => {
    try {
      return await configureCronSchedule();
    } catch (error) {
      console.error("Could not initialize cron schedule:", error?.message || error);
      await recordScrapeError({ source: "scheduler", error });
      return null;
    }
  });
}
