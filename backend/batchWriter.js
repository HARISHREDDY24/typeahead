import { flushToDb } from "./suggestions.js";
import { invalidatePrefixes } from "./trending.js";
import { metrics } from "./metrics.js";

const FLUSH_INTERVAL_MS = 10_000; // flush every 10 seconds
const FLUSH_SIZE = 50;            // ...or when 50 searches are buffered

let buffer = new Map();   // query -> aggregated count in this window
let bufferedCount = 0;    // total searches buffered (incl. duplicates)
let timer = null;

export function enqueueSearch(query) {
    metrics.searchesReceived++;
    buffer.set(query, (buffer.get(query) || 0) + 1);
    bufferedCount++;
    if (bufferedCount >= FLUSH_SIZE) flush("size");
}

export function flush(reason = "interval") {
    if (buffer.size === 0) return;
    const toWrite = buffer;
    const touchedQueries = [...buffer.keys()];
    const total = bufferedCount;

    // swap in a fresh buffer immediately so new searches aren't lost during write
    buffer = new Map();
    bufferedCount = 0;

    const distinct = flushToDb(toWrite);
    // invalidate cached suggestions for everything we just changed
    for (const q of touchedQueries) invalidatePrefixes(q);

    console.log(`[batch flush:${reason}] ${total} searches -> ${distinct} DB writes (saved ${total - distinct})`);
}

export function startBatchWriter() {
    if (timer) return;
    timer = setInterval(() => flush("interval"), FLUSH_INTERVAL_MS);
    console.log(`Batch writer started: flush every ${FLUSH_INTERVAL_MS / 1000}s or ${FLUSH_SIZE} searches`);
}

// Flush on shutdown so we don't lose the last buffer.
export function stopBatchWriter() {
    if (timer) clearInterval(timer);
    flush("shutdown");
}