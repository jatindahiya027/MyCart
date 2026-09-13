# MyCart

MyCart is a self-hosted price tracker for Indian e-commerce products. Add a product URL, let the app scrape the current price, and track price changes over time from one local dashboard.

It stores data locally in SQLite, uses Redis for faster list loading, can use MeiliSearch for fast search, and supports manual plus scheduled price refreshes.

## Features

- Track products from multiple shopping sites.
- Store full price history per item.
- Show current, highest, and lowest recorded prices.
- Show item indicators such as `Same`, `Lowest`, `Dropped`, and `High`.
- View per-item price history charts.
- Search by name, website, and URL.
- Use local search immediately, with MeiliSearch as an optional faster search backend.
- Refresh one item, selected items, or all items.
- See live progress for manual and cron refreshes.
- Stop a running all-item update.
- Clear price history for one product or selected products while preserving the latest price.
- Delete one item or bulk delete selected items.
- Compress stagnant price history to keep the database smaller.
- Configure the Gmail recipient, encrypted Gmail app password, and cron interval from Settings.
- Review scrape failures with timestamps and complete product context on the Logs page.
- Send email alerts from cron updates when prices hit their lowest level.
- Auto-create the database if it does not exist.

## Screenshots

Screenshots are stored in the `readme/` folder.

## Tech Stack

- Next.js 14
- React 18
- SQLite
- Redis
- MeiliSearch
- Scrapling 0.4.9 (HTTP and stealth-browser fetchers)
- Recharts
- Lucide icons
- Nodemailer
- node-cron

## Requirements

Install these before running the app:

- Node.js 18 or newer
- npm
- Python 3.10 or newer
- Google Chrome (required for protected H&M and Meesho product pages)
- Optional: Redis on `localhost:6379` for list caching
- Optional: MeiliSearch on `localhost:7700`

Create a local Python environment and install Scrapling:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/scrapling install
```

On Windows, use `.venv\Scripts\python` and `.venv\Scripts\scrapling`.
The one-click launchers perform this setup automatically.

## Setup

Install dependencies:

```bash
npm install
```

Create the SQLite tables:

```bash
node createdb.js
```

Create helpful SQLite indexes:

```bash
node createindex.mjs
```

Create `.env.local` for email alerts:

```env
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

Use a Gmail app password, not your normal Gmail password.

## Running

Development:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

Production runs on:

```text
http://localhost:3027
```

## Windows One-Click Scripts

Two launcher scripts are included:

- `run-app.ps1`
- `run-app.cmd`

Run `run-app.cmd` from Windows Explorer or Command Prompt. It will:

1. Move to the app folder.
2. Install npm dependencies if `node_modules` is missing.
3. Create `.venv`, install Scrapling, and install its browser runtime when missing.
4. Run `node createdb.js`.
5. Build the app if `.next` is missing.
6. Run `npm run start`.

The app opens at:

```text
http://localhost:3027
```

Keep the terminal window open while using the app.

## How to Use

### Add an Item

1. Click `Add URL`.
2. Paste a supported product URL.
3. Press Enter or click the arrow button.
4. The app scrapes the product and adds it to the list.

Unsupported domains are rejected before a scrape starts and link to the
supported-websites directory. Open **Supported** in the header to browse or
search all registered stores with their website icons.

### Search

Use the search bar in the header.

Search checks:

- Product name
- Website
- URL

Local search supports subwords, so searching `tata` can match `www.tata.com`.

If MeiliSearch is running, results are upgraded with MeiliSearch. If it is not running, local search continues to work.

### Sort

Available sort options:

- Relevance
- Price highest first
- Price lowest first
- Newest
- Oldest

### Refresh Prices

- Use the toolbar refresh button to update all items.
- Use the refresh button on a card to update only that item.

During all-item updates, the UI shows:

- Total checked
- Success count
- Failure count
- Progress bar
- Stop button

### Stop an Update

Click `Stop` in the progress panel.

The stop is cooperative: the app finishes the currently running scrape, then stops before starting the next item.

### View Price History

Click the chart icon on an item card. The app fetches price history from `/api/graphdata` and renders an area chart.

### Delete Items

- Use the trash button on a card to delete one item.
- Use select mode to bulk delete multiple items.

## Price Indicators

Each card may show compact badges:

| Badge | Meaning |
| --- | --- |
| `Same` | Highest and lowest recorded prices are the same. |
| `Lowest` | Current price is the lowest recorded price. |
| `Dropped` | Current price is lower than the previous recorded price. |
| `High` | Current price is the highest recorded price. |

For same-price items, the card still shows both high and low price values, but the badge says `Same` instead of `Lowest`.

## Scrapling Scraper

All stores use the single `scrapers/scrape_product.py` entry point. It uses
Scrapling for HTTP requests, DOM/JSON-LD parsing, and its stealth browser
fallback. The Next.js routes invoke it through `src/app/lib/scraper.js`, so add,
single-item refresh, refresh-all, and cron updates all use the same behavior.

The accepted-domain registry is `scrapers/supported_sites.json`. It currently
contains 223 unique storefront domains. Node
and Python both read this one registry, so URL validation and scraping cannot
drift into different support lists.

Specialized handlers are kept for stores that expose a reliable product API or
need a precise selector. The remaining registered stores use the common
pipeline: Shopify product JSON when available, JSON-LD, embedded Next/Nuxt or
application state, product metadata/DOM, then a hidden Scrapling browser for
client-rendered pages. Adidas reads the product page's embedded Next.js state
when its API is denied. H&M and Meesho use a temporary off-screen installed
Chrome default context because their edge protection rejects a new automated
context; Scrapling still performs navigation, response capture, and parsing.

