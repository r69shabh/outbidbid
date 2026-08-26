-- Outbidbid — King of the Hill schema
-- No sites table. The throne belongs to the most recent paid bidder.

-- bids: pending -> paid | abandoned
-- paid bids ordered by paid_at DESC = live leaderboard (most recent = #1 / current king)
CREATE TABLE IF NOT EXISTS bids (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  payer_name    TEXT NOT NULL DEFAULT '',
  payer_url     TEXT NOT NULL DEFAULT '',
  payer_tagline TEXT NOT NULL DEFAULT '',
  amount_cents  INTEGER NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'demo',
  provider_ref  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    INTEGER NOT NULL,
  paid_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_bids_status_paid ON bids(status, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_bids_ref         ON bids(provider_ref);

-- one Dodo product per dollar amount (cached, reused across bids)
CREATE TABLE IF NOT EXISTS price_products (
  amount_cents INTEGER PRIMARY KEY,
  product_id   TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- Analytics & Real-Time Presence
CREATE TABLE IF NOT EXISTS page_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS presence (
  visitor_id TEXT PRIMARY KEY,
  last_seen  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at);
