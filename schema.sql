-- Brand My Setup — Database Schema
-- Spots across MacBook, Mechanical Keyboard, Mouse, and Desk Mat

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS setup_spots (
  id               TEXT PRIMARY KEY,
  category         TEXT NOT NULL,         -- 'macbook', 'keyboard', 'mouse', 'deskmat'
  name             TEXT NOT NULL,         -- e.g. 'ESC Key', 'Spacebar', 'MacBook Top Marquee'
  subtitle         TEXT NOT NULL DEFAULT '',
  price_cents      INTEGER NOT NULL,      -- in USD cents
  status           TEXT NOT NULL DEFAULT 'available', -- 'available', 'pending', 'paid'
  sponsor_name     TEXT NOT NULL DEFAULT '',
  sponsor_url      TEXT NOT NULL DEFAULT '',
  sponsor_tagline  TEXT NOT NULL DEFAULT '',
  sponsor_logo_url TEXT NOT NULL DEFAULT '',
  paid_at          INTEGER,
  order_id         INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_spots_category ON setup_spots(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_spots_status   ON setup_spots(status);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id          TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  sponsor_name     TEXT NOT NULL DEFAULT '',
  sponsor_url      TEXT NOT NULL DEFAULT '',
  sponsor_tagline  TEXT NOT NULL DEFAULT '',
  sponsor_logo_url TEXT NOT NULL DEFAULT '',
  provider         TEXT NOT NULL DEFAULT 'dodo',
  provider_ref     TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'abandoned'
  created_at       INTEGER NOT NULL,
  paid_at          INTEGER,
  FOREIGN KEY (spot_id) REFERENCES setup_spots(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_ref    ON orders(provider_ref);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);

-- Cache Dodo product IDs for dynamic price tiers
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
