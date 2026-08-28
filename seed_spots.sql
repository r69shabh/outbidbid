-- Seed Setup Spots for Brand My Setup

-- Clean & recreate tables safely
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS setup_spots;
PRAGMA foreign_keys = ON;

CREATE TABLE setup_spots (
  id               TEXT PRIMARY KEY,
  category         TEXT NOT NULL,
  name             TEXT NOT NULL,
  subtitle         TEXT NOT NULL DEFAULT '',
  price_cents      INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'available',
  sponsor_name     TEXT NOT NULL DEFAULT '',
  sponsor_url      TEXT NOT NULL DEFAULT '',
  sponsor_tagline  TEXT NOT NULL DEFAULT '',
  sponsor_logo_url TEXT NOT NULL DEFAULT '',
  paid_at          INTEGER,
  order_id         INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_spots_category ON setup_spots(category, sort_order);
CREATE INDEX idx_spots_status   ON setup_spots(status);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id          TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  sponsor_name     TEXT NOT NULL DEFAULT '',
  sponsor_url      TEXT NOT NULL DEFAULT '',
  sponsor_tagline  TEXT NOT NULL DEFAULT '',
  sponsor_logo_url TEXT NOT NULL DEFAULT '',
  provider         TEXT NOT NULL DEFAULT 'dodo',
  provider_ref     TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pending',
  created_at       INTEGER NOT NULL,
  paid_at          INTEGER,
  FOREIGN KEY (spot_id) REFERENCES setup_spots(id)
);

CREATE INDEX idx_orders_ref    ON orders(provider_ref);
CREATE INDEX idx_orders_status ON orders(status, created_at DESC);

-- 💻 MACBOOK PRO LID SPOTS (10 spots)
INSERT INTO setup_spots (id, category, name, subtitle, price_cents, status, sort_order) VALUES
('mac_top_center',   'macbook', 'Marquee Top Banner', 'Prime position above the Apple logo', 3000, 'available', 1),
('mac_top_left',     'macbook', 'Top Left Badge', 'Prominent upper left corner', 2000, 'available', 2),
('mac_top_right',    'macbook', 'Top Right Badge', 'Prominent upper right corner', 2000, 'available', 3),
('mac_flank_left',   'macbook', 'Apple Logo Left Flanker', 'Directly next to the Apple logo', 1500, 'available', 4),
('mac_flank_right',  'macbook', 'Apple Logo Right Flanker', 'Directly next to the Apple logo', 1500, 'available', 5),
('mac_bottom_center','macbook', 'Bottom Center Strip', 'Wide banner across the lower edge', 2500, 'available', 6),
('mac_bottom_left',  'macbook', 'Bottom Left Corner', 'Lower left corner vinyl spot', 1500, 'available', 7),
('mac_bottom_right', 'macbook', 'Bottom Right Corner', 'Lower right corner vinyl spot', 1500, 'available', 8),
('mac_edge_left',    'macbook', 'Left Wing Accent', 'Vertical mid-left flank', 1000, 'available', 9),
('mac_edge_right',   'macbook', 'Right Wing Accent', 'Vertical mid-right flank', 1000, 'available', 10);

-- ⌨️ MECHANICAL KEYBOARD KEYCAPS (15 keycaps)
INSERT INTO setup_spots (id, category, name, subtitle, price_cents, status, sort_order) VALUES
('key_esc',          'keyboard', 'ESC Key', 'Custom artisan top-left keycap', 1500, 'available', 11),
('key_space',        'keyboard', 'Spacebar', 'The centerpiece 6.25u wide custom keycap', 2500, 'available', 12),
('key_enter',        'keyboard', 'Return / Enter', 'High-impact accented enter key', 2000, 'available', 13),
('key_backspace',    'keyboard', 'Backspace Key', 'Wide 2u top right keycap', 1500, 'available', 14),
('key_tab',          'keyboard', 'Tab Key', 'Left column navigation keycap', 1000, 'available', 15),
('key_caps',         'keyboard', 'Caps Lock Key', 'Left mid modifier keycap', 1000, 'available', 16),
('key_cmd_left',     'keyboard', 'Left Command Key', 'Primary bottom modifier keycap', 1200, 'available', 17),
('key_cmd_right',    'keyboard', 'Right Command Key', 'Bottom right modifier keycap', 1200, 'available', 18),
('key_w',            'keyboard', 'W Key', 'Gamer / builder navigation cluster', 1000, 'available', 19),
('key_a',            'keyboard', 'A Key', 'Gamer / builder navigation cluster', 1000, 'available', 20),
('key_s',            'keyboard', 'S Key', 'Gamer / builder navigation cluster', 1000, 'available', 21),
('key_d',            'keyboard', 'D Key', 'Gamer / builder navigation cluster', 1000, 'available', 22),
('key_arrow_up',     'keyboard', 'Up Arrow Key', 'Dedicated arrow cluster keycap', 800, 'available', 23),
('key_arrow_down',   'keyboard', 'Down Arrow Key', 'Dedicated arrow cluster keycap', 800, 'available', 24),
('key_fn',           'keyboard', 'Function / Globe', 'Bottom row feature keycap', 800, 'available', 25);

-- 🖱️ MOUSE & DESK MAT (3 spots)
INSERT INTO setup_spots (id, category, name, subtitle, price_cents, status, sort_order) VALUES
('mouse_palm',       'mouse',   'Mouse Palm Rest', 'Prime palm grip custom vinyl spot', 2000, 'available', 26),
('mouse_side',       'mouse',   'Mouse Thumb Rest', 'Side grip logo accent spot', 1200, 'available', 27),
('desk_mat',         'deskmat', 'Desk Mat Corner Patch', 'Large stitched badge on desk mat', 2500, 'available', 28);

