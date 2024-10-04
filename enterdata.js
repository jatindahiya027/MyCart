// Connecting to or creating a new SQLite database file
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database(
  "./collection.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      return console.error(err.message);
    }
    //console.log("Connected to the SQLite database.");
  }
);

// Serialize method ensures that database queries are executed sequentially
db.serialize(() => {

  db.run(
    `INSERT INTO data (website, link, name, image) VALUES
    ('amazon', 'https://www.amazon.in/ASUS-Vivobook-i5-12500H-Laptop-X1502ZA-EJ541WS/dp/B0C7H6SSC8?ref_=pd_hp_d_btf_unk_B0C7H6SSC8','ASUS Vivobook 15 Thin and Light Laptop', 'https://m.media-amazon.com/images/I/71dEitCVLxL._SY355_.jpg')
     `,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      //console.log("Inserted data into categories table.");
    }
  );
  db.run(
    `INSERT INTO dataprice (dataid,date, price) VALUES
    (2, '	2/10/2024, 10:40:22 pm', 1000),
    (2, '	3/10/2024, 10:40:22 pm', 2000),
    (2, '	2/10/2024, 10:40:22 pm', 7000),
    (2, '	3/10/2024, 10:40:22 pm', 8000)

     `,
    (err) => {
      if (err) {
        return console.error(err.message);
      }
      //console.log("Inserted data into categories table.");
    }
  );


});

db.close((err) => {
  if (err) {
    return console.error(err.message);
  }
  //console.log("Closed the database connection.");
});
