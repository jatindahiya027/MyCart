function samePrice(a, b) {
  return Number(a) === Number(b);
}

export async function insertCompressedPricePoint(db, dataid, date, price) {
  const latestRows = await db.all(
    "SELECT rowid, price FROM dataprice WHERE dataid = ? ORDER BY rowid DESC LIMIT 2",
    [dataid]
  );

  const latest = latestRows[0];
  const previous = latestRows[1];

  if (latest && samePrice(latest.price, price)) {
    if (previous && samePrice(previous.price, price)) {
      await db.run("UPDATE dataprice SET date = ?, price = ? WHERE rowid = ?", [
        date,
        price,
        latest.rowid,
      ]);
      return { action: "updated" };
    }

    await db.run("INSERT INTO dataprice (dataid, date, price) VALUES (?, ?, ?)", [
      dataid,
      date,
      price,
    ]);
    return { action: "inserted" };
  }

  await db.run("INSERT INTO dataprice (dataid, date, price) VALUES (?, ?, ?)", [
    dataid,
    date,
    price,
  ]);
  return { action: "inserted" };
}

export async function compactPriceHistory(db, dataid) {
  const rows = await db.all(
    "SELECT rowid, price FROM dataprice WHERE dataid = ? ORDER BY rowid ASC",
    [dataid]
  );

  const rowIdsToDelete = [];
  let run = [];

  const flushRun = () => {
    if (run.length > 2) {
      rowIdsToDelete.push(...run.slice(1, -1).map((row) => row.rowid));
    }
    run = [];
  };

  for (const row of rows) {
    if (!run.length || samePrice(run[0].price, row.price)) {
      run.push(row);
    } else {
      flushRun();
      run.push(row);
    }
  }

  flushRun();

  if (!rowIdsToDelete.length) {
    return 0;
  }

  const placeholders = rowIdsToDelete.map(() => "?").join(",");
  await db.run(`DELETE FROM dataprice WHERE rowid IN (${placeholders})`, rowIdsToDelete);

  return rowIdsToDelete.length;
}

export function normalizeProductIds(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
}

export async function clearPriceHistory(db, productIds) {
  const ids = normalizeProductIds(productIds);
  if (!ids.length) return 0;

  let deleted = 0;
  for (const id of ids) {
    const result = await db.run(
      `DELETE FROM dataprice
       WHERE dataid = ?
         AND rowid <> (
           SELECT MAX(rowid) FROM dataprice WHERE dataid = ?
         )`,
      [id, id]
    );
    deleted += result.changes || 0;
  }
  return deleted;
}
