# Search Typeahead System

A search typeahead (autocomplete) system with a **distributed cache using consistent hashing**, **recency-aware trending**, and **batched writes**. Built to run locally and be easy to explain.

**Name:** J Harish Reddy &nbsp;·&nbsp; **Roll Number:** 10210 &nbsp;·&nbsp; **Course:** HLD

**Stack:** React + Vite (frontend) · Node.js + Express (backend) · SQLite (primary store) · in-memory distributed cache (consistent hashing) · Chart.js (metrics dashboard).

---

## Features

- **Typeahead suggestions** — prefix match, top 10 by count, debounced, case-insensitive.
- **Search submission** — dummy `/search` API that records the query.
- **Distributed cache** — 4 logical cache nodes on a consistent-hash ring with virtual nodes; TTL expiry + write invalidation.
- **Trending** — basic (all-time count) and advanced (`0.7·count + 0.3·recency`) ranking with time-decay so spikes fade.
- **Batch writes** — searches buffered in memory, duplicates aggregated, flushed every 10s or 50 searches in one transaction.
- **Metrics** — latency (incl. p95), cache hit/miss rate, DB reads/writes, batch write-reduction.

---

## Project Structure

```
typeahead/
├── backend/
│   ├── db.js                # SQLite connection + schema
│   ├── generateDataset.js   # synthetic query generator (CSV)
│   ├── loadDataset.js       # CSV -> SQLite loader (single transaction)
│   ├── seedDb.js            # alternative: seed queries directly into SQLite
│   ├── suggestions.js       # prefix query + batched DB write
│   ├── consistentHash.js    # hash ring with virtual nodes
│   ├── cache.js             # distributed cache over the ring (TTL)
│   ├── trending.js          # recency tracking + scoring + invalidation
│   ├── batchWriter.js       # in-memory buffer + flush
│   ├── metrics.js           # counters + p95
│   ├── server.js            # Express app + routes
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── vite.config.js       # dev-server proxy /api -> :4000
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx          # search UI, debounce, keyboard nav, trending
│       ├── Metrics.jsx      # Chart.js metrics dashboard
│       ├── api.js           # backend calls
│       └── styles.css
├── dataset/
│   └── queries.csv          # ~120k queries (query,count)
├── docs/                    # architecture, API, performance, viva materials
└── README.md
```

---

## Setup & Run

You need **two terminals** running at the same time — one for the backend, one for the frontend.

### 1. Backend (Terminal 1)

```bash
cd backend
npm install
npm run load        # load dataset/queries.csv into SQLite (single transaction)
npm start           # http://localhost:4000
```

Expected:
```
Loaded 119323 rows. Table now has 119323 queries.
Batch writer started: flush every 10s or 50 searches
Backend listening on http://localhost:4000
```

> If `npm run load` reports `Loaded 0 rows`, the CSV at `dataset/queries.csv` is empty — re-add it and retry. Alternatively, seed the DB directly with `node seedDb.js`.

### 2. Frontend (Terminal 2)

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the backend on port 4000.

---

## Dataset

The dataset is a synthetic file of ~120,000 search queries in `dataset/queries.csv`, format `query,count`. Queries are built from a word bank (brands, products, tech topics) combined through templates so prefixes overlap realistically, with Zipf-skewed counts so popular short queries dominate — mirroring real search traffic.

**Loading:** `npm run load` (from `backend/`) ingests the CSV into SQLite in a single transaction.

To regenerate the CSV instead of using the provided one: `npm run gen` (writes `dataset/queries.csv`), then `npm run load`.

| Property | Value |
|---|---|
| Format | `query, count` |
| Unique queries | ~120,000 (> 100,000 minimum) |
| Storage | SQLite table `queries(query PRIMARY KEY, count, last_searched)` |

---

## API

Base URL: `http://localhost:4000` (frontend calls via Vite proxy at `/api`).

