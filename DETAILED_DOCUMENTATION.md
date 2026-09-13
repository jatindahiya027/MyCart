# MyCart Detailed Documentation

This document explains how MyCart works internally. It is intentionally detailed: it covers the UI, API routes, database, search behavior, scraping flow, update progress system, price-history compression, cron job, and the supporting scripts.

## 1. What MyCart Does

MyCart is a local price-tracking web app built with Next.js. A user adds product URLs from supported shopping websites. The app scrapes product name, image, and price, stores the item in SQLite, stores future prices as history, shows a dashboard of tracked items, and can refresh every item manually or through a scheduled cron job.

The app is designed around these core ideas:

- The browser UI is the control surface.
- SQLite is the source of truth.
- Redis is a temporary cache for list responses.
- MeiliSearch is an optional fast search engine.
- Local search is always available as a fallback.
- Scrapers normalize many store-specific page/API shapes into one common item shape.
- Price history is compressed so long runs of the same price do not keep growing forever.
- Long-running update operations expose progress to the UI.

## 2. Technology Stack

| Area | Technology |
| --- | --- |
| App framework | Next.js 14 App Router |
| UI | React 18 |
| Styling | Global CSS plus Tailwind setup |
| Animations | `framer-motion` and `motion/react` |
| Charts | Recharts through local chart wrappers |
| Icons | `lucide-react` |
| Database | SQLite through `sqlite` and `sqlite3` |
| Cache | Redis through `ioredis` |
| Search | MeiliSearch |
| Scraping | Scrapling 0.4.9 HTTP and stealth-browser fetchers |
| Scheduler | `node-cron` |
| Email | Nodemailer with Gmail SMTP |

## 3. Important Files

| File | Purpose |
| --- | --- |
| `src/app/page.js` | Main dashboard UI, toolbar, add URL bar, refresh button, update progress panel, bulk delete mode, item list |
| `src/app/components/Header.js` | Header, logo, search bar, MeiliSearch search, local search fallback |
| `src/app/components/ItemCard.js` | Product card, price display, price badges, per-item refresh, delete button, chart toggle |
| `src/app/globals.css` | Global layout, toolbar, cards, buttons, progress panel, badge styling |
| `src/app/layout.js` | Root layout and app-level imports |
| `src/app/cronjob.js` | Scheduled backend update of all tracked items plus email alert logic |
| `src/app/lib/database.js` | Shared SQLite initialization and `getDatabase()` helper |
| `src/app/lib/priceHistory.js` | Price-history compression and compressed insert logic |
| `src/app/lib/updateProgress.js` | Tracks progress for manual and cron price updates |
| `src/app/lib/itemIndicators.js` | Adds item-level indicator flags such as lowest and dropped |
| `src/app/lib/scraper.js` | Safely invokes the unified Scrapling process and validates its result |
| `src/app/lib/refreshProducts.js` | Shared single-pass refresh workflow used by the API and cron |
| `src/app/lib/productList.js` | Shared product query and optional Redis cache helper |
| `src/app/api/data/route.js` | Returns the sorted item list |
| `src/app/api/scrape/route.js` | Adds a new product URL |
| `src/app/api/scrapeitem/route.js` | Refreshes one item |
| `src/app/api/updatedata/route.js` | Manually refreshes all items |
| `src/app/api/graphdata/route.js` | Returns price history for one item |
| `src/app/api/deleterecord/route.js` | Deletes one item |
| `src/app/api/bulkdelete/route.js` | Deletes multiple selected items |
| `src/app/api/updateprogress/route.js` | Returns latest update progress |
| `src/app/api/updateprogress/stop/route.js` | Stops the latest running update |
| `scrapers/scrape_product.py` | Unified Scrapling store strategies and normalized output |
| `createdb.js` | Manually creates SQLite tables |
| `createindex.mjs` | Creates SQLite indexes |
| `run-app.ps1` | Windows PowerShell launcher |
| `run-app.cmd` | Windows CMD wrapper for `run-app.ps1` |

