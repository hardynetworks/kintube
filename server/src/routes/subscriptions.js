import { Router } from 'express';
import { q, one } from '../db.js';
import { requireAuth } from '../auth.js';
import { ah, httpError } from '../util.js';
import { viewerCount } from '../livehub.js';

const r = Router();
r.use(requireAuth);

// ---- Subscriptions ----

// Channels I follow, live ones first, then most recently active.
r.get('/subscriptions', ah(async (req, res) => {
  const { rows } = await q(`
    SELECT u.id, u.username, u.display_name, u.avatar_color, u.is_live, s.created_at AS since,
           (SELECT max(v.created_at) FROM videos v WHERE v.user_id = u.id AND v.status = 'ready') AS last_upload,
           (SELECT count(*)::int FROM videos v WHERE v.user_id = u.id AND v.status = 'ready') AS video_count
    FROM subscriptions s JOIN users u ON u.id = s.channel_id
    WHERE s.subscriber_id = $1
    ORDER BY u.is_live DESC, last_upload DESC NULLS LAST, u.display_name`, [req.user.id]);
  res.json({
    channels: rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      avatarColor: u.avatar_color,
      isLive: u.is_live,
      viewers: u.is_live ? viewerCount(u.id) : 0,
      videoCount: u.video_count,
      lastUpload: u.last_upload,
      since: u.since,
    })),
  });
}));

async function channelByUsername(username) {
  const u = await one('SELECT id, display_name FROM users WHERE username = $1', [username]);
  if (!u) throw httpError(404, 'Channel not found');
  return u;
}

async function countFor(channelId) {
  return (await one('SELECT count(*)::int AS n FROM subscriptions WHERE channel_id = $1', [channelId])).n;
}

r.put('/subscriptions/:username', ah(async (req, res) => {
  const ch = await channelByUsername(req.params.username);
  if (ch.id === req.user.id) throw httpError(400, "You can't subscribe to yourself");
  await q('INSERT INTO subscriptions (subscriber_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, ch.id]);
  res.json({ subscribed: true, subscribers: await countFor(ch.id) });
}));

r.delete('/subscriptions/:username', ah(async (req, res) => {
  const ch = await channelByUsername(req.params.username);
  await q('DELETE FROM subscriptions WHERE subscriber_id = $1 AND channel_id = $2', [req.user.id, ch.id]);
  res.json({ subscribed: false, subscribers: await countFor(ch.id) });
}));

// ---- Notifications ----

r.get('/notifications', ah(async (req, res) => {
  const { rows } = await q(`
    SELECT n.id, n.type, n.video_id, n.title, n.read_at, n.created_at,
           u.username, u.display_name, u.avatar_color, u.is_live
    FROM notifications n JOIN users u ON u.id = n.actor_id
    WHERE n.user_id = $1
    ORDER BY n.created_at DESC LIMIT 30`, [req.user.id]);
  const unread = await one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({
    unread: unread.n,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      read: !!n.read_at,
      createdAt: n.created_at,
      link: n.type === 'live' ? `/live/${n.username}` : `/watch/${n.video_id}`,
      thumbnail: n.video_id ? `/media/${n.video_id}/thumb.jpg` : null,
      stillLive: n.type === 'live' && n.is_live,
      actor: { username: n.username, displayName: n.display_name, avatarColor: n.avatar_color },
    })),
  });
}));

r.post('/notifications/read', ah(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
  if (ids?.length) {
    await q('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL', [req.user.id, ids]);
  } else {
    await q('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  }
  res.json({ ok: true });
}));

export default r;

// ---- Fan-out helpers (called from the transcoder and RTMP callbacks) ----

/** Notify subscribers that a channel published a new video. Safe to call twice for the same video. */
export async function notifyUpload(videoId) {
  const v = await one('SELECT id, user_id, title, source FROM videos WHERE id = $1', [videoId]);
  if (!v || v.source !== 'upload') return; // stream replays: subscribers were already told about the live
  await q(`
    INSERT INTO notifications (user_id, actor_id, type, video_id, title)
    SELECT s.subscriber_id, $2, 'upload', $1, $3 FROM subscriptions s
    WHERE s.channel_id = $2
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.video_id = $1 AND n.user_id = s.subscriber_id)`,
  [v.id, v.user_id, v.title]);
}

/** Notify subscribers that a channel went live (skips if they were told in the last 15 min, e.g. OBS reconnects). */
export async function notifyLive(userId, title) {
  await q(`
    INSERT INTO notifications (user_id, actor_id, type, title)
    SELECT s.subscriber_id, $1, 'live', $2 FROM subscriptions s
    WHERE s.channel_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = s.subscriber_id AND n.actor_id = $1 AND n.type = 'live'
          AND n.created_at > now() - interval '15 minutes')`,
  [userId, title]);
}

/** Keep the notification table small: drop anything older than 60 days. */
export async function pruneNotifications() {
  await q("DELETE FROM notifications WHERE created_at < now() - interval '60 days'");
}
