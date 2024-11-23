import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db = null;

async function initializeDatabase() {
  if (!db) {
    db = await open({
      filename: "./collection.db", // Specify the database file path
      driver: sqlite3.Database, // Specify the database driver
    });

    // Create indexes for performance optimization
    const indexQueries = [
      "CREATE INDEX IF NOT EXISTS idx_data_transid ON data(transid);",
      "CREATE INDEX IF NOT EXISTS idx_dataprice_dataid ON dataprice(dataid);",
      "CREATE INDEX IF NOT EXISTS idx_dataprice_price ON dataprice(price);",
      "CREATE INDEX IF NOT EXISTS idx_dataprice_date ON dataprice(date);",
    ];

    // Execute each index query
    for (const query of indexQueries) {
      await db.exec(query);
    }

    console.log("Indexes created successfully!");
  }
}

async function fetchData(query) {
  if (!db) {
    await initializeDatabase(); // Ensure the database is initialized
  }
  return db.all(query); // Execute your data fetch query
}

// Example usage
(async () => {
  await initializeDatabase(); // Initialize database and create indexes
})();
