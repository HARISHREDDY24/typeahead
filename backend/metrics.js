export const metrics = {
    dbReads: 0,
    dbWrites: 0,          // actual DB write statements executed (post-batching)
    searchesReceived: 0,  // logical search requests (pre-batching)
    latencies: [],        // recent /suggest latencies in ms (capped)
};

const MAX_SAMPLES = 1000;

export function recordLatency(ms) {
    metrics.latencies.push(ms);
    if (metrics.latencies.length > MAX_SAMPLES) metrics.latencies.shift();
}

function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Number(sorted[idx].toFixed(2));
}

export function snapshot(cacheStats) {
    const lat = metrics.latencies;
    const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
    const totalCacheReqs = cacheStats.hits + cacheStats.misses;

    return {
        latencyMs: {
            avg: Number(avg.toFixed(2)),
            p50: percentile(lat, 50),
            p95: percentile(lat, 95),
            p99: percentile(lat, 99),
            samples: lat.length,
        },
        cache: {
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            hitRate: totalCacheReqs ? Number((cacheStats.hits / totalCacheReqs).toFixed(3)) : 0,
            missRate: totalCacheReqs ? Number((cacheStats.misses / totalCacheReqs).toFixed(3)) : 0,
        },
        db: {
            reads: metrics.dbReads,
            writes: metrics.dbWrites,
        },
        batching: {
            searchesReceived: metrics.searchesReceived,
            dbWrites: metrics.dbWrites,
            // how many synchronous writes we avoided
            writesAvoided: Math.max(0, metrics.searchesReceived - metrics.dbWrites),
            reductionPct: metrics.searchesReceived
                ? Number((100 * (1 - metrics.dbWrites / metrics.searchesReceived)).toFixed(1))
                : 0,
        },
    };
}