## 4. Runtime Services

### 4.1 Next.js

The web app runs as a Next.js server. Development mode uses:

```bash
npm run dev
```

Production mode uses:

```bash
npm run build
npm run start
```

`npm run start` is configured as:

```bash
next start --port 3027
```

So production runs at `http://localhost:3027`.

### 4.2 SQLite

SQLite stores all permanent data in `collection.db`.

The database is created automatically by `src/app/lib/database.js` when the app starts or any route calls `getDatabase()`. The manual script `createdb.js` creates the same main tables.

### 4.3 Redis

Redis is used as a short-lived cache for full item-list SQL results.

Each list response is stored with:

```js
redis.set(key, JSON.stringify(value), "EX", 60 * 60)
```

That means the cache TTL is one hour.

Redis is expected at:

```text
localhost:6379
```

### 4.4 MeiliSearch

MeiliSearch provides fast full-text search. It is expected at:

```text
http://localhost:7700
```

The index name is:

```text
mycart
```

If MeiliSearch is unavailable, the UI falls back to local in-memory search.

### 4.5 Python and Scrapling

All product scraping runs through `scrapers/scrape_product.py` on Python 3.10
or newer. `requirements.txt` pins Scrapling with its official fetcher extras.
The one-click launchers create `.venv`, install the requirements, and run
`scrapling install` to provision Scrapling's managed browser runtime. H&M and
Meesho additionally require installed Google Chrome; `MYCART_CHROME_PATH` can
point to a non-standard executable.

## 5. Database Schema

The database has three main tables.

### 5.1 `data`

Stores the product identity.

```sql
CREATE TABLE IF NOT EXISTS data (
  transid INTEGER PRIMARY KEY,
  website TEXT,
  name TEXT,
  image TEXT,
  link TEXT
);
```

Columns:

| Column | Meaning |
| --- | --- |
| `transid` | Product id. Used throughout the app as the item id. |
| `website` | Store/domain label such as `amazon`, `ajio`, `myntra`. |
| `name` | Product name returned by scraper. |
| `image` | Product image URL. |
| `link` | Original product URL. |

### 5.2 `dataprice`

Stores price history.

```sql
CREATE TABLE IF NOT EXISTS dataprice (
  dataid INTEGER,
  date DATE,
  price INTEGER
);
```

Columns:

| Column | Meaning |
| --- | --- |
| `dataid` | Product id matching `data.transid`. |
| `date` | Date/time when this price was recorded. |
| `price` | Price value. |

This table intentionally uses SQLite `rowid` ordering in several queries to find the latest and previous price points.

### 5.3 `update_runs`

Stores manual or cron update progress.

```sql
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
```

Columns:

| Column | Meaning |
| --- | --- |
| `id` | Run id. |
| `source` | `manual` or `cron`. |
| `status` | `running`, `cancel_requested`, `canceled`, `completed`, or `failed`. |
| `total` | Total items in the run. |
| `processed` | Number of items already checked. |
| `success` | Number of items successfully scraped and saved. |
| `failure` | Number of items that failed or returned incomplete data. |
| `current_item` | URL currently being processed. |
| `error` | Failure message for failed runs. |
| `started_at` | ISO timestamp for start. |
| `updated_at` | ISO timestamp for latest progress change. |
| `finished_at` | ISO timestamp for completion/cancel/failure. |

Important behavior: `src/app/lib/updateProgress.js` deletes old `update_runs` once per app process. This means if the app is restarted from scratch, previous progress history is cleared.

## 6. Main Item List Query

Most routes return a full product list using a query like this:

