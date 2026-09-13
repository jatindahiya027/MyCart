import { getDatabase } from "./database.js";
import { bumpCronScheduleVersion, nextCronRunAt } from "./cronControl.js";
import { decryptSecret, encryptSecret } from "./secrets.js";

export const DEFAULT_CRON_INTERVAL_HOURS = 4;
export const MIN_CRON_INTERVAL_HOURS = 1;
export const MAX_CRON_INTERVAL_HOURS = 24;

export function normalizeCronIntervalHours(value) {
  const hours = Number(value);
  if (
    !Number.isInteger(hours) ||
    hours < MIN_CRON_INTERVAL_HOURS ||
    hours > MAX_CRON_INTERVAL_HOURS
  ) {
    throw new Error(
      `Cron interval must be a whole number from ${MIN_CRON_INTERVAL_HOURS} to ${MAX_CRON_INTERVAL_HOURS}.`
    );
  }
  return hours;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function getSettingsRow(providedDb = null) {
  const db = providedDb || (await getDatabase());
  return db.get("SELECT * FROM app_settings WHERE id = 1");
}

export async function getPublicSettings(providedDb = null) {
  const row = await getSettingsRow(providedDb);
  const fallbackEmail = process.env.EMAIL_TO || process.env.EMAIL_USER || "";
  return {
    notificationEmail: row?.notification_email || fallbackEmail,
    cronIntervalHours:
      row?.cron_interval_hours || DEFAULT_CRON_INTERVAL_HOURS,
    cronEnabled: row?.cron_enabled !== 0,
    gmailAppPasswordConfigured: Boolean(
      row?.gmail_password_encrypted || process.env.EMAIL_PASS
    ),
    passwordSource: row?.gmail_password_encrypted
      ? "app"
      : process.env.EMAIL_PASS
      ? "environment"
      : "none",
  };
}

export async function saveSettings({
  notificationEmail,
  gmailAppPassword,
  clearGmailAppPassword = false,
  cronIntervalHours,
  cronEnabled = true,
}, { db: providedDb = null, now = new Date() } = {}) {
  const db = providedDb || (await getDatabase());
  const email = String(notificationEmail || "").trim();
  const hours = normalizeCronIntervalHours(cronIntervalHours);
  const enabled = cronEnabled !== false;
  if (email && !isValidEmail(email)) {
    throw new Error("Enter a valid email address.");
  }

  const existing = await getSettingsRow(db);
  let encryptedPassword = existing?.gmail_password_encrypted || null;
  if (clearGmailAppPassword) {
    encryptedPassword = null;
  } else if (typeof gmailAppPassword === "string" && gmailAppPassword.trim()) {
    const normalizedPassword = gmailAppPassword.replace(/\s+/g, "");
    if (normalizedPassword.length < 8) {
      throw new Error("The Gmail app password must be at least 8 characters.");
    }
    if (!email) {
      throw new Error("Enter the Gmail address before saving its app password.");
    }
    encryptedPassword = await encryptSecret(normalizedPassword);
  }

  const nextRunAt = enabled ? nextCronRunAt(hours, now).toISOString() : null;
  let cronScheduleVersion;
  await db.exec("BEGIN IMMEDIATE");
  try {
    await db.run(
      `INSERT INTO app_settings
        (id, notification_email, gmail_password_encrypted, cron_interval_hours, cron_enabled, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         notification_email = excluded.notification_email,
         gmail_password_encrypted = excluded.gmail_password_encrypted,
         cron_interval_hours = excluded.cron_interval_hours,
         cron_enabled = excluded.cron_enabled,
         updated_at = excluded.updated_at`,
      [email, encryptedPassword, hours, enabled ? 1 : 0, now.toISOString()]
    );

    cronScheduleVersion = await bumpCronScheduleVersion(db, {
      nextRunAt,
      clearNextRunAt: !enabled,
      now,
    });
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
  return { ...(await getPublicSettings(db)), cronScheduleVersion };
}

export async function getMailCredentials() {
  const row = await getSettingsRow();
  if (row?.gmail_password_encrypted) {
    const email = String(row.notification_email || "").trim();
    if (!email) return null;
    return {
      user: email,
      to: email,
      password: await decryptSecret(row.gmail_password_encrypted),
    };
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return {
    user: process.env.EMAIL_USER,
    to:
      row?.notification_email ||
      process.env.EMAIL_TO ||
      process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
  };
}

export async function getCronIntervalHours() {
  const row = await getSettingsRow();
  return normalizeCronIntervalHours(
    row?.cron_interval_hours || DEFAULT_CRON_INTERVAL_HOURS
  );
}
