-- Outbidbid schema
-- sites are created only when a bid is PAID (no free listings, no URL squatting)
CREATE TABLE IF NOT EXISTS sites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  host       TEXT NOT NULL UNIQUE,
  tagline    TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'Site',
  created_at INTEGER NOT NULL
);

-- bids: pending -> paid | abandoned
-- new_* columns carry the listing payload when the bid creates a new site
CREATE TABLE IF NOT EXISTS bids (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      INTEGER REFERENCES sites(id),
  new_title    TEXT,
  new_url      TEXT,
  new_tagline  TEXT,
  new_category TEXT DEFAULT 'Site',
  amount_cents INTEGER NOT NULL,
  payer_name   TEXT NOT NULL DEFAULT '',
  provider     TEXT NOT NULL DEFAULT 'demo',  -- 'stripe' | 'demo'
  provider_ref TEXT NOT NULL DEFAULT '',       -- stripe checkout session id
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  paid_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_bids_site ON bids(site_id, status, paid_at);
CREATE INDEX IF NOT EXISTS idx_bids_ref  ON bids(provider_ref);

-- one Dodo product per dollar amount, so checkouts show "$N + tax" not "$1 x N"
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
