-- KinCast schema. Idempotent: safe to run on every start.

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id              serial PRIMARY KEY,
  username        text UNIQUE NOT NULL,
  email           text UNIQUE NOT NULL,
  display_name    text NOT NULL,
  password_hash   text NOT NULL,
  -- admin: manages the family; member: uploads + goes live; viewer: watches + comments
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  avatar_color    text NOT NULL DEFAULT '#6366F1',
  stream_key      text UNIQUE NOT NULL,   -- secret, typed into OBS
  stream_id       text UNIQUE NOT NULL,   -- public name of the HLS output
  stream_title    text NOT NULL DEFAULT '',
  save_streams    boolean NOT NULL DEFAULT true,
  is_live         boolean NOT NULL DEFAULT false,
  live_started_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invites (
  code        text PRIMARY KEY,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  created_by  int REFERENCES users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  used_by     int REFERENCES users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS videos (
  id            text PRIMARY KEY,
  user_id       int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  progress      int NOT NULL DEFAULT 0,
  error         text,
  duration      real,
  width         int,
  height        int,
  source        text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'live')),
  original_name text,
  original_ext  text NOT NULL DEFAULT 'mp4',
  filmed_on     date,                     -- when the home video was actually recorded
  views         int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS videos_user_idx ON videos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_status_idx ON videos (status);

CREATE TABLE IF NOT EXISTS likes (
  video_id   text NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id    int  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         serial PRIMARY KEY,
  video_id   text NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id    int  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_video_idx ON comments (video_id, created_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         serial PRIMARY KEY,
  channel_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_channel_idx ON chat_messages (channel_id, created_at DESC);

-- In-progress chunked uploads
CREATE TABLE IF NOT EXISTS uploads (
  id         text PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   text NOT NULL,
  size       bigint NOT NULL,
  received   bigint NOT NULL DEFAULT 0,
  next_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Family members following each other's channels
CREATE TABLE IF NOT EXISTS subscriptions (
  subscriber_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscriber_id, channel_id),
  CHECK (subscriber_id <> channel_id)
);
CREATE INDEX IF NOT EXISTS subscriptions_channel_idx ON subscriptions (channel_id);

-- In-app notifications (bell): someone you follow uploaded or went live
CREATE TABLE IF NOT EXISTS notifications (
  id         serial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- recipient
  actor_id   int NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- who uploaded / went live
  type       text NOT NULL CHECK (type IN ('upload', 'live')),
  video_id   text REFERENCES videos(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
