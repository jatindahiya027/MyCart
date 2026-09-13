import assert from "node:assert/strict";
import test from "node:test";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

import { clearPriceHistory, normalizeProductIds } from "../src/app/lib/priceHistory.js";
import {
  activateCronTask,
  acquireCronLease,
  acquireDueCronLease,
  deactivateCronTask,
  ensureCronNextRunAt,
  initializeCronRuntime,
  isCronScheduleCurrent,
  nextCronRunAt,
  releaseCronLease,
  shouldActivateCronTask,
} from "../src/app/lib/cronControl.js";
import { decryptSecret, encryptSecret } from "../src/app/lib/secrets.js";
import {
  normalizeCronIntervalHours,
  saveSettings,
} from "../src/app/lib/settings.js";
import { recordScrapeError } from "../src/app/lib/scrapeLogs.js";
import { getWebsite, SUPPORTED_WEBSITES } from "../src/app/lib/scraper.js";
import {
  extractProductUrls,
  mapWithConcurrency,
} from "../src/app/lib/addProducts.js";
import {
  findSupportedStore,
  SUPPORTED_STORES,
  unsupportedStoreMessage,
} from "../src/app/lib/supportedSites.js";
import { normalizeProductImageUrl } from "../src/app/lib/productImage.js";
import { filterProducts } from "../src/app/lib/productSearch.js";

process.env.MYCART_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

test("Gmail app passwords are encrypted and authenticated", async () => {
  const plaintext = "abcdefghijklmnop";
  const encrypted = await encryptSecret(plaintext);

  assert.notEqual(encrypted, plaintext);
  assert.ok(encrypted.startsWith("v1."));
  assert.equal(await decryptSecret(encrypted), plaintext);

  const parts = encrypted.split(".");
  parts[2] = `${parts[2].startsWith("A") ? "B" : "A"}${parts[2].slice(1)}`;
  const tampered = parts.join(".");
  await assert.rejects(() => decryptSecret(tampered));
});

test("cron interval only accepts whole hours from 1 through 24", () => {
  assert.equal(normalizeCronIntervalHours(1), 1);
  assert.equal(normalizeCronIntervalHours("24"), 24);
  assert.throws(() => normalizeCronIntervalHours(0));
  assert.throws(() => normalizeCronIntervalHours(25));
  assert.throws(() => normalizeCronIntervalHours(1.5));
});

test("replacing a cron schedule stops and destroys the previous task", () => {
  const calls = [];
  const state = activateCronTask(
    {
      task: {
        stop: () => calls.push("old:stop"),
        destroy: () => calls.push("old:destroy"),
      },
    },
    { start: () => calls.push("new:start") },
    8,
    3
  );
  assert.deepEqual(calls, ["old:stop", "old:destroy", "new:start"]);
  assert.equal(state.hours, 8);
  assert.equal(state.version, 3);
});

test("disabling a cron schedule disposes the active task", () => {
  const calls = [];
  const state = deactivateCronTask(
    {
      task: {
        stop: () => calls.push("active:stop"),
        destroy: () => calls.push("active:destroy"),
      },
    },
    8,
    4
  );

  assert.deepEqual(calls, ["active:stop", "active:destroy"]);
  assert.deepEqual(state, { task: null, hours: 8, version: 4, enabled: false });
});

