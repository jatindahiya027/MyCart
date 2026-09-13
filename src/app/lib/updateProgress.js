import { getDatabase } from "./database";

let progressDb = null;
let didResetProgressForProcess = false;

async function getDb() {
  if (!progressDb) {
    progressDb = await getDatabase();
  }

  await progressDb.exec(`
    CREATE TABLE IF NOT EXISTS update_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      processed INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 0,
      failure INTEGER NOT NULL DEFAULT 0,
      current_item TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    )
  `);

  if (!didResetProgressForProcess) {
    await progressDb.run("DELETE FROM update_runs");
    didResetProgressForProcess = true;
  }

  return progressDb;
}

function now() {
  return new Date().toISOString();
}

export async function startUpdateRun(source, total) {
  const db = await getDb();
  const timestamp = now();
  const result = await db.run(
    `INSERT INTO update_runs
      (source, status, total, processed, success, failure, started_at, updated_at)
     VALUES (?, 'running', ?, 0, 0, 0, ?, ?)`,
    [source, total, timestamp, timestamp]
  );

  return result.lastID;
}

export async function recordUpdateProgress(runId, progress) {
  if (!runId) return;
  const db = await getDb();
  await db.run(
    `UPDATE update_runs
     SET processed = ?,
         success = ?,
         failure = ?,
         current_item = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      progress.processed,
      progress.success,
      progress.failure,
      progress.currentItem || null,
      now(),
      runId,
    ]
  );
}

export async function finishUpdateRun(runId, progress) {
  if (!runId) return;
  const db = await getDb();
  const timestamp = now();
  await db.run(
    `UPDATE update_runs
     SET status = 'completed',
         processed = ?,
         success = ?,
         failure = ?,
         current_item = NULL,
         updated_at = ?,
         finished_at = ?
     WHERE id = ?`,
    [progress.processed, progress.success, progress.failure, timestamp, timestamp, runId]
  );
}

export async function cancelUpdateRun(runId, progress) {
  if (!runId) return;
  const db = await getDb();
  const timestamp = now();
  await db.run(
    `UPDATE update_runs
     SET status = 'canceled',
         processed = ?,
         success = ?,
         failure = ?,
         current_item = NULL,
         updated_at = ?,
         finished_at = ?
     WHERE id = ?`,
    [progress.processed, progress.success, progress.failure, timestamp, timestamp, runId]
  );
}

export async function failUpdateRun(runId, progress, error) {
  if (!runId) return;
  const db = await getDb();
  const timestamp = now();
  await db.run(
    `UPDATE update_runs
     SET status = 'failed',
         processed = ?,
         success = ?,
         failure = ?,
         current_item = NULL,
         error = ?,
         updated_at = ?,
         finished_at = ?
     WHERE id = ?`,
    [
      progress.processed,
      progress.success,
      progress.failure,
      error?.message || String(error || "Unknown error"),
      timestamp,
      timestamp,
      runId,
    ]
  );
}

export async function getLatestUpdateRun() {
  const db = await getDb();
  const run = await db.get("SELECT * FROM update_runs ORDER BY id DESC LIMIT 1");
  return run || null;
}

export async function requestStopLatestUpdateRun() {
  const db = await getDb();
  const run = await db.get(
    "SELECT * FROM update_runs ORDER BY id DESC LIMIT 1"
  );

  if (!run || (run.status !== "running" && run.status !== "cancel_requested")) {
    return run || null;
  }

  const timestamp = now();
  await db.run(
    `UPDATE update_runs
     SET status = 'canceled',
         current_item = NULL,
         updated_at = ?,
         finished_at = ?
     WHERE id = ?`,
    [timestamp, timestamp, run.id]
  );

  return getLatestUpdateRun();
}

export async function shouldStopUpdateRun(runId) {
  if (!runId) return false;
  const db = await getDb();
  const run = await db.get("SELECT status FROM update_runs WHERE id = ?", [runId]);
  return run?.status === "cancel_requested" || run?.status === "canceled";
}