```sql
SELECT
  d.transid,
  d.website,
  d.name,
  d.image,
  d.link,
  MIN(dp.price) AS min_price,
  MAX(dp.price) AS max_price,
  latest_price_info.price AS current_price,
  latest_price_info.date AS current_price_date
FROM data d
LEFT JOIN dataprice dp ON d.transid = dp.dataid
LEFT JOIN (
  SELECT dataid, price, date
  FROM dataprice
  WHERE ROWID IN (
    SELECT MAX(ROWID)
    FROM dataprice
    GROUP BY dataid
  )
) AS latest_price_info ON d.transid = latest_price_info.dataid
GROUP BY d.transid, d.website, d.name, d.image, d.link
ORDER BY d.transid DESC;
```

What it computes:

- `min_price`: lowest stored price for the item.
- `max_price`: highest stored price for the item.
- `current_price`: latest stored price by highest `rowid`.
- `current_price_date`: date of latest stored price.

Sort variations change the final `ORDER BY`:

- Relevance: `ORDER BY d.transid DESC`
- Price highest first: `ORDER BY current_price DESC`
- Price lowest first: `ORDER BY current_price ASC`
- Date newest first: `ORDER BY current_price_date DESC`
- Date oldest first: `ORDER BY current_price_date ASC`

## 7. Item Indicator Flags

`src/app/lib/itemIndicators.js` enriches item-list responses with extra fields:

```js
previous_price
is_lowest_price
is_price_drop
```

The helper receives the full list and performs one batched SQL query to fetch the two newest price rows for every item:

```sql
SELECT dataid, price, price_rank FROM (
  SELECT
    dataid,
    price,
    ROW_NUMBER() OVER (PARTITION BY dataid ORDER BY rowid DESC) AS price_rank
  FROM dataprice
  WHERE dataid IN (...)
)
WHERE price_rank <= 2
ORDER BY dataid, price_rank
```

Then each item is marked:

- `previous_price`: second newest price, or `null`.
- `is_lowest_price`: current price is equal to or below `min_price`.
- `is_price_drop`: current price is lower than the previous stored price.

The UI also derives:

- `Same`: shown when `max_price` and `min_price` are equal.
- `High`: shown when current price equals max price and max/min are not the same.
- `Lowest`: shown when current price equals min price and max/min are not the same.
- `Dropped`: shown when current price is lower than the previous stored point.

This logic keeps API responses useful while keeping some purely presentational logic inside the card.

## 8. Price History Compression

`src/app/lib/priceHistory.js` prevents the `dataprice` table from growing with endless duplicate prices.

### 8.1 `insertCompressedPricePoint`

When a new price is stored, the app checks the latest two rows for that item:

```sql
SELECT rowid, price
FROM dataprice
WHERE dataid = ?
ORDER BY rowid DESC
LIMIT 2
```

The behavior is:

1. If there is no latest row, insert the new price.
2. If the latest row has a different price, insert the new price.
3. If the latest row has the same price but there is no previous row, insert the new price.
4. If the latest and previous rows both have the same price as the new price, update the latest row date instead of inserting a new row.

This preserves the beginning and end of a flat price run while trimming unnecessary middle points.

Example:

```text
100, 100, 100, 100
```

Can be represented as:

```text
100 at start date
100 at latest date
```

That still shows the flat stretch in charts but avoids storing every repeated scrape.

### 8.2 `compactPriceHistory`

This function cleans already-existing history.

It loads every price row for one item in oldest-first order. It groups consecutive rows with the same price. For every same-price run longer than two rows, it deletes the middle rows and keeps only:

- The first row of the run.
- The last row of the run.

This function is called when:

- Fetching graph data.
- Refreshing individual items.
- Running manual all-item updates.
- Running cron all-item updates.

## 9. Frontend Flow

### 9.1 Main Page State

`src/app/page.js` manages:

