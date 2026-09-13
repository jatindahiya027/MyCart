export async function addPriceIndicators(db, items) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const ids = items.map((item) => item.transid).filter((id) => id !== undefined);
  if (ids.length === 0) return items;

  const placeholders = ids.map(() => "?").join(", ");
  const latestRows = await db.all(
    `SELECT dataid, price, price_rank FROM (
      SELECT
        dataid,
        price,
        ROW_NUMBER() OVER (PARTITION BY dataid ORDER BY rowid DESC) AS price_rank
      FROM dataprice
      WHERE dataid IN (${placeholders})
    )
    WHERE price_rank <= 2
    ORDER BY dataid, price_rank`,
    ids
  );

  const rowsByDataId = new Map();
  latestRows.forEach((row) => {
    const rows = rowsByDataId.get(row.dataid) ?? [];
    rows[row.price_rank - 1] = row;
    rowsByDataId.set(row.dataid, rows);
  });

  return items.map((item) => {
    const latestPriceRows = rowsByDataId.get(item.transid) ?? [];
    const previousPrice = latestPriceRows[1]?.price ?? null;
    const currentPrice = Number(item.current_price);
    const minPrice = Number(item.min_price);
    const previousPriceNumber =
      previousPrice === null ? null : Number(previousPrice);

    return {
      ...item,
      previous_price: previousPrice,
      is_lowest_price:
        Number.isFinite(currentPrice) &&
        Number.isFinite(minPrice) &&
        currentPrice <= minPrice,
      is_price_drop:
        previousPriceNumber !== null &&
        Number.isFinite(currentPrice) &&
        Number.isFinite(previousPriceNumber) &&
        currentPrice < previousPriceNumber,
    };
  });
}