| API | Purpose | Notes |
|---|---|---|
| `GET /suggest?q=<prefix>&mode=<basic\|recent>` | Suggestions | Up to 10 prefix matches, sorted by count. `mode=recent` for recency ranking. |
| `POST /search` | Submit search | Body `{ "query": "..." }` → `{ "message": "Searched" }`. Buffered write. |
| `GET /trending?limit=<n>` | Trending | Recency-aware ranking: `0.7·normCount + 0.3·normActivity`. |
| `GET /cache/debug?prefix=<prefix>` | Cache routing | Returns owning node + `HIT`/`MISS`. |
| `GET /metrics` | Observability | Latency (p95), cache hit/miss, DB reads/writes, batch reduction. |
| `GET /health` | Health | `{ "ok": true }`. |

### Examples

```
GET /suggest?q=iph
{ "prefix": "iph", "suggestions": [ { "query": "iphone", "count": 98234 } ], "cache": "MISS", "node": "cache-node-2" }

POST /search   body: { "query": "iphone 16" }
{ "message": "Searched", "query": "iphone 16" }

GET /cache/debug?prefix=iph
{ "prefix": "iph", "cacheNode": "cache-node-2", "status": "HIT" }
```

---

## Architecture

```
React + Vite UI (5173)
        │  HTTP via Vite proxy (/api)
        ▼
Express API (4000)  ── /suggest /search /trending /cache/debug /metrics
        │
        ▼
Distributed cache (consistent-hash ring: 4 nodes × 100 virtual nodes, 30s TTL)
        │  cache miss falls through
        ▼
SQLite primary store  queries(query, count, last_searched)

Off the write path:
  • Batch writer   — buffers + aggregates searches, flushes every 10s / 50 searches, then invalidates cache
  • Trending engine — 1h sliding window + exponential decay for recency-aware ranking
```

- **Read path:** debounced `/suggest` → hash prefix → owning cache node → HIT returns cached top-10; MISS runs indexed SQL (`LIKE 'prefix%' ORDER BY count DESC LIMIT 10`), caches the result (30s TTL), returns it.
- **Write path:** `/search` returns immediately, buffers the query, records recency; the batch writer flushes aggregated count deltas to SQLite in one transaction and invalidates affected prefixes.
- **Consistent hashing:** 4 nodes placed at 100 ring positions each (even distribution). Adding/removing a node remaps only ~1/N of keys vs. `hash%N` remapping everything.

See `docs/ARCHITECTURE.md` for full diagrams.

---

## Quick Test (PowerShell)

```powershell
# suggestions (miss then hit)
Invoke-RestMethod "http://localhost:4000/suggest?q=iph" | ConvertTo-Json -Depth 5

# which cache node owns a prefix
Invoke-RestMethod "http://localhost:4000/cache/debug?prefix=iph"

# submit searches (buffered, aggregated)
1..100 | % { Invoke-RestMethod -Method POST "http://localhost:4000/search" -ContentType "application/json" -Body '{"query":"iphone 16"}' | Out-Null }

# trending + metrics
Invoke-RestMethod "http://localhost:4000/trending" | ConvertTo-Json -Depth 5
Invoke-RestMethod "http://localhost:4000/metrics"  | ConvertTo-Json -Depth 5
```

---

## Design Highlights

- **SQLite** — zero-setup embedded store; single transaction loads ~120k rows in under a second.
- **Consistent hashing + virtual nodes** — even key distribution; node changes remap only ~1/N of keys.
- **Recency trending** — both signals normalized to [0,1] before the 0.7/0.3 blend; exponential decay (15-min half-life) so spikes fade.
- **Batched writes** — duplicate aggregation + one transaction per flush gives ~95–98% write reduction. Trade-off: a hard crash loses the buffered window (≤10s / 50 searches), acceptable for approximate popularity counts; flushes on graceful shutdown.

---

## Performance (representative, local run)

- Cache-hit reads: sub-millisecond; cache-miss (DB) reads: ~1–2 ms (p95 ~1.8 ms).
- Cache hit rate on warm prefixes: 85–95%.
- Batch write reduction: ~95–98% (100 searches → ~2 DB writes).
- Even cache-node distribution via virtual nodes.

See `docs/PERFORMANCE_REPORT.md` for tables and reproduce-it commands.



DRIVE LINK FORR VIDEO AND SS

https://drive.google.com/drive/folders/1_CHYI8nr-6MPQvw4NHJMptX3wrdTGwz7
