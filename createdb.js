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
  
});
