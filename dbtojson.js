const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Path to your SQLite database file
const dbPath = 'collection.db'; // Replace with your database path

// Open a connection to the SQLite database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// Query the database and convert results to JSON
const tableName = 'data'; // Replace with your table name
db.all(`SELECT d.transid, d.website, d.name, d.image, d.link, MIN(dp.price) AS min_price, MAX(dp.price) AS max_price, latest_price_info.price AS current_price, latest_price_info.date AS current_price_date FROM data d LEFT JOIN dataprice dp ON d.transid = dp.dataid LEFT JOIN ( SELECT dataid, price, date FROM dataprice WHERE ROWID IN (SELECT MAX(ROWID) FROM dataprice GROUP BY dataid) ) AS latest_price_info ON d.transid = latest_price_info.dataid GROUP BY d.transid, d.website, d.name, d.image, d.link ORDER BY d.transid DESC;`, [], (err, rows) => {
    if (err) {
        console.error('Error executing query:', err.message);
    } else {
        // Fetch column names dynamically
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        // Convert rows to JSON format
        const jsonData = JSON.stringify(rows, null, 4);

        // Print JSON data
        console.log(jsonData);

        // Optionally, write to a file
        fs.writeFileSync('output.json', jsonData, (err) => {
            if (err) {
                console.error('Error writing to file:', err.message);
            } else {
                console.log('Data written to output.json');
            }
        });
    }

    // Close the database connection
    db.close((err) => {
        if (err) {
            console.error('Error closing the database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
});
