-- HexRun şeması v1. PostGIS gerekmez: mekânsal indeksleme H3 ebeveyn hücreleriyle yapılır.

CREATE TABLE users (
  id               uuid PRIMARY KEY,
  email            text,
  apple_sub        text UNIQUE,
  google_sub       text UNIQUE,
  username         text,
  display_name     text NOT NULL DEFAULT '',
  slot             text NOT NULL DEFAULT 'keh',
  role             text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  locale           text NOT NULL DEFAULT 'tr',
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Gizlilik bölgesi: ev konumu saklanmaz, yalnız rastgele kaydırılmış merkez.
  privacy_lat      double precision,
  privacy_lng      double precision,
  privacy_radius_m integer,
  insignia         text[] NOT NULL DEFAULT '{}',
  insignia_changed_on date,
  shield_cells     text[],
  shield_until     timestamptz,
  shield_week      text,
  team_id          uuid,
  invite_code      text NOT NULL UNIQUE,
  push_token       text,
  push_platform    text,
  running_until    timestamptz,
  league_region    text,
  last_active_at   timestamptz
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_username_uq ON users (lower(username)) WHERE username IS NOT NULL;
CREATE INDEX users_team_idx ON users (team_id);
CREATE INDEX users_league_idx ON users (league_region);

CREATE TABLE email_codes (
  email      text PRIMARY KEY,
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family      uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

CREATE TABLE teams (
  id          uuid PRIMARY KEY,
  name        text NOT NULL,
  slot        text NOT NULL,
  captain_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  region      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teams_name_uq ON teams (lower(name));
ALTER TABLE users ADD CONSTRAINT users_team_fk FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- Petek: H3 res-12. parent7 harita sorguları, region lig ve kilitler içindir.
CREATE TABLE cells (
  id                  text PRIMARY KEY,
  parent7             text NOT NULL,
  lock_region         text NOT NULL,
  area_m2             real NOT NULL,
  owner_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  power               real NOT NULL DEFAULT 0,
  owned_since         timestamptz,
  last_owner_loop_at  timestamptz,
  decay_steps         integer NOT NULL DEFAULT 0,
  owner_loops_day     text,
  owner_loops_count   integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cells_parent7_idx ON cells (parent7);
CREATE INDEX cells_owner_idx ON cells (owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX cells_decay_idx ON cells (lock_region, last_owner_loop_at) WHERE owner_id IS NOT NULL;

CREATE TABLE cell_events (
  id         bigserial PRIMARY KEY,
  cell_id    text NOT NULL,
  at         timestamptz NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('claim', 'reinforce', 'capture', 'decay', 'empty')),
  actor_id   uuid,
  from_id    uuid,
  power_delta real NOT NULL DEFAULT 0
);
CREATE INDEX cell_events_cell_idx ON cell_events (cell_id, at DESC);
CREATE INDEX cell_events_at_idx ON cell_events (at);

CREATE TABLE duels (
  id                 uuid PRIMARY KEY,
  attacker_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defender_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cells              text[] NOT NULL,
  lock_regions       text[] NOT NULL,
  progress           real NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL,
  first_counted_at   timestamptz,
  -- Sahip düelloyu ilk sayılan halkadan sonra görür (Şafak Akıncısı ile 2 sa gecikmeli).
  defender_visible_at timestamptz,
  last_attack_at     timestamptz,
  attack_decay_steps integer NOT NULL DEFAULT 0,
  attacks_day        text,
  attacks_count      integer NOT NULL DEFAULT 0,
  defenses_day       text,
  defenses_count     integer NOT NULL DEFAULT 0,
  warned             smallint NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'won', 'expired', 'closed', 'reset', 'cancelled')),
  ended_at           timestamptz
);
CREATE INDEX duels_active_attacker_idx ON duels (attacker_id) WHERE status = 'active';
CREATE INDEX duels_active_defender_idx ON duels (defender_id) WHERE status = 'active';
CREATE INDEX duels_cells_gin ON duels USING gin (cells) WHERE status = 'active';
CREATE INDEX duels_regions_gin ON duels USING gin (lock_regions) WHERE status = 'active';

CREATE TABLE losses (
  cell_id   text NOT NULL,
  player_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at        timestamptz NOT NULL
);
CREATE INDEX losses_player_idx ON losses (player_id, at);

CREATE TABLE runs (
  id            uuid PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_run_id text NOT NULL,
  source        text NOT NULL,
  external_id   text,
  device        text,
  started_at    timestamptz NOT NULL,
  ended_at      timestamptz NOT NULL,
  distance_m    real NOT NULL,
  duration_ms   bigint NOT NULL,
  pace          real,
  status        text NOT NULL,
  -- Ham GPS noktaları 30 gün sonra silinir (gizlilik politikası).
  points        jsonb,
  review        jsonb,
  note          text,
  open_gap_m    real,
  gained_area_m2 real NOT NULL DEFAULT 0,
  summary       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_run_id)
);
CREATE INDEX runs_user_idx ON runs (user_id, started_at DESC);
CREATE UNIQUE INDEX runs_external_uq ON runs (user_id, source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE loops (
  id         uuid PRIMARY KEY,
  run_id     uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idx        integer NOT NULL,
  started_at timestamptz NOT NULL,
  closed_at  timestamptz NOT NULL,
  length_m   real NOT NULL,
  area_m2    real NOT NULL,
  cells      text[] NOT NULL,
  status     text NOT NULL CHECK (status IN ('applied', 'review', 'rejected', 'stats_only')),
  result     jsonb,
  decided_by uuid,
  decided_at timestamptz
);
CREATE INDEX loops_review_idx ON loops (closed_at) WHERE status = 'review';
CREATE INDEX loops_run_idx ON loops (run_id);

CREATE TABLE notifications (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  category    text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL,
  read_at     timestamptz,
  push        boolean NOT NULL DEFAULT true,
  push_after  timestamptz NOT NULL,
  pushed_at   timestamptz,
  push_status text
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_push_idx ON notifications (push_after) WHERE push AND pushed_at IS NULL AND push_status IS NULL;

CREATE TABLE badges_earned (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id  text NOT NULL,
  earned_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);

CREATE TABLE player_stats (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  loops_closed        integer NOT NULL DEFAULT 0,
  empty_cells_claimed integer NOT NULL DEFAULT 0,
  peak_territory_m2   real NOT NULL DEFAULT 0,
  biggest_loop_m2     real NOT NULL DEFAULT 0,
  duels_won           integer NOT NULL DEFAULT 0,
  recaptures          integer NOT NULL DEFAULT 0,
  defenses            integer NOT NULL DEFAULT 0,
  duels_faced         integer NOT NULL DEFAULT 0,
  duels_defended      integer NOT NULL DEFAULT 0,
  early_runs          integer NOT NULL DEFAULT 0,
  late_runs           integer NOT NULL DEFAULT 0,
  morning_conquests   integer NOT NULL DEFAULT 0,
  blitz_attacks       integer NOT NULL DEFAULT 0,
  evening_defenses    integer NOT NULL DEFAULT 0,
  longest_run_m       real NOT NULL DEFAULT 0,
  total_distance_m    real NOT NULL DEFAULT 0,
  imported_runs       integer NOT NULL DEFAULT 0
);

-- Günlük kazanılan alan: haftalık/aylık lig.
CREATE TABLE area_gains (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       date NOT NULL,
  region    text NOT NULL,
  gained_m2 real NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, region)
);
CREATE INDEX area_gains_region_day_idx ON area_gains (region, day);

CREATE TABLE run_days (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day        date NOT NULL,
  distance_m real NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE league_snapshots (
  region   text NOT NULL,
  scope    text NOT NULL,
  period   text NOT NULL,
  day      date NOT NULL,
  ranks    jsonb NOT NULL,
  PRIMARY KEY (region, scope, period, day)
);

CREATE TABLE friendships (
  user_a     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX friendships_b_idx ON friendships (user_b);

CREATE TABLE feed_items (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  subtitle   text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL
);
CREATE INDEX feed_items_user_idx ON feed_items (user_id, created_at DESC);

CREATE TABLE claps (
  feed_id    uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_id, user_id)
);

CREATE TABLE integrations (
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL,
  external_user   text,
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  import_enabled  boolean NOT NULL DEFAULT true,
  export_enabled  boolean NOT NULL DEFAULT false,
  last_sync_at    timestamptz,
  device          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
CREATE INDEX integrations_external_idx ON integrations (provider, external_user);

CREATE TABLE oauth_states (
  state      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider   text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE event_reminders (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE waitlist (
  email      text PRIMARY KEY,
  locale     text NOT NULL DEFAULT 'tr',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_state (
  name     text PRIMARY KEY,
  value    jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
