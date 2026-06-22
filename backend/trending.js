import db from "./db.js";
import { cacheInvalidate } from "./cache.js";

const WINDOW_MS = 60 * 60 * 1000;   // 1 hour sliding window
const HALF_LIFE_MS = 15 * 60 * 1000; // recency weight halves every 15 min

// query -> array of timestamps (ms) within the last hour
const recentHits = new Map();

// Record a search for recency tracking (called on every /search).
export function trackRecent(query) {
    const now = Date.now();
    const arr = recentHits.get(query) || [];
    arr.push(now);
    recentHits.set(query, arr);
}

// Drop timestamps older than the window. Keeps memory bounded.
function prune(now = Date.now()) {
    for (const [q, arr] of recentHits) {
        const kept = arr.filter((t) => now - t <= WINDOW_MS);
        if (kept.length) recentHits.set(q, kept);
        else recentHits.delete(q);
    }
}

// Recency activity score: recent hits count more than older ones (exponential decay).
// A spike 50 min ago contributes far less than the same spike 2 min ago.
function recentActivity(query, now = Date.now()) {
    const arr = recentHits.get(query);
    if (!arr || arr.length === 0) return 0;
    let score = 0;
    for (const t of arr) {
        const age = now - t;
        if (age > WINDOW_MS) continue;
        score += Math.pow(0.5, age / HALF_LIFE_MS); // decay weight in (0,1]
    }
    return score;
}

// --- Scoring ---
// Basic: all-time count only.
// Advanced: normalize both signals to a comparable scale, then blend 0.7 / 0.3.
function advancedScore(count, activity, maxCount, maxActivity) {
    const normCount = maxCount ? count / maxCount : 0;
    const normActivity = maxActivity ? activity / maxActivity : 0;
    return 0.7 * normCount + 0.3 * normActivity;
}

const topByCount = db.prepare(
    "SELECT query, count FROM queries ORDER BY count DESC LIMIT ?"
);
const prefixRows = db.prepare(
    "SELECT query, count FROM queries WHERE query LIKE ? || '%' ORDER BY count DESC LIMIT 50"
);

// Trending list (global), recency-aware.
export function getTrending(limit = 10) {
    prune();
    const now = Date.now();
    // candidate pool: top-200 all-time PLUS anything with recent activity
    const pool = new Map();
    for (const r of topByCount.all(200)) pool.set(r.query, r.count);
    for (const q of recentHits.keys()) {
        if (!pool.has(q)) {
            const row = db.prepare("SELECT count FROM queries WHERE query = ?").get(q);
            pool.set(q, row ? row.count : 0);
        }
    }

    const entries = [...pool.entries()].map(([query, count]) => ({
        query, count, activity: recentActivity(query, now),
    }));

    const maxCount = Math.max(1, ...entries.map((e) => e.count));
    const maxActivity = Math.max(1e-9, ...entries.map((e) => e.activity));

    return entries
        .map((e) => ({
            query: e.query,
            count: e.count,
            recentActivity: Number(e.activity.toFixed(3)),
            score: Number(advancedScore(e.count, e.activity, maxCount, maxActivity).toFixed(4)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

// Recency-aware suggestions for a prefix (used when mode=recent).
export function getSuggestionsRecency(prefix, limit = 10) {
    prune();
    const now = Date.now();
    const rows = prefixRows.all(prefix); // up to 50 prefix matches by count
    if (rows.length === 0) return [];

    const withActivity = rows.map((r) => ({
        query: r.query, count: r.count, activity: recentActivity(r.query, now),
    }));
    const maxCount = Math.max(1, ...withActivity.map((e) => e.count));
    const maxActivity = Math.max(1e-9, ...withActivity.map((e) => e.activity));

    return withActivity
        .map((e) => ({
            query: e.query,
            count: e.count,
            score: Number(advancedScore(e.count, e.activity, maxCount, maxActivity).toFixed(4)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}

// When a query's count changes, its prefixes' cached suggestions are stale.
// Invalidate cache for each prefix of the query (e.g. "iphone" -> i, ip, iph, ...).
export function invalidatePrefixes(query) {
    for (let i = 1; i <= query.length; i++) {
        cacheInvalidate(query.slice(0, i));
    }
}