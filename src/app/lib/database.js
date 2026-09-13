import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db = null;
let initPromise = null;

export async function initializeDatabase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const database = await open({
      filename: "./collection.db",
      driver: sqlite3.Database,
    });

    await database.exec(`
      CREATE TABLE IF NOT EXISTS data (
        transid INTEGER PRIMARY KEY,
        website TEXT,
        name TEXT,
        image TEXT,
        link TEXT
      );

      CREATE TABLE IF NOT EXISTS dataprice (
        dataid INTEGER,
        date DATE,
        price INTEGER
      );

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
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        notification_email TEXT NOT NULL DEFAULT '',
        gmail_password_encrypted TEXT,
        cron_interval_hours INTEGER NOT NULL DEFAULT 4,
        cron_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scrape_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER,
        product_id INTEGER,
        source TEXT NOT NULL,
        website TEXT,
        product_name TEXT,
        product_image_url TEXT,
        product_url TEXT,
        current_price REAL,
        error_message TEXT NOT NULL,
        error_details TEXT,
        occurred_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cron_control (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schedule_version INTEGER NOT NULL DEFAULT 1,
        owner_token TEXT,
        lease_expires_at TEXT,
        next_run_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scrape_logs_occurred_at
        ON scrape_logs(occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_id
        ON scrape_logs(product_id);
    `);

    const cronColumns = await database.all("PRAGMA table_info(cron_control)");
    if (!cronColumns.some((column) => column.name === "next_run_at")) {
      await database.exec("ALTER TABLE cron_control ADD COLUMN next_run_at TEXT");
    }

    const settingsColumns = await database.all("PRAGMA table_info(app_settings)");
    if (!settingsColumns.some((column) => column.name === "cron_enabled")) {
      await database.exec(
        "ALTER TABLE app_settings ADD COLUMN cron_enabled INTEGER NOT NULL DEFAULT 1"
      );
    }

    await database.run(
      `INSERT OR IGNORE INTO app_settings
        (id, notification_email, gmail_password_encrypted, cron_interval_hours, cron_enabled, updated_at)
       VALUES (1, '', NULL, 4, 1, ?)`,
      [new Date().toISOString()]
    );

    await database.run(
      `INSERT OR IGNORE INTO cron_control
        (id, schedule_version, owner_token, lease_expires_at, updated_at)
       VALUES (1, 1, NULL, NULL, ?)`,
      [new Date().toISOString()]
    );

    db = database;
    return database;
  })();

  return initPromise;
}

export async function getDatabase() {
  if (db) return db;
  return initializeDatabase();
}

initializeDatabase().catch((error) => {
  console.error("Failed to initialize database:", error);
});
