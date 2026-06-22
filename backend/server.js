import express from "express";
import cors from "cors";
import { getSuggestions } from "./suggestions.js";
import { cacheGet, cacheSet, cacheDebug, cacheStats } from "./cache.js";
import { getTrending, getSuggestionsRecency, trackRecent } from "./trending.js";
import { enqueueSearch, startBatchWriter, stopBatchWriter } from "./batchWriter.js";
import { metrics, recordLatency, snapshot } from "./metrics.js";

const app = express();
app.use(cors());
app.use(express.json());

// --- Typeahead suggestions (cache -> DB fallback). mode=recent for recency ranking ---
app.get("/suggest", (req, res) => {
    const start = performance.now();
    const raw = req.query.q ?? "";
    const mode = req.query.mode === "recent" ? "recent" : "basic";
    const prefix = raw.trim().toLowerCase();

    if (!prefix) { recordLatency(performance.now() - start); return res.json({ prefix: raw, suggestions: [], cache: "SKIP" }); }

    if (mode === "recent") {
        const results = getSuggestionsRecency(prefix);
        recordLatency(performance.now() - start);
        return res.json({ prefix, suggestions: results, mode, cache: "BYPASS" });
    }

    const cached = cacheGet(prefix);
    if (cached.status === "HIT") {
        recordLatency(performance.now() - start);
        return res.json({ prefix, suggestions: cached.value, cache: "HIT", node: cached.node });
    }
    const results = getSuggestions(prefix);
    cacheSet(prefix, results);
    recordLatency(performance.now() - start);
    res.json({ prefix, suggestions: results, cache: "MISS", node: cached.node });
});

// --- Dummy search submission (buffered, NOT written synchronously) ---
app.post("/search", (req, res) => {
    const { query } = req.body || {};
    if (!query || !query.trim()) return res.status(400).json({ error: "query is required" });
    const clean = query.trim().toLowerCase();

    enqueueSearch(clean);   // buffered write (aggregated, flushed later)
    trackRecent(clean);     // recency tracking is immediate (in-memory)

    res.json({ message: "Searched", query: clean });
});

// --- Trending (recency-aware) ---
app.get("/trending", (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "10", 10) || 10, 50);
    res.json({ trending: getTrending(limit) });
});

// --- Metrics ---
app.get("/metrics", (_req, res) => res.json(snapshot(cacheStats)));

// --- Cache routing debug ---
app.get("/cache/debug", (req, res) => {
    const prefix = (req.query.prefix ?? "").trim().toLowerCase();
    if (!prefix) return res.status(400).json({ error: "prefix is required" });
    res.json(cacheDebug(prefix));
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = 4000;
startBatchWriter();
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));

// Flush buffer on shutdown (Ctrl+C) so the last batch isn't lost.
process.on("SIGINT", () => { stopBatchWriter(); process.exit(0); });
process.on("SIGTERM", () => { stopBatchWriter(); process.exit(0); });