import { getDatabase } from "./database";
import { getAndCacheProductList } from "./productList";
import { compactPriceHistory, insertCompressedPricePoint } from "./priceHistory";
import { scrapeProduct } from "./scraper";
import { recordScrapeError } from "./scrapeLogs";
import { normalizeProductIds } from "./priceHistory";
import {
  cancelUpdateRun,
  failUpdateRun,
  finishUpdateRun,
  recordUpdateProgress,
  shouldStopUpdateRun,
  startUpdateRun,
} from "./updateProgress";

export async function refreshProducts(
  source,
  requestedProductIds = null,
  { shouldContinue = null } = {}
) {
  const db = await getDatabase();
  const productIds = normalizeProductIds(requestedProductIds);
  const whereClause = productIds.length
    ? `WHERE d.transid IN (${productIds.map(() => "?").join(", ")})`
    : "";
  const trackedItems = await db.all(
    `SELECT d.transid, d.website, d.name, d.image, d.link,
      (SELECT price FROM dataprice WHERE dataid = d.transid ORDER BY rowid DESC LIMIT 1) AS current_price
     FROM data d
     ${whereClause}
     ORDER BY d.transid`,
    productIds
  );
  const progress = {
    processed: 0,
    success: 0,
    failure: 0,
    currentItem: null,
  };
  const runId = await startUpdateRun(source, trackedItems.length);
  let canceled = false;

  try {
    for (const item of trackedItems) {
      const scheduleIsCurrent = shouldContinue
        ? await shouldContinue()
        : true;
      if (!scheduleIsCurrent || (await shouldStopUpdateRun(runId))) {
        canceled = true;
        break;
      }

      progress.currentItem = item.link;
      await recordUpdateProgress(runId, progress);

      try {
        const product = await scrapeProduct(item.link);
        await compactPriceHistory(db, item.transid);
        await insertCompressedPricePoint(
          db,
          item.transid,
          new Date().toLocaleString(),
          product.product_price
        );
        progress.success += 1;
      } catch (error) {
        progress.failure += 1;
        console.error(`Scrape failed for ${item.link}:`, error?.message || error);
        await recordScrapeError({
          runId,
          productId: item.transid,
          source,
          product: item,
          error,
          db,
        });
      } finally {
        progress.processed += 1;
        await recordUpdateProgress(runId, progress);
      }
    }

    const items = await getAndCacheProductList(db);
    if (canceled || (await shouldStopUpdateRun(runId))) {
      await cancelUpdateRun(runId, progress);
    } else {
      await finishUpdateRun(runId, progress);
    }
    return items;
  } catch (error) {
    await failUpdateRun(runId, progress, error);
    throw error;
  }
}