test("cron execution lease rejects overlaps and obsolete schedules", async () => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE cron_control (
      id INTEGER PRIMARY KEY,
      schedule_version INTEGER NOT NULL,
      owner_token TEXT,
      lease_expires_at TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT INTO cron_control VALUES (1, 1, NULL, NULL, 'initial');
  `);

  const first = await acquireCronLease({
    scheduleVersion: 1,
    db,
    ownerToken: "first",
  });
  assert.ok(first);
  assert.equal(await isCronScheduleCurrent(1, db), true);
  assert.equal(
    await acquireCronLease({ scheduleVersion: 1, db, ownerToken: "overlap" }),
    null
  );

  await db.run("UPDATE cron_control SET schedule_version = 2 WHERE id = 1");
  assert.equal(await isCronScheduleCurrent(1, db), false);
  assert.equal(await isCronScheduleCurrent(2, db), true);
  assert.equal(
    await acquireCronLease({ scheduleVersion: 1, db, ownerToken: "obsolete" }),
    null
  );
  assert.equal(
    await acquireCronLease({ scheduleVersion: 2, db, ownerToken: "new-overlap" }),
    null
  );

  assert.equal(await releaseCronLease(first), true);
  const replacement = await acquireCronLease({
    scheduleVersion: 2,
    db,
    ownerToken: "replacement",
  });
  assert.ok(replacement);
  assert.equal(await releaseCronLease(replacement), true);
  await db.close();
});

test("cron due time is exact for every allowed interval and survives restart", async () => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE app_settings (
      id INTEGER PRIMARY KEY,
      cron_interval_hours INTEGER NOT NULL,
      cron_enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO app_settings VALUES (1, 23, 1);
    CREATE TABLE cron_control (
      id INTEGER PRIMARY KEY,
      schedule_version INTEGER NOT NULL,
      owner_token TEXT,
      lease_expires_at TEXT,
      next_run_at TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT INTO cron_control VALUES (1, 7, NULL, NULL, NULL, 'initial');
  `);
  const startedAt = new Date("2026-08-21T00:30:00.000Z");
  const expectedFirstRun = new Date("2026-08-21T23:30:00.000Z");

  assert.equal(nextCronRunAt(23, startedAt).toISOString(), expectedFirstRun.toISOString());
  assert.equal(
    await ensureCronNextRunAt({
      scheduleVersion: 7,
      hours: 23,
      db,
      now: startedAt,
    }),
    expectedFirstRun.toISOString()
  );
  assert.equal(
    await acquireDueCronLease({
      scheduleVersion: 7,
      hours: 23,
      db,
      now: new Date("2026-08-21T23:29:59.000Z"),
      ownerToken: "too-early",
    }),
    null
  );

  const lease = await acquireDueCronLease({
    scheduleVersion: 7,
    hours: 23,
    db,
    now: expectedFirstRun,
    ownerToken: "due-run",
  });
  assert.ok(lease);
  assert.equal(
    await acquireDueCronLease({
      scheduleVersion: 7,
      hours: 23,
      db,
      now: expectedFirstRun,
      ownerToken: "overlap",
    }),
    null
  );
  assert.equal(
    (await db.get("SELECT next_run_at FROM cron_control WHERE id = 1")).next_run_at,
    "2026-08-22T22:30:00.000Z"
  );
  assert.equal(await releaseCronLease(lease), true);
  await db.close();
});

test("cron startup is singleton and stale schedules cannot replace newer ones", async () => {
  const runtime = {};
  let initializationCount = 0;
  const first = initializeCronRuntime(runtime, async () => {
    initializationCount += 1;
    return "started";
  });
  const second = initializeCronRuntime(runtime, async () => {
    initializationCount += 1;
    return "duplicate";
  });

  assert.equal(first, second);
  assert.equal(await first, "started");
  assert.equal(initializationCount, 1);
  assert.equal(shouldActivateCronTask(null, 4, 1), true);
  assert.equal(shouldActivateCronTask({ task: {}, hours: 4, version: 2 }, 4, 2), false);
  assert.equal(shouldActivateCronTask({ task: {}, hours: 4, version: 3 }, 8, 2), false);
  assert.equal(shouldActivateCronTask({ task: {}, hours: 4, version: 3 }, 8, 4), true);
});