| State | Meaning |
| --- | --- |
| `itemdata` | Current list shown on screen. |
| `showUrlBar` | Whether the add-URL input is open. |
| `inputValue` | Current URL input value. |
| `selectedOption` | Current sort order. |
| `isRefreshing` | Manual all-item update request is active. |
| `isScraping` | New-item scrape is active. |
| `updateProgress` | Latest manual/cron update progress row. |
| `isStoppingUpdate` | Stop button request is active. |
| `isSelectMode` | Bulk selection mode is active. |
| `selectedIds` | Set of selected item ids. |
| `isBulkDeleting` | Bulk delete request is active. |

### 9.2 Initial Load

On first render:

1. `fetchdata()` calls `/api/data`.
2. `fetchUpdateProgress()` calls `/api/updateprogress`.
3. If progress is running, the page polls every 1.5 seconds.

### 9.3 Sorting

Changing the dropdown updates `selectedOption`.

The effect:

```js
useEffect(() => {
  fetchdata();
}, [selectedOption]);
```

loads `/api/data` with the selected sort.

### 9.4 Adding a URL

User clicks Add URL:

1. `showUrlBar` becomes `true`.
2. The URL input focuses after a short timeout.
3. User enters a URL and presses Enter or the arrow button.
4. `enterdata()` calls `/api/scrape`.
5. If the response is an array, `itemdata` is replaced with the updated list.
6. Input is cleared and hidden.

Escape closes the URL input without adding.

### 9.5 Manual Refresh

User clicks the toolbar refresh button:

1. If an update is already running, the click is ignored.
2. Button becomes disabled while running.
3. `/api/updatedata` starts re-scraping all tracked items.
4. The progress strip polls `/api/updateprogress`.
5. When the API returns, `itemdata` is updated with the latest list.
6. Progress is fetched one final time.

### 9.6 Stop Update

The progress strip shows a Stop button while a manual or cron update is running.

Clicking Stop:

1. Calls `/api/updateprogress/stop`.
2. The latest run row is updated to `canceled`.
3. The update loop checks `shouldStopUpdateRun(runId)` between items.
4. The loop exits at the next item boundary.

Important detail: stopping is cooperative. It cannot interrupt the Scrapling request currently in progress. It takes effect before the next item starts.

### 9.7 Bulk Delete

Bulk delete mode:

1. User clicks the select/list icon.
2. Cards become selectable.
3. User selects individual cards or Select all.
4. Delete calls `/api/bulkdelete` with the selected ids.
5. The route deletes matching rows from `data` and `dataprice`.
6. The list, Redis cache, and MeiliSearch index are refreshed.

### 9.8 Item Card Behavior

Each card shows:

- Product image.
- Store name.
- Product name as an external link.
- Current price.
- High and low price line.
- Indicator badges.
- Current price date.
- Per-item refresh.
- Chart toggle.
- Delete button.

Indicator badges:

- `Same`: max and min price are the same.
- `Lowest`: current price is the lowest recorded price, unless the item is also Same.
- `Dropped`: current price is lower than the previous stored price.
- `High`: current price is the highest recorded price, unless the item is Same.

Chart toggle:

1. Calls `/api/graphdata`.
2. The route compacts history for that item.
3. The route returns `{ date, price }` rows.
4. `ItemCard` renders an area chart using Recharts.

## 10. Search System

Search lives in `src/app/components/Header.js`.

### 10.1 Main Search State

| Variable | Meaning |
| --- | --- |
| `query` | Search input text. |
| `fullDataRef` | Latest known full unfiltered item list. |
| `searchRequestRef` | Monotonic request id used to ignore stale async responses. |
| `meiliUnavailableUntilRef` | Cooldown timestamp when MeiliSearch has failed recently. |

### 10.2 Local Search

Local search runs immediately on the data already available in the browser.

Fields searched:

- `item.name`
- `item.website`
- `item.link`

It supports subword/domain matching by normalizing punctuation:

```js
String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ")
```

That means a URL like:

```text
www.tata.com
```

can match:

```text
tata
```

### 10.3 MeiliSearch Search

After local search updates the UI immediately, the code tries MeiliSearch:

