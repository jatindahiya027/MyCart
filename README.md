# MyCart 🛒

> A self-hosted price tracker for Indian e-commerce. Add any product URL, and MyCart will silently watch prices for you — alerting you by email when they drop to their lowest.

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite)
![Redis](https://img.shields.io/badge/Redis-6379-DC382D?style=flat-square&logo=redis)
![Python](https://img.shields.io/badge/Python-3.x-3776AB?style=flat-square&logo=python)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Supported Stores](#supported-stores)
4. [Architecture](#architecture)
5. [Tech Stack](#tech-stack)
6. [Prerequisites](#prerequisites)
7. [Installation](#installation)
8. [Configuration](#configuration)
9. [Running the App](#running-the-app)
10. [Usage Guide](#usage-guide)
11. [Project Structure](#project-structure)
12. [API Reference](#api-reference)
13. [How Scraping Works](#how-scraping-works)
14. [Cron Job & Email Alerts](#cron-job--email-alerts)
15. [Search with MeiliSearch](#search-with-meilisearch)
16. [Database Schema](#database-schema)
17. [Troubleshooting](#troubleshooting)
18. [Roadmap](#roadmap)
19. [Contributing](#contributing)
20. [License](#license)

---

## Overview

MyCart is a **Next.js 14** application that lets you track product prices across major Indian e-commerce platforms from a single dashboard. Paste a product URL, and MyCart scrapes the current price, stores it, and continues scraping on a schedule. Over time, you get a full price history chart for every item — and an email alert when a price hits its lowest recorded value.

All data is stored **locally** in a SQLite database. No cloud, no subscription, no data sharing.

---

## Features

| Feature | Description |
|---|---|
| **Multi-store scraping** | Fetches live prices from 13+ Indian e-commerce platforms |
| **Price history charts** | Interactive area chart showing price over time per product |
| **High / Low tracking** | Records the all-time high and low price for each item |
| **Email alerts** | Nodemailer-powered alerts when a price reaches its historical low |
| **Scheduled updates** | `node-cron` job automatically re-scrapes all tracked items |
| **Manual refresh** | One-click refresh button to pull the latest prices on demand |
| **Sort & filter** | Sort by relevance, price (high/low), or date added |
| **Full-text search** | MeiliSearch-powered instant search across all tracked products |
| **Redis caching** | Query results cached in Redis to keep the UI fast |
| **Mobile-ready UI** | Responsive design with smooth Framer Motion animations |

---

## Supported Stores

| Store | Scraping Method |
|---|---|
| Amazon | Puppeteer + DOM (JSON-LD + CSS selectors) |
| Flipkart | Puppeteer + JSON-LD script tags |
| Myntra | Puppeteer → in-browser `fetch` to internal API |
| Ajio | Python + Selenium |
| Ajio Luxe | Python + Selenium |
| Zara | Direct `fetch` to internal `?ajax=true` endpoint |
| Converse | GraphQL API via `fetch` |
| TataCliq | Direct `fetch` to marketplace REST API |
| Adidas | Puppeteer → Adidas products API |
| Nike | Puppeteer + JSON-LD `application/ld+json` |
| Shoppers Stop | Puppeteer + embedded `application/json` script tag |
| Nykaa Fashion | Puppeteer + DOM CSS selectors |
| Blackbird Shoemaker | Puppeteer + DOM CSS selectors |

---

## Architecture

```
Browser / Mobile
      │
      ▼
 Next.js Frontend  (React, Framer Motion, Recharts)
      │
      ▼
 Next.js API Routes  /api/scrape  /api/data  /api/updatedata  /api/deleterecord  /api/graphdata
      │                │
      │          Redis Cache (TTL: 1hr)
      │                │
      ▼                ▼
    SQLite DB  ←→  MeiliSearch Index
      │
  node-cron Job  (scheduled re-scraping + email alerts)
      │
  Puppeteer / Python Selenium  →  E-commerce Sites
```

Data flows: user pastes a URL → `/api/scrape` detects the domain, calls the correct scraper, saves to SQLite, invalidates Redis, updates MeiliSearch index, returns the full item list.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 14.2.5 |
| UI | React | 18 |
| Styling | Tailwind CSS | 3.x |
| Animation | Framer Motion / Motion | 11.x |
| Charts | Recharts | 2.x |
| Icons | Lucide React | 0.451 |
| Database | SQLite (via `sqlite` + `sqlite3`) | 5.x |
| Cache | Redis (via `ioredis`) | 5.x |
| Search | MeiliSearch | 0.46 |
| Scheduler | node-cron | 3.x |
| Email | Nodemailer | 6.x |
| Browser automation | Puppeteer | 24.x |
| Python scraping | Selenium | — |
| Image optimisation | Sharp | 0.33 |

---

## Prerequisites

Make sure the following are installed before proceeding.

### Required

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **npm** v9 or later (bundled with Node.js)
- **Python** 3.8 or later — [python.org](https://python.org)
- **Redis** — local install or Docker

### Optional but recommended

- **MeiliSearch** — for instant full-text search across tracked items
- **Google Chrome** / Chromium — Puppeteer downloads its own Chromium automatically

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/jatindahiya027/MyCart.git
cd MyCart
```

### 2. Install Node.js dependencies

```bash
npm install
```

Puppeteer will automatically download a compatible Chromium binary during this step.

### 3. Install Python dependencies

```bash
pip install selenium
```

Some scrapers (Ajio, Ajio Luxe) rely on Python + Selenium. Install ChromeDriver matching your Chrome version:

- ChromeDriver downloads: [chromedriver.chromium.org](https://chromedriver.chromium.org/downloads)
- Or use `webdriver-manager`: `pip install webdriver-manager`

### 4. Install and start Redis

**macOS (Homebrew)**
```bash
brew install redis
brew services start redis
```

**Ubuntu / Debian**
```bash
sudo apt update && sudo apt install redis-server
sudo service redis-server start
```

**Windows**
Download the installer from [github.com/microsoftarchive/redis/releases](https://github.com/microsoftarchive/redis/releases) and run `redis-server.exe`.

Verify Redis is running:
```bash
redis-cli ping
# Expected output: PONG
```

Redis must be running on the default port **6379**.

### 5. Install and start MeiliSearch *(optional)*

```bash
# macOS / Linux
curl -L https://install.meilisearch.com | sh
./meilisearch
```

MeiliSearch runs on port **7700** by default. If you skip this step, search will not work, but all other features remain functional.

---

## Configuration

### Environment variables

Create a `.env.local` file in the project root:

```env
# Email credentials for price-drop alerts
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your_app_password
```

**Getting a Gmail App Password:**

1. Enable 2-Factor Authentication on your Google account.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Create a new app password (name it "MyCart" or anything you like).
4. Copy the 16-character password into `EMAIL_PASS`.

> Using your regular Gmail password will not work. You must use an App Password.

---

## Database Setup

Run these three scripts **once** after installation to initialise the SQLite database and MeiliSearch index:

```bash
# 1. Create the database tables
node createdb.js

# 2. (Optional) Seed with sample data
node enterdata.js

# 3. Create the MeiliSearch search index
node createindex.mjs
```

The SQLite database file is created at `./collection.db` in the project root.

---

## Running the App

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build

```bash
npm run build
npm start
```

The production server runs on port **3027**. Open [http://localhost:3027](http://localhost:3027).

---

## Usage Guide

### Adding a product

1. Click the **+ Add URL** button in the toolbar.
2. An inline input bar slides open directly in the page — no screen change.
3. Paste any supported product URL and press **Enter** (or click the arrow button).
4. MyCart scrapes the product in the background and adds it to your list.

> **Tip:** You can press **Escape** to dismiss the input bar without adding anything.

### Viewing price history

Click the **chart icon** (waveform) on any product card to expand an area chart showing the full price history for that item. Click it again to collapse.

### Refreshing prices manually

Click the **refresh icon** (circular arrow) in the toolbar to trigger a live re-scrape of every tracked item immediately.

### Sorting items

Use the **Sort By** dropdown to order your list by:
- Relevance (default, newest first by insertion order)
- Price: highest first
- Price: lowest first
- Date: newest first
- Date: oldest first

### Searching

Type in the **search bar** in the header to instantly filter items using MeiliSearch. Clear the search field to return to the full list.

### Deleting an item

Click the **trash icon** on any product card to permanently remove it from your list.

---

## Project Structure

```
MyCart/
├── src/
│   ├── app/
│   │   ├── page.js                  # Main page — toolbar, URL input, item list
│   │   ├── layout.js                # Root layout
│   │   ├── globals.css              # All global styles and CSS variables
│   │   ├── cronjob.js               # Scheduled scraper + email alert logic
│   │   ├── components/
│   │   │   ├── Header.js            # Fixed header with logo + MeiliSearch bar
│   │   │   └── ItemCard.js          # Product card with chart toggle + delete
│   │   └── api/
│   │       ├── scrape/route.js      # POST /api/scrape — add a new product URL
│   │       ├── data/route.js        # POST /api/data — fetch sorted item list
│   │       ├── updatedata/route.js  # POST /api/updatedata — re-scrape all items
│   │       ├── deleterecord/route.js# POST /api/deleterecord — remove an item
│   │       └── graphdata/route.js   # POST /api/graphdata — price history for one item
│   ├── components/
│   │   └── ui/
│   │       ├── card.jsx             # shadcn/ui Card component
│   │       └── chart.jsx            # shadcn/ui Chart wrapper (Recharts)
│   └── lib/
│       └── utils.js                 # Tailwind class merge utility
├── public/                          # Static assets (logo, icons)
├── *.py                             # Python Selenium scrapers (ajio, luxe, etc.)
├── collection.db                    # SQLite database (auto-created)
├── createdb.js                      # DB initialisation script
├── enterdata.js                     # Optional seed data script
├── createindex.mjs                  # MeiliSearch index setup script
├── .env.local                       # Environment variables (not committed)
├── next.config.mjs
├── tailwind.config.js
└── package.json
```

---

## API Reference

All API routes accept `POST` requests with a JSON body and return JSON.

### `POST /api/scrape`

Scrape a new product and add it to the database.

**Request body:**
```json
{ "link": "https://www.amazon.in/dp/B0XXXXXXXX" }
```

**Response:** Full array of all tracked items (same shape as `/api/data`), or `{ "error": "..." }` on failure.

---

### `POST /api/data`

Fetch all tracked items, sorted by the given option. Results are served from Redis cache when available.

**Request body:**
```json
{ "selectedOption": "Relevance" }
```

Valid `selectedOption` values: `"Relevance"`, `"Price (Highest first)"`, `"Price (Lowest first)"`, `"Date (Highest first)"`, `"Date (Lowest first)"`.

**Response:**
```json
[
  {
    "transid": 42,
    "website": "amazon",
    "name": "Apple AirPods Pro (2nd Gen)",
    "image": "https://...",
    "link": "https://www.amazon.in/...",
    "min_price": 19900,
    "max_price": 24900,
    "current_price": 21900,
    "current_price_date": "25/03/2025, 14:32:00"
  }
]
```

---

### `POST /api/updatedata`

Re-scrapes every tracked item and updates prices in the database.

**Request body:** *(empty)*

**Response:** Updated array of all tracked items.

---

### `POST /api/deleterecord`

Delete a single item and all its price history.

**Request body:**
```json
{ "index": 42, "selectedOption": "Relevance" }
```

**Response:** Updated array of remaining items.

---

### `POST /api/graphdata`

Fetch the full price history for a single item.

**Request body:**
```json
{ "index": 42 }
```

**Response:**
```json
[
  { "date": "23/11/2024, 16:24:00", "price": 22900 },
  { "date": "24/11/2024, 09:10:00", "price": 21900 }
]
```

---

## How Scraping Works

When you submit a URL, the `/api/scrape` route:

1. **Extracts the domain** from the URL using a regex (e.g., `amazon`, `flipkart`, `myntra`).
2. **Calls the matching scraper** — either a Puppeteer function (inline JS) or a Python subprocess.
3. **Normalises the output** to `{ product_name, product_price, product_image_url }`.
4. **Writes to SQLite** — inserts a row in `data` (name, image, link, website) and a row in `dataprice` (price, timestamp).
5. **Updates Redis** — stores the fresh query result with a 1-hour TTL.
6. **Updates MeiliSearch** — pushes the full item list to the search index.
7. **Returns the updated item list** to the frontend.

### Scraping strategies by store

- **REST / JSON API** (Zara, Converse, TataCliq): Simple `fetch` to an undocumented internal API endpoint — fast and reliable.
- **Puppeteer + JSON-LD** (Flipkart, Nike, Shoppers Stop): Launches a headless Chrome, waits for `<script type="application/ld+json">` or `<script type="application/json">` tags, and parses structured data.
- **Puppeteer + DOM** (Amazon, Myntra, Adidas, Flipkart image): Navigates to the page, waits for specific CSS selectors, and reads `innerText` or `src` attributes.
- **Python + Selenium** (Ajio, Ajio Luxe): Spawned as a child process when Puppeteer approaches hit bot-detection. The Python script outputs JSON to stdout which the route parses.

---

## Cron Job & Email Alerts

`src/app/cronjob.js` runs a scheduled task using `node-cron`. On each tick it:

1. Fetches every item from the database.
2. Re-scrapes the current price for each one.
3. Compares the new price to the stored historical minimum.
4. If the new price is **equal to or lower than the all-time low**, it sends an email alert via **Nodemailer** (Gmail SMTP).
5. Saves the new price entry to `dataprice`.

The cron schedule can be adjusted in `cronjob.js`. The default is once daily.

**Email alert format:**
- Subject: price drop notification with product name
- Body: current price, historical low, product link

> The cron job must be started separately from the Next.js server. Run it with `node src/app/cronjob.js` in a separate terminal, or use a process manager like `pm2`.

---

## Search with MeiliSearch

MyCart uses **MeiliSearch** for instant, typo-tolerant search across product names and brands.

- The MeiliSearch client is initialised in `Header.js` pointing to `http://127.0.0.1:7700`.
- The search index is named `mycart`.
- Every time a product is added or prices are updated, the full item list is pushed to MeiliSearch via `client.index('mycart').addDocuments(items)`.
- Search queries are fired on every keystroke with a result limit of 100.
- Clearing the search field reloads the full list from the API.

If MeiliSearch is not running, search will silently fail and fall back to showing the full list.

---

## Database Schema

The SQLite database (`collection.db`) has two tables:

### `data` — product catalogue

| Column | Type | Description |
|---|---|---|
| `transid` | INTEGER PRIMARY KEY | Auto-increment ID |
| `website` | TEXT | Domain name (e.g. `amazon`, `myntra`) |
| `link` | TEXT | Original product URL |
| `name` | TEXT | Product name from scraper |
| `image` | TEXT | Product image URL |

### `dataprice` — price history

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | Auto-increment ID |
| `dataid` | INTEGER | Foreign key → `data.transid` |
| `date` | TEXT | Timestamp of the price record |
| `price` | REAL | Scraped price in INR |

The main query used throughout the app joins both tables to compute `min_price`, `max_price`, `current_price`, and `current_price_date` in a single SQL call.

---

## Troubleshooting

### Puppeteer fails to launch

```
Error: Failed to launch the browser process
```

Install missing system dependencies (Linux):
```bash
sudo apt install -y libgbm-dev libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libxss1 libpango-1.0-0 libpangocairo-1.0-0 libasound2
```

Or add `--no-sandbox` to Puppeteer launch args (already present in most scrapers).

---

### Redis connection refused

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

Redis is not running. Start it:
```bash
# macOS
brew services start redis

# Linux
sudo service redis-server start
```

---

### MeiliSearch search not working

Ensure MeiliSearch is running:
```bash
./meilisearch
# Should print: Server listening on: http://0.0.0.0:7700
```

If you set an API key in MeiliSearch, update the `apiKey` field in both `Header.js` and `src/app/api/scrape/route.js`.

---

### Product scrapes as `N/A`

- The store may have updated its page structure. Check the browser console for scraper errors.
- For Puppeteer scrapers, try setting `headless: false` temporarily to visually inspect what the browser sees.
- For Python scrapers, run the `.py` file directly: `python ajio.py "https://..."` to see raw output.
- Amazon and Flipkart may serve a CAPTCHA. Try again later or rotate user-agent strings.

---

### Prices not updating on the dashboard

The dashboard reads from the Redis cache (TTL: 1 hour). Either:
- Wait for the cache to expire, or
- Click the **refresh icon** in the toolbar to force a live re-scrape and cache bust.

---

## Roadmap

- [x] Multi-store scraping
- [x] Price history charts
- [x] Redis caching layer
- [x] MeiliSearch integration
- [x] Email alerts for price drops
- [x] Framer Motion animations
- [x] Sort and filter options
- [x] Mobile-responsive redesign
- [x] Inline URL input (no full-screen takeover)
- [ ] PWA / installable app
- [ ] Price drop threshold alerts (user-configurable)
- [ ] Browser extension for one-click adds
- [ ] Support for international stores
- [ ] Docker Compose setup for one-command install
- [ ] Dark mode

---

## Contributing

Contributions are welcome. To get started:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with clear, focused commits.
4. Run the linter: `npm run lint`
5. Push and open a Pull Request describing what you changed and why.

For bug reports or feature requests, open an issue on GitHub.

---

## License

This project is licensed under the **MIT License**. See the [`LICENSE`](./LICENSE) file for full terms.

---

## Author

Built by [Jatin Dahiya](https://github.com/jatindahiya027).

If MyCart saves you money, consider giving the repo a ⭐ — it helps others find it.