test("saving a manual cron interval atomically persists its next run and version", async () => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE app_settings (
      id INTEGER PRIMARY KEY,
      notification_email TEXT NOT NULL DEFAULT '',
      gmail_password_encrypted TEXT,
      cron_interval_hours INTEGER NOT NULL,
      cron_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    INSERT INTO app_settings VALUES (1, '', NULL, 4, 1, 'initial');
    CREATE TABLE cron_control (
      id INTEGER PRIMARY KEY,
      schedule_version INTEGER NOT NULL,
      owner_token TEXT,
      lease_expires_at TEXT,
      next_run_at TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT INTO cron_control VALUES (1, 1, NULL, NULL, NULL, 'initial');
  `);
  const savedAt = new Date("2026-08-21T01:00:00.000Z");

  const settings = await saveSettings(
    {
      notificationEmail: "",
      gmailAppPassword: "",
      clearGmailAppPassword: false,
      cronIntervalHours: 5,
    },
    { db, now: savedAt }
  );
  const row = await db.get(`
    SELECT s.cron_interval_hours, c.schedule_version, c.next_run_at
      FROM app_settings s JOIN cron_control c ON c.id = 1
     WHERE s.id = 1
  `);

  assert.equal(settings.cronIntervalHours, 5);
  assert.deepEqual(row, {
    cron_interval_hours: 5,
    schedule_version: 2,
    next_run_at: "2026-08-21T06:00:00.000Z",
  });

  await saveSettings(
    {
      notificationEmail: "",
      gmailAppPassword: "",
      clearGmailAppPassword: false,
      cronIntervalHours: 5,
    },
    { db, now: new Date("2026-08-21T02:00:00.000Z") }
  );
  assert.deepEqual(
    await db.get(
      "SELECT schedule_version, next_run_at FROM cron_control WHERE id = 1"
    ),
    {
      schedule_version: 3,
      next_run_at: "2026-08-21T07:00:00.000Z",
    }
  );

  await assert.rejects(() =>
    saveSettings(
      {
        notificationEmail: "",
        gmailAppPassword: "",
        clearGmailAppPassword: false,
        cronIntervalHours: 25,
      },
      { db, now: new Date("2026-08-21T03:00:00.000Z") }
    )
  );
  assert.deepEqual(
    await db.get(
      "SELECT schedule_version, next_run_at FROM cron_control WHERE id = 1"
    ),
    {
      schedule_version: 3,
      next_run_at: "2026-08-21T07:00:00.000Z",
    }
  );
  await db.close();
});

test("turning cron off clears the next run and blocks due leases", async () => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE app_settings (
      id INTEGER PRIMARY KEY,
      notification_email TEXT NOT NULL DEFAULT '',
      gmail_password_encrypted TEXT,
      cron_interval_hours INTEGER NOT NULL,
      cron_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    INSERT INTO app_settings VALUES (1, '', NULL, 4, 1, 'initial');
    CREATE TABLE cron_control (
      id INTEGER PRIMARY KEY,
      schedule_version INTEGER NOT NULL,
      owner_token TEXT,
      lease_expires_at TEXT,
      next_run_at TEXT,
      updated_at TEXT NOT NULL
    );
    INSERT INTO cron_control VALUES (1, 1, NULL, NULL, '2026-08-21T05:00:00.000Z', 'initial');
  `);

  const settings = await saveSettings(
    {
      notificationEmail: "",
      gmailAppPassword: "",
      clearGmailAppPassword: false,
      cronIntervalHours: 4,
      cronEnabled: false,
    },
    { db, now: new Date("2026-08-21T06:00:00.000Z") }
  );

  assert.equal(settings.cronEnabled, false);
  assert.deepEqual(
    await db.get(`
      SELECT s.cron_enabled, c.schedule_version, c.next_run_at
        FROM app_settings s JOIN cron_control c ON c.id = 1
       WHERE s.id = 1
    `),
    { cron_enabled: 0, schedule_version: 2, next_run_at: null }
  );
  await db.run(
    "UPDATE cron_control SET next_run_at = '2026-08-21T05:00:00.000Z' WHERE id = 1"
  );
  assert.equal(
    await acquireDueCronLease({
      scheduleVersion: 2,
      hours: 4,
      db,
      now: new Date("2026-08-21T06:00:00.000Z"),
      ownerToken: "disabled-run",
    }),
    null
  );
  await db.close();
});

test("search filtering remains active when refreshed product data replaces the dataset", () => {
  const initialItems = [
    { transid: 1, website: "Adidas", name: "Samba OG Shoes", link: "https://adidas.co.in/samba" },
    { transid: 2, website: "Zara", name: "Linen Shirt", link: "https://zara.com/shirt" },
  ];
  const refreshedItems = [
    { ...initialItems[0], current_price: 7999 },
    { ...initialItems[1], current_price: 2990 },
    { transid: 3, website: "Puma", name: "Running Shoes", link: "https://puma.com/run" },
  ];

  assert.deepEqual(filterProducts(initialItems, "shoe").map((item) => item.transid), [1]);
  assert.deepEqual(filterProducts(refreshedItems, "shoe").map((item) => item.transid), [1, 3]);
  assert.deepEqual(filterProducts(refreshedItems, "zara.com").map((item) => item.transid), [2]);
});

