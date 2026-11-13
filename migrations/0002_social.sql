-- Real social: friends, invites, the mailbox that carries every grant, and
-- async duels. See docs/multiplayer-spec.md.
--
-- Two rules shape this schema:
--   1. Energy is never mintable client-side, so nothing of value moves without
--      a `mailbox` row the server wrote and the client later CLAIMS. The claim
--      is a single atomic UPDATE (claimed_at IS NULL), which makes every grant
--      exactly-once even if the client retries.
--   2. The device key is a bearer secret. `players.player_id` is a separate,
--      randomly-minted public id — it is the only identifier that ever appears
--      in a payload another player can see.

CREATE TABLE players (
  player_id  TEXT PRIMARY KEY,        -- public: 'p_' + 16 base32 chars
  device_key TEXT NOT NULL UNIQUE,    -- secret: never leaves the Authorization header
  name       TEXT NOT NULL DEFAULT '',
  portrait   TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

CREATE TABLE invites (
  token       TEXT PRIMARY KEY,       -- 128 bits of base64url
  from_player TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  redeemed_by TEXT,                   -- NULL while the invite is still open
  redeemed_at INTEGER
);
CREATE INDEX idx_invites_from ON invites (from_player, created_at);

-- One row per friendship, stored with a < b so the pair has a single identity
-- and the PRIMARY KEY does the duplicate-friendship check for us.
CREATE TABLE friendships (
  a          TEXT NOT NULL,
  b          TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  via_token  TEXT,
  PRIMARY KEY (a, b)
);
CREATE INDEX idx_friendships_b ON friendships (b);

-- Every grant in the game. `id` is a deterministic idempotency key (jb:/g:/hr:/
-- hf:/dc:/dr:), so a retried request collides on the PRIMARY KEY instead of
-- minting a second item.
CREATE TABLE mailbox (
  id          TEXT PRIMARY KEY,
  to_player   TEXT NOT NULL,
  from_player TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- gift|help_request|help_fulfil|join_bonus|duel_challenge|duel_result
  payload     TEXT NOT NULL,          -- JSON, validated on write
  created_at  INTEGER NOT NULL,
  claimed_at  INTEGER                 -- NULL = unclaimed; the claim UPDATE is the grant gate
);
CREATE INDEX idx_mailbox_to ON mailbox (to_player, claimed_at, created_at);
-- Rate limits count these rows directly rather than keeping counters that can drift.
CREATE INDEX idx_mailbox_from ON mailbox (from_player, kind, created_at);

-- Both players race the SAME seeded board on their own time; high score wins.
-- `mode` and the status machine are the seam a live mode would drive later.
CREATE TABLE duels (
  duel_id          TEXT PRIMARY KEY,
  mode             TEXT NOT NULL DEFAULT 'async_score',
  seed             INTEGER NOT NULL,
  challenger       TEXT NOT NULL,
  opponent         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',   -- open|resolved|expired
  challenger_score INTEGER,
  challenger_moves INTEGER,
  opponent_score   INTEGER,
  opponent_moves   INTEGER,
  winner           TEXT,                            -- player_id | 'tie' | NULL
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  resolved_at      INTEGER
);
CREATE INDEX idx_duels_challenger ON duels (challenger, status);
CREATE INDEX idx_duels_opponent ON duels (opponent, status);