```js
client.index("mycart").search(searchText, { limit: 100 })
```

If MeiliSearch returns, the results replace the local filtered results.

If MeiliSearch fails:

1. The app keeps the local results.
2. `markMeiliUnavailable()` sets a 30-second cooldown.
3. During cooldown, future searches skip MeiliSearch and use local search only.

This keeps the UI responsive when MeiliSearch is offline while preserving Meili performance when it is available.

### 10.4 Stale Search Protection

Every search change increments `searchRequestRef`.

Async responses compare their request id with the latest id before updating UI. This prevents the old problem where clearing the search box briefly showed correct data and then an older previous search response overwrote it.

### 10.5 Clear Search

The X button:

1. Increments request id.
2. Clears `query`.
3. Calls `/api/data` to reload the full sorted list.

## 11. API Routes

### 11.1 `POST /api/data`

Input:

```json
{ "selectedOption": "Relevance" }
```

Behavior:

1. Ensures DB exists through `getDatabase()`.
2. Builds the item-list SQL for the sort option.
3. Checks Redis by using the SQL string as the cache key.
4. If cached, parses cached data and re-adds fresh price indicators.
5. If not cached, runs SQLite query, adds indicators, stores result in Redis.
6. Returns item array.

### 11.2 `POST /api/scrape`

Input:

```json
{ "link": "https://example.com/product" }
```

Behavior:

1. Extracts domain from URL.
2. Chooses a scraper for that domain.
3. Normalizes scraper result to:

```js
{
  product_name,
  product_price,
  product_image_url
}
```

4. Inserts product into `data`.
5. Inserts price into `dataprice` through `insertCompressedPricePoint`.
6. Fetches full item list.
7. Adds price indicators.
8. Updates MeiliSearch.
9. Stores list in Redis.
10. Returns full item list.

### 11.3 `POST /api/scrapeitem`

Input:

```json
{
  "transid": 1,
  "link": "https://example.com/product",
  "selectedOption": "Relevance"
}
```

Behavior:

1. Compacts existing price history for that item.
2. Scrapes the item using the same store-specific logic as `/api/scrape`.
3. Inserts compressed price point.
4. Fetches sorted full item list.
5. Adds indicators.
6. Updates Redis and MeiliSearch.
7. Returns full item list.

### 11.4 `POST /api/updatedata`

Behavior:

1. Fetches all `link, transid` rows.
2. Starts an update run with source `manual`.
3. Loops sequentially over items.
4. Before each item, checks whether stop was requested.
5. Records the current item URL.
6. Compacts that item history.
7. Scrapes current price.
8. If required data is missing, increments failure.
9. If valid, inserts compressed price point and increments success.
10. Records progress after each item.
11. After the loop, fetches full item list.
12. Adds indicators.
13. Updates Redis and MeiliSearch.
14. Marks run `completed` or `canceled`.
15. Returns full item list.

### 11.5 `POST /api/graphdata`

Input:

```json
{ "index": 1 }
```

Behavior:

1. Ensures DB exists.
2. Compacts price history for that item.
3. Returns all `date, price` rows for that item.

### 11.6 `POST /api/deleterecord`

Input:

```json
{
  "index": 1,
  "selectedOption": "Relevance"
}
```

Behavior:

1. Deletes from `data` where `transid = index`.
2. Deletes from `dataprice` where `dataid = index`.
3. Fetches sorted full item list.
4. Adds indicators.
5. Updates Redis and MeiliSearch.
6. Returns full item list.

### 11.7 `POST /api/bulkdelete`

Input:

```json
{
  "ids": [1, 2, 3],
  "selectedOption": "Relevance"
}
```

Behavior:

1. Validates `ids` is a non-empty array.
2. Builds SQL placeholders.
3. Deletes matching rows from `data`.
4. Deletes matching rows from `dataprice`.
5. Fetches sorted full item list.
6. Adds indicators.
7. Updates Redis and MeiliSearch.
8. Returns full item list.