test("product id normalization removes invalid values and duplicates", () => {
  assert.deepEqual(normalizeProductIds([3, "3", 2, 0, -1, "bad"]), [3, 2]);
});

test("clearing price history preserves the latest price for each product", async () => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  await db.exec("CREATE TABLE dataprice (dataid INTEGER, date TEXT, price REAL)");
  await db.run("INSERT INTO dataprice VALUES (1, 'first', 100)");
  await db.run("INSERT INTO dataprice VALUES (1, 'second', 90)");
  await db.run("INSERT INTO dataprice VALUES (1, 'latest', 80)");
  await db.run("INSERT INTO dataprice VALUES (2, 'only', 200)");

  assert.equal(await clearPriceHistory(db, [1, 2]), 2);
  assert.deepEqual(await db.all("SELECT dataid, date, price FROM dataprice ORDER BY dataid"), [
    { dataid: 1, date: "latest", price: 80 },
    { dataid: 2, date: "only", price: 200 },
  ]);
  await db.close();
});

test("scrape errors retain complete product context", async () => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE scrape_logs (
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
    )
  `);

  await recordScrapeError({
    runId: 9,
    productId: 42,
    source: "manual-selected",
    product: {
      transid: 42,
      website: "zara",
      name: "Test Shirt",
      image: "https://static.zara.net/test.jpg",
      link: "https://www.zara.com/test",
      current_price: 3950,
    },
    error: new Error("Timed out"),
    db,
  });

  const log = await db.get("SELECT * FROM scrape_logs");
  assert.equal(log.run_id, 9);
  assert.equal(log.product_id, 42);
  assert.equal(log.product_name, "Test Shirt");
  assert.equal(log.current_price, 3950);
  assert.equal(log.error_message, "Timed out");
  assert.match(log.error_details, /Timed out/);
  await db.close();
});

test("new storefront domains are accepted by the application adapter", () => {
  assert.equal(getWebsite("https://www.meesho.com/product/p/abc"), "meesho");
  assert.equal(getWebsite("https://in.puma.com/in/en/pd/test"), "puma");
  assert.equal(getWebsite("https://store.google.com/in/product/test"), "google");
  assert.equal(getWebsite("https://www2.hm.com/en_in/productpage.123.html"), "hm");
  assert.equal(getWebsite("https://store.cosco.in/products/test"), "cosco");
  assert.equal(getWebsite("https://www.damilano.com/products/test"), "damilano");
  assert.ok(SUPPORTED_WEBSITES.size >= 220);
});

test("supported store catalog validates primary domains and aliases", () => {
  assert.equal(SUPPORTED_STORES.length, 223);
  assert.equal(
    findSupportedStore("https://www.adidas.co.in/samba-og-shoes/B75806.html")?.site,
    "adidas"
  );
  assert.equal(
    findSupportedStore("https://www.bata.com/in/product/test")?.site,
    "bata"
  );
  assert.equal(findSupportedStore("https://example.com/product"), null);
  assert.equal(
    unsupportedStoreMessage("https://example.com/product"),
    "example.com is not supported by MyCart."
  );
});

test("cropped retailer thumbnails are upgraded without changing complete assets", () => {
  assert.equal(
    normalizeProductImageUrl(
      "https://images.vegnonveg.com/resized/510X765/15749/shoe.jpg?format=webp"
    ),
    "https://images.vegnonveg.com/resized/680X800/15749/shoe.jpg?format=webp"
  );
  assert.equal(
    normalizeProductImageUrl(
      "https://images.vegnonveg.com/resized/1360X1600/15749/shoe.jpg?format=webp"
    ),
    "https://images.vegnonveg.com/resized/1360X1600/15749/shoe.jpg?format=webp"
  );
  assert.equal(
    normalizeProductImageUrl("https://cdn.example.com/products/shoe.jpg"),
    "https://cdn.example.com/products/shoe.jpg"
  );
});

test("pasted product URLs are extracted, normalized, and deduplicated", () => {
  assert.deepEqual(
    extractProductUrls(
      "See https://example.com/a, then https://example.com/b? and https://example.com/a"
    ),
    ["https://example.com/a", "https://example.com/b?"]
  );
});

test("multi-product work is concurrency limited", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
});
