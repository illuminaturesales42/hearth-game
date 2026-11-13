-- The cloud-save table, created by hand before migrations existed (the exact
-- CREATE is recorded in wrangler.toml's one-time-setup comment). Written
-- IF NOT EXISTS so applying migration 0001 to the live database is a no-op
-- that simply records the table as tracked, while a fresh local database
-- bootstraps from the same file.
CREATE TABLE IF NOT EXISTS saves (
  device_key TEXT PRIMARY KEY,
  rev        INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  save       TEXT NOT NULL
);