### 11.8 `GET /api/updateprogress`

Behavior:

1. Reads latest row from `update_runs`.
2. Returns it or `null`.

This route is forced dynamic.

### 11.9 `POST /api/updateprogress/stop`

Behavior:

1. Reads the latest run.
2. If it is running, updates it to `canceled`.
3. Returns the updated latest run.

## 12. Scraping System

Every scraping path uses the same two-layer integration:

- `src/app/lib/scraper.js` validates the URL and invokes Python with
  `execFile`, avoiding shell interpolation.
- `scrapers/scrape_product.py` uses Scrapling for store endpoints, HTML,
  JSON-LD, embedded application state, and stealth-browser fallbacks.

### 12.1 Domain Extraction

`scrapers/supported_sites.json` is the single domain registry used by both the
Node and Python adapters. It contains 198 unique storefront hostnames. Matching
uses the longest registered hostname first, which preserves distinct mappings
for subdomains such as `luxe.ajio.com` and `luxury.tatacliq.com` while still
accepting normal `www` and other child hostnames. Unknown domains are rejected
before a scraper process can write anything.

### 12.2 Normal Scraper Result Shape

Every store-specific scraper is expected to become:

```js
{
  product_name: "...",
  product_price: 1234,
  product_image_url: "https://..."
}
```

If a scraper returns missing fields or `"N/A"`, update routes count that item as failure and skip inserting a price.

### 12.3 Fetch and Fallback Order

The unified scraper first tries a store's public product endpoint where one is
available. Product paths on registered stores also try Shopify's product JSON.
It then tries a browser-impersonated Scrapling HTTP request and extracts
JSON-LD, embedded application state, store selectors, or product metadata.
When the response is blocked, incomplete, or client-rendered, it uses a hidden
Scrapling `StealthyFetcher` request. Adidas uses the page's embedded
`__NEXT_DATA__` when its official API returns 403. H&M and Meesho are fetched
through a temporary off-screen installed Chrome default context because their
edge protection rejects newly created automated contexts. Scrapling attaches
to that context over CDP, owns the request and parsing, and closes only the
temporary browser afterward. Direct app entry, browser-extension entry, manual
refresh, and cron refresh all call this same scraper path.

### 12.4 Process Contract

`scrapers/scrape_product.py` prints exactly one JSON object to stdout. Success
uses the common product shape. Controlled failures use `{ "error": "..." }`
and a non-zero exit code. The Node adapter validates all three product fields
before any database write.

## 13. Cron Job

`src/app/cronjob.js` imports `node-cron` and schedules:

```js
cron.schedule("0 */4 * * *", () => {
  updatedata();
});
```

This runs at minute `0` every 4 hours.

The cron update flow is similar to manual `/api/updatedata`, but the progress source is `cron`.

After updating all products, it builds an email list of products whose current price is at or below their minimum and whose max/min are not equal.

Email uses Nodemailer:

```js
nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})
```

Required environment variables:

