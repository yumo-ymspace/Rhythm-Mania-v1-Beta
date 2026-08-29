-- Identity / session tables only. Do not create score or leaderboard tables.
-- Run this on your existing PostgreSQL database after confirming with the project owner.

CREATE TABLE IF NOT EXISTS osu_users (
  osu_id        bigint PRIMARY KEY,
  username      text NOT NULL,
  avatar_url    text,
  cover_url     text,
  country_code  text,
  pp            double precision,
  global_rank   integer,
  level         double precision,
  updated_at    timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS osu_oauth_tokens (
  osu_id        bigint PRIMARY KEY REFERENCES osu_users(osu_id),
  access_token  text NOT NULL,
  refresh_token text NOT NULL,
  expires_at    timestamptz NOT NULL,
  scopes        text NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY,
  osu_id        bigint NOT NULL REFERENCES osu_users(osu_id),
  expires_at    timestamptz NOT NULL
);
