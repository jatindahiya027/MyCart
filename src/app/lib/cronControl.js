import { randomUUID } from "node:crypto";

import { getDatabase } from "./database.js";

// The heartbeat keeps this short lease active during long scrape runs. If the
// server exits unexpectedly, another process can safely recover after 5 minutes.
export const CRON_LEASE_DURATION_MS = 5 * 60 * 1000;
export const CRON_LEASE_HEARTBEAT_MS = 60 * 1000;

function normalizedScheduleHours(value) {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) {
    throw new Error("Cron interval must be a whole number from 1 to 24.");
  }
  return hours;
}

export function nextCronRunAt(hours, now = new Date()) {
  return new Date(
    now.getTime() + normalizedScheduleHours(hours) * 60 * 60 * 1000
  );
}

export function initializeCronRuntime(runtime, initializer) {
  if (!runtime.__myCartCronInitialization) {
    runtime.__myCartCronInitialization = Promise.resolve().then(initializer);
  }
  return runtime.__myCartCronInitialization;
}

export function shouldActivateCronTask(previousState, hours, version) {
  if (!previousState?.task) return true;
  if (Number(previousState.version) > Number(version)) return false;
  return !(
    Number(previousState.version) === Number(version) &&
    Number(previousState.hours) === Number(hours)
  );
}

export function disposeCronTask(task) {
  if (!task) return;
  task.stop?.();
  task.destroy?.();
}

export function activateCronTask(previousState, task, hours, version) {
  disposeCronTask(previousState?.task);
  const state = { task, hours, version, enabled: true };
  task.start();
  return state;
}

export function deactivateCronTask(previousState, hours, version) {
  if (Number(previousState?.version) > Number(version)) return previousState;
  disposeCronTask(previousState?.task);
  return { task: null, hours, version, enabled: false };
}

export async function getCronScheduleVersion(providedDb = null) {
  const db = providedDb || (await getDatabase());
  const row = await db.get(
    "SELECT schedule_version FROM cron_control WHERE id = 1"
  );
  return Number(row?.schedule_version || 1);
}

export async function isCronScheduleCurrent(
  scheduleVersion,
  providedDb = null
) {
  return (await getCronScheduleVersion(providedDb)) === Number(scheduleVersion);
}

export async function getCronScheduleConfig(providedDb = null) {
  const db = providedDb || (await getDatabase());
  const row = await db.get(
    `SELECT s.cron_interval_hours AS hours,
            s.cron_enabled AS enabled,
            c.schedule_version AS version
       FROM app_settings s
       JOIN cron_control c ON c.id = 1
      WHERE s.id = 1`
  );
  return {
    hours: Number(row?.hours || 4),
    version: Number(row?.version || 1),
    enabled: row?.enabled !== 0,
  };
}

export async function bumpCronScheduleVersion(
  providedDb = null,
  { nextRunAt = null, clearNextRunAt = false, now = new Date() } = {}
) {
  const db = providedDb || (await getDatabase());
  await db.run(
    `UPDATE cron_control
        SET schedule_version = schedule_version + 1,
            next_run_at = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(?, next_run_at) END,
            updated_at = ?
      WHERE id = 1`,
    [clearNextRunAt ? 1 : 0, nextRunAt, now.toISOString()]
  );
  return getCronScheduleVersion(db);
}

export async function ensureCronNextRunAt({
  scheduleVersion,
  hours,
  db: providedDb = null,
  now = new Date(),
}) {
  const db = providedDb || (await getDatabase());
  const nextRunAt = nextCronRunAt(hours, now).toISOString();
  await db.run(
    `UPDATE cron_control
        SET next_run_at = ?,
            updated_at = ?
      WHERE id = 1
        AND schedule_version = ?
        AND (next_run_at IS NULL OR next_run_at = '')`,
    [nextRunAt, now.toISOString(), scheduleVersion]
  );
  const row = await db.get(
    "SELECT next_run_at FROM cron_control WHERE id = 1 AND schedule_version = ?",
    [scheduleVersion]
  );
  return row?.next_run_at || null;
}

export async function acquireCronLease({
  scheduleVersion,
  db: providedDb = null,
  ownerToken = randomUUID(),
  now = new Date(),
  leaseDurationMs = CRON_LEASE_DURATION_MS,
}) {
  const db = providedDb || (await getDatabase());
  const acquiredAt = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
  const result = await db.run(
    `UPDATE cron_control
        SET owner_token = ?,
            lease_expires_at = ?,
            updated_at = ?
      WHERE id = 1
        AND schedule_version = ?
        AND (
          owner_token IS NULL
          OR lease_expires_at IS NULL
          OR lease_expires_at <= ?
        )`,
    [ownerToken, leaseExpiresAt, acquiredAt, scheduleVersion, acquiredAt]
  );

  if (result.changes !== 1) return null;
  return { db, ownerToken, scheduleVersion, leaseDurationMs };
}

export async function acquireDueCronLease({
  scheduleVersion,
  hours,
  db: providedDb = null,
  ownerToken = randomUUID(),
  now = new Date(),
  leaseDurationMs = CRON_LEASE_DURATION_MS,
}) {
  const db = providedDb || (await getDatabase());
  const acquiredAt = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
  const nextRunAt = nextCronRunAt(hours, now).toISOString();
  const result = await db.run(
    `UPDATE cron_control
        SET owner_token = ?,
            lease_expires_at = ?,
            next_run_at = ?,
            updated_at = ?
      WHERE id = 1
        AND schedule_version = ?
        AND EXISTS (
          SELECT 1
            FROM app_settings settings
           WHERE settings.id = 1
             AND settings.cron_enabled = 1
        )
        AND next_run_at IS NOT NULL
        AND next_run_at <= ?
        AND (
          owner_token IS NULL
          OR lease_expires_at IS NULL
          OR lease_expires_at <= ?
        )`,
    [
      ownerToken,
      leaseExpiresAt,
      nextRunAt,
      acquiredAt,
      scheduleVersion,
      acquiredAt,
      acquiredAt,
    ]
  );

  if (result.changes !== 1) return null;
  return { db, ownerToken, scheduleVersion, leaseDurationMs };
}

export async function renewCronLease(lease, now = new Date()) {
  const leaseExpiresAt = new Date(
    now.getTime() + lease.leaseDurationMs
  ).toISOString();
  const result = await lease.db.run(
    `UPDATE cron_control
        SET lease_expires_at = ?,
            updated_at = ?
      WHERE id = 1
        AND schedule_version = ?
        AND owner_token = ?`,
    [
      leaseExpiresAt,
      now.toISOString(),
      lease.scheduleVersion,
      lease.ownerToken,
    ]
  );
  return result.changes === 1;
}

export async function releaseCronLease(lease) {
  const result = await lease.db.run(
    `UPDATE cron_control
        SET owner_token = NULL,
            lease_expires_at = NULL,
            updated_at = ?
      WHERE id = 1
        AND owner_token = ?`,
    [new Date().toISOString(), lease.ownerToken]
  );
  return result.changes === 1;
}

export function keepCronLeaseAlive(lease) {
  const timer = setInterval(async () => {
    try {
      const renewed = await renewCronLease(lease);
      if (!renewed) clearInterval(timer);
    } catch (error) {
      console.error("Could not renew cron execution lock:", error?.message || error);
    }
  }, CRON_LEASE_HEARTBEAT_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
