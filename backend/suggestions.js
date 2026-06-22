import db from "./db.js";
import { metrics } from "./metrics.js";

const prefixStmt = db.prepare(`
  SELECT query, count
  FROM queries
  WHERE query LIKE ? || '%'
  ORDER BY count DESC
  LIMIT 10
`);

// Apply a batch of {query: countDelta} in one transaction.
const upsertDelta = db.prepare(`
  INSERT INTO queries (query, count, last_searched)
  VALUES (@query, @delta, @ts)
  ON CONFLICT(query) DO UPDATE SET
    count = count + @delta,
    last_searched = @ts
`);

const applyBatch = db.transaction((rows) => {
  for (const r of rows) upsertDelta.run(r);
  metrics.dbWrites += rows.length;   // one write statement per distinct query
});

export function getSuggestions(prefix) {
  if (!prefix || !prefix.trim()) return [];
  const clean = prefix.trim().toLowerCase();
  metrics.dbReads++;
  return prefixStmt.all(clean);
}

// Called by the batch writer only. Aggregated map: query -> delta.
export function flushToDb(aggregated) {
  if (aggregated.size === 0) return 0;
  const ts = Date.now();
  const rows = [...aggregated.entries()].map(([query, delta]) => ({ query, delta, ts }));
  applyBatch(rows);
  return rows.length;
}