```env
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

The current recipient is hard-coded in `cronjob.js`:

```js
to: "recipient@example.com"
```

If this app is used by someone else, that should be made configurable.

## 14. Startup and Database Creation

Database creation happens in two ways.

### 14.1 Automatic

`src/app/lib/database.js` calls `initializeDatabase()` at module load. Any API route that calls `getDatabase()` also triggers initialization.

It creates:

- `data`
- `dataprice`
- `update_runs`

If `collection.db` does not exist, SQLite creates it.

### 14.2 Manual

Run:

```bash
node createdb.js
```

The Windows launcher runs this automatically before starting the app.

### 14.3 Launcher Scripts

`run-app.ps1`:

1. Moves into the app root.
2. Checks Node.js exists.
3. Checks npm exists.
4. Runs `npm install` if `node_modules` is missing.
5. Runs `node createdb.js`.
6. Runs `npm run build` if `.next` is missing.
7. Runs `npm run start`.

`run-app.cmd` simply calls `run-app.ps1` with PowerShell execution policy bypassed.

## 15. Image Loading

Product images are rendered with `next/image` in unoptimized mode. Registered
retailers commonly use separate or changing CDN hostnames, so the browser loads
the source URL directly instead of asking the self-hosted Next.js image proxy to
fetch arbitrary third-party media.

## 16. Cache and Index Refresh Pattern

Most mutations follow this pattern:

1. Change SQLite data.
2. Fetch full list from SQLite.
3. Add price indicators.
4. Store full list in Redis.
5. Replace MeiliSearch documents.
6. Return full list to UI.

This keeps the UI in sync after add, delete, bulk delete, single refresh, manual refresh, and cron refresh.

## 17. Known Operational Details

### 17.1 Redis Comments

Some comments say "Cache data for 5 minutes", but the code uses `60 * 60`, which is one hour.

### 17.2 MeiliSearch API Key

`Header.js` contains:

```js
apiKey: "your_api_key"
```

For a default local MeiliSearch instance without an API key this may be ignored. If a master key is configured, update this value and the backend Meili clients as needed.

### 17.3 Progress Reset on Restart

Old update runs are deleted once per process in `updateProgress.js`. This was intentional so stale progress from a killed app does not keep disabling refresh/stop buttons after restart.

### 17.4 Stop Button Semantics

The stop button does not kill an active browser process mid-scrape. It marks the run canceled, and the loop stops before the next item.

### 17.5 Search Latency

The UI does local search immediately, then upgrades to MeiliSearch results if available. This hides MeiliSearch connection latency and avoids waiting on a failing MeiliSearch service.

### 17.6 Price Compression Tradeoff

Compression reduces duplicate stagnant prices but keeps enough points to show the start and end of flat stretches. This means the graph remains meaningful while the DB stays smaller.

## 18. Adding a New Store

To add a store:

1. Add a store strategy to the unified Scrapling scraper.
2. Normalize output to:

```js
{
  product_name,
  product_price,
  product_image_url
}
```

3. Add the domain and any store-specific parser in `scrapers/scrape_product.py`.
4. Add the store identifier to `src/app/lib/scraper.js`.
5. Add image host to `next.config.mjs`.
6. Test:

```bash
npm run lint
npm run build
```

Do not add separate scraper libraries or route-specific scraping code; every
add and refresh path already delegates to the shared adapter.

## 19. Common Troubleshooting

### 19.1 App Starts but Shows No Items

Check:

- `collection.db` exists.
- `data` table has rows.
- `/api/data` returns JSON.
- Redis is not returning stale unexpected data.

### 19.2 Redis Connection Errors

Start Redis on port `6379`, or update the Redis client config in the API routes.

### 19.3 MeiliSearch Not Running

Search still works locally. MeiliSearch failures enter a 30-second cooldown in the UI.

### 19.4 Image Does Not Display

Add the image CDN host to `next.config.mjs`.

### 19.5 Price Does Not Update

Possible causes:

- Scraper returned `"N/A"`.
- Store changed HTML/API structure.
- The store blocked both Scrapling request modes.
- Scrapling or its managed browser runtime is missing.
- A long active scrape is still running.

### 19.6 Stop Button Disabled After Restart

This should no longer happen because `update_runs` is cleared once per app process. If it does, check that `updateProgress.js` is imported and `getLatestUpdateRun()` has run.

## 20. Maintenance Checklist

Before shipping changes:

```bash
npm run lint
npm run build
```

For scraper tests and Python syntax:

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
.venv/bin/python -m py_compile scrapers/*.py
```

For DB setup:

```bash
node createdb.js
node createindex.mjs
```

Keep secrets out of Git:

- `.env.local`
- Gmail app passwords
- MeiliSearch master keys
