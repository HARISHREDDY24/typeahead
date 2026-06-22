import { ConsistentHashRing } from "./consistentHash.js";

const NODES = ["cache-node-1", "cache-node-2", "cache-node-3", "cache-node-4"];
const TTL_MS = 30_000; // suggestions cached for 30s

// Each logical node is its own Map -> simulates a separate cache server.
const stores = new Map(NODES.map((n) => [n, new Map()]));
const ring = new ConsistentHashRing(NODES, 100);

// metrics (Step 6 reads these)
export const cacheStats = { hits: 0, misses: 0 };

function nodeFor(prefix) {
    return ring.getNode(prefix);
}

export function cacheGet(prefix) {
    const node = nodeFor(prefix);
    const store = stores.get(node);
    const entry = store.get(prefix);

    if (!entry) { cacheStats.misses++; return { value: null, node, status: "MISS" }; }
    if (Date.now() > entry.expires) {            // expired -> evict
        store.delete(prefix);
        cacheStats.misses++;
        return { value: null, node, status: "MISS" };
    }
    cacheStats.hits++;
    return { value: entry.value, node, status: "HIT" };
}

export function cacheSet(prefix, value) {
    const node = nodeFor(prefix);
    stores.get(node).set(prefix, { value, expires: Date.now() + TTL_MS });
    return node;
}

// Used after writes (Step 5 batch flush) to drop stale suggestion entries.
export function cacheInvalidate(prefix) {
    const node = nodeFor(prefix);
    stores.get(node).delete(prefix);
}

export function cacheClearAll() {
    for (const s of stores.values()) s.clear();
}

// For /cache/debug — routing info without mutating hit/miss counters meaningfully.
export function cacheDebug(prefix) {
    const node = nodeFor(prefix);
    const entry = stores.get(node).get(prefix);
    const fresh = entry && Date.now() <= entry.expires;
    return { prefix, cacheNode: node, status: fresh ? "HIT" : "MISS" };
}