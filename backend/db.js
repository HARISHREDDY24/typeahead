import Database from "better-sqlite3";

const db = new Database("typeahead.db");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS queries (
    query TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    last_searched INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_query_prefix ON queries(query);
`);

export default db;