Run the scraper directly:

```bash
.venv/bin/python scrapers/scrape_product.py "<product-url>"
```

A network-dependent regression list with real product pages is stored in
`tests/live_product_urls.json`. Run all saved live checks, or only named stores:

```bash
npm run test:scraper:live
npm run test:scraper:live -- "Puma" "Home Centre"
```

The complete run writes all product fields, timings, and failures to
`tests/live_scraper_results.json`. A filtered run writes to
`tests/live_scraper_results.selected.json`, so it cannot replace the complete
223-domain report. Set `LIVE_SCRAPER_WORKERS` or `LIVE_SCRAPER_TIMEOUT_MS` to
adjust concurrency or the per-store timeout.

Validate that every registered domain has exactly one live product fixture:

```bash
node scripts/build-live-product-fixture.mjs --check
```

The normal `npm test` command stays deterministic and does not require retailer
sites or an internet connection.

## Database

The app uses `collection.db` in the project root.

Tables:

- `data`: product metadata
- `dataprice`: price history
- `update_runs`: manual/cron update progress

The database is created automatically on app startup through `src/app/lib/database.js`. You can also create it manually:

```bash
node createdb.js
```

## Price History Compression

MyCart trims repeated stagnant prices.

If the same price is recorded many times in a row, the app keeps enough points to show the flat stretch but removes unnecessary middle points. This keeps `dataprice` smaller and makes graph queries faster over time.

Compression happens when:

- A new price is inserted.
- Graph data is requested.
- Single-item refresh runs.
- Manual all-item refresh runs.
- Cron refresh runs.

## Cron Updates and Email Alerts

The cron job lives in:

```text
src/app/cronjob.js
```

Open `/settings` to choose an interval from 1 to 24 hours and configure the Gmail address that receives alerts. The default interval is 4 hours. Saving a new interval reschedules the running cron task without requiring a restart.

Only one cron refresh can execute at a time. Every Settings save invalidates the previous schedule, stops its local timer, and starts the replacement. A renewable SQLite lease also prevents stale timers in another Node worker from overlapping the active refresh. If a save happens during a scrape, the obsolete run stops before starting another product and the replacement waits for the execution lease.

Enter a Google app password in Settings rather than the account's normal Gmail password. It is encrypted with AES-256-GCM before being stored in SQLite. The encryption key is read from `MYCART_ENCRYPTION_KEY`, or generated in the machine-local `.mycart-secret` file (permission mode `0600`). Keep that key file separate from database backups.

Existing environment variables remain supported as a fallback:

```env
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

An encrypted app password saved through Settings takes precedence over `EMAIL_PASS`.

## API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/data` | POST | Fetch sorted item list |
| `/api/scrape` | POST | Add a new product URL |
| `/api/scrapeitem` | POST | Refresh one item |
| `/api/updatedata` | POST | Refresh selected items or all items |
| `/api/graphdata` | POST | Fetch price history for one item |
| `/api/history/clear` | POST | Clear history for one or more items, preserving the latest price |
| `/api/deleterecord` | POST | Delete one item |
| `/api/bulkdelete` | POST | Delete multiple items |
| `/api/settings` | GET, PUT | Read or update email and cron settings without exposing the password |
| `/api/logs` | GET | Fetch paginated scrape error logs |
| `/api/updateprogress` | GET | Fetch latest update progress |
| `/api/updateprogress/stop` | POST | Stop latest running update |

## Project Structure

```text
.
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── cronjob.js
│   │   ├── globals.css
│   │   ├── layout.js
│   │   └── page.js
│   ├── components/ui/
│   └── lib/
├── scrapers/
├── tests/
├── public/
├── readme/
├── createdb.js
├── createindex.mjs
├── requirements.txt
├── run-app.ps1
├── run-app.cmd
├── DETAILED_DOCUMENTATION.md
└── README.md
```

For a deeper internal explanation, read:

```text
DETAILED_DOCUMENTATION.md
```

## Troubleshooting

### Redis Connection Error

Start Redis locally on port `6379`.

### MeiliSearch Not Running

Search still works through local fallback. Start MeiliSearch on port `7700` if you want faster search.

### Product Image Not Loading

Product media is rendered directly from retailer CDNs. The app deliberately
does not proxy arbitrary retailer images through the self-hosted Next.js server.

### Scraper Returns Empty or N/A

The store may have changed its page structure, blocked automation, or changed
an internal API. Run the unified scraper directly to see its controlled error.
Static Scrapling fetching is attempted first; protected or client-rendered pages
automatically use the appropriate Scrapling browser fallback.

Registration means the app recognizes the store and can run the common
extraction pipeline. A product can only be saved when the public product page
actually exposes a name, positive numeric price, and product image. H&M and
Meesho require installed Google Chrome. Set `MYCART_CHROME_PATH` when Chrome is
installed in a non-standard location. A Linux server without a graphical
display also needs `xvfb-run`. Missing requirements return a controlled error;
the app never inserts incomplete or fabricated product data.

### Old Progress Showing After Restart

The app clears old update progress once per process. If stale progress still appears, restart the Next.js server and reload the page.

## Development Checks

Run lint:

```bash
npm run lint
```

Run production build:

```bash
npm run build
```

Run scraper unit tests and check Python syntax:

```bash
npm test
.venv/bin/python -m py_compile scrapers/*.py
```

## Security Notes

Do not commit:

- `.env.local`
- Gmail app passwords
- MeiliSearch master keys
- Personal database files with private tracked products

## License

MIT. See `LICENSE`.
