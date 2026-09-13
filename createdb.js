const sqlite3 = require("sqlite3").verbose();

// Connecting to or creating a new SQLite database file
const db = new sqlite3.Database(
  "./collection.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      return console.error(err.message);
    }
    //console.log("Connected to the SQlite database.");
  }
);

// Serialize method ensures that database queries are executed sequentially
db.serialize(() => {


  db.run(
    `CREATE TABLE IF NOT EXISTS data (
        transid INTEGER PRIMARY KEY,
        website TEXT,
        name TEXT,
        image TEXT,
        link TEXT
      )`,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      //console.log("Created transcations table.");
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS dataprice (
        dataid INTEGER,
        date DATE,
        price INTEGER
      )`,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      //console.log("Created transcations table.");
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS update_runs (
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
      )`,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        notification_email TEXT NOT NULL DEFAULT '',
        gmail_password_encrypted TEXT,
        cron_interval_hours INTEGER NOT NULL DEFAULT 4,
        updated_at TEXT NOT NULL
      )`,
    (err) => {
      if (err) return console.error(err.message);
      db.run(
        `INSERT OR IGNORE INTO app_settings
          (id, notification_email, gmail_password_encrypted, cron_interval_hours, updated_at)
         VALUES (1, '', NULL, 4, ?)`,
        [new Date().toISOString()]
      );
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS scrape_logs (
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
      )`,
    (err) => {
      if (err) return console.error(err.message);
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_scrape_logs_occurred_at ON scrape_logs(occurred_at DESC)"
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_id ON scrape_logs(product_id)"
      );
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS cron_control (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        schedule_version INTEGER NOT NULL DEFAULT 1,
        owner_token TEXT,
        lease_expires_at TEXT,
        updated_at TEXT NOT NULL
      )`,
    (err) => {
      if (err) return console.error(err.message);
      db.run(
        `INSERT OR IGNORE INTO cron_control
          (id, schedule_version, owner_token, lease_expires_at, updated_at)
         VALUES (1, 1, NULL, NULL, ?)`,
        [new Date().toISOString()]
      );
    }
  );
  
});
