import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { q, one } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { ah, httpError, cleanText, randomId } from '../util.js';
import { config } from '../config.js';
import { subscribe, broadcast, viewerCount } from '../livehub.js';
import { enqueue, videoDir, originalPath, probe } from '../transcode.js';

// ======================= Family-facing live API =======================
const r = Router();
r.use(requireAuth);

const hlsPlaylist = (streamId) => path.join(config.dirs.hls, streamId, 'index.m3u8');

function serializeChannel(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    title: u.stream_title || `${u.display_name} is live`,
    isLive: u.is_live,
    startedAt: u.live_started_at,
    viewers: viewerCount(u.id),
    hls: u.is_live ? `/hls/${u.stream_id}/index.m3u8` : null,
    ready: u.is_live && fs.existsSync(hlsPlaylist(u.stream_id)),
  };
}

r.get('/', ah(async (_req, res) => {
  const { rows } = await q('SELECT * FROM users WHERE is_live ORDER BY live_started_at DESC');
  res.json({ channels: rows.map(serializeChannel) });
}));

r.get('/channel/:username', ah(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE username = $1', [req.params.username]);
  if (!u) throw httpError(404, 'Channel not found');
  res.json({ channel: serializeChannel(u) });
}));

r.get('/channel/:username/events', ah(async (req, res) => {
  const u = await one('SELECT id FROM users WHERE username = $1', [req.params.username]);
  if (!u) throw httpError(404, 'Channel not found');
  subscribe(u.id, req, res);
}));

r.get('/channel/:username/chat', ah(async (req, res) => {
  const u = await one('SELECT id FROM users WHERE username = $1', [req.params.username]);
  if (!u) throw httpError(404, 'Channel not found');
  const { rows } = await q(
    `SELECT m.id, m.body, m.created_at, u.id AS uid, u.username, u.display_name, u.avatar_color
     FROM chat_messages m JOIN users u ON u.id = m.user_id
     WHERE m.channel_id = $1 AND m.created_at > now() - interval '12 hours'
     ORDER BY m.created_at DESC LIMIT 100`,
    [u.id],
  );
  res.json({ messages: rows.reverse().map(serializeMessage) });
}));

function serializeMessage(m) {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.created_at,
    author: { id: m.uid, username: m.username, displayName: m.display_name, avatarColor: m.avatar_color },
  };
}

r.post('/channel/:username/chat', ah(async (req, res) => {
  const body = cleanText(req.body.body, 500);
  if (!body) throw httpError(400, 'Message is empty');
  const u = await one('SELECT id FROM users WHERE username = $1', [req.params.username]);
  if (!u) throw httpError(404, 'Channel not found');
  const m = await one(
    'INSERT INTO chat_messages (channel_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at',
    [u.id, req.user.id, body],
  );
  const msg = serializeMessage({
    id: m.id, body, created_at: m.created_at, uid: req.user.id,
    username: req.user.username, display_name: req.user.display_name, avatar_color: req.user.avatar_color,
  });
  broadcast(u.id, 'chat', msg);
  res.status(201).json({ message: msg });
}));

// ---- My stream settings (members + admins) ----
r.get('/me', requireRole('member'), ah(async (req, res) => {
  const u = await one('SELECT stream_key, stream_title, save_streams, is_live, username FROM users WHERE id = $1', [req.user.id]);
  res.json({
    rtmpUrl: config.rtmpUrl,
    streamKey: u.stream_key,
    title: u.stream_title,
    saveStreams: u.save_streams,
    isLive: u.is_live,
    watchUrl: `${config.publicUrl}/live/${u.username}`,
  });
}));

r.patch('/me', requireRole('member'), ah(async (req, res) => {
  if (req.body.title !== undefined) {
    const title = cleanText(req.body.title, 120);
    await q('UPDATE users SET stream_title = $2 WHERE id = $1', [req.user.id, title]);
    broadcast(req.user.id, 'title', { title: title || `${req.user.display_name} is live` });
  }
  if (req.body.saveStreams !== undefined) {
    await q('UPDATE users SET save_streams = $2 WHERE id = $1', [req.user.id, !!req.body.saveStreams]);
  }
  res.json({ ok: true });
}));

r.post('/me/reset-key', requireRole('member'), ah(async (req, res) => {
  const key = `kc_${randomId(28)}`;
  await q('UPDATE users SET stream_key = $2 WHERE id = $1', [req.user.id, key]);
  res.json({ streamKey: key });
}));

export default r;

// ======================= nginx-rtmp callbacks =======================
// nginx-rtmp POSTs form-encoded data. These endpoints are only reachable on the internal
// Docker network, and additionally require the shared secret in the query string.
export const rtmp = Router();
rtmp.use(express.urlencoded({ extended: false }));
rtmp.use((req, _res, next) => {
  if (config.rtmpCallbackSecret && req.query.secret !== config.rtmpCallbackSecret) {
    return next(httpError(403, 'Bad callback secret'));
  }
  next();
});

// OBS connects with the secret stream key. We check it, then redirect (3xx) the stream to the
// user's public stream id — so the key never appears in playback URLs. (Same idea as OSP.)
rtmp.post('/publish', ah(async (req, res) => {
  const key = String(req.body.name || '');
  const u = await one(
    "SELECT * FROM users WHERE stream_key = $1 AND role IN ('admin', 'member')",
    [key],
  );
  if (!u) {
    console.warn(`[rtmp] rejected publish from ${req.body.addr} (unknown key)`);
    return res.status(403).send('forbidden');
  }
  if (u.is_live) {
    // Stale flag from a crash, or a second encoder. Allow it; nginx drops the old one.
    console.warn(`[rtmp] ${u.username} was already marked live; taking over`);
  }
  await q('UPDATE users SET is_live = true, live_started_at = now() WHERE id = $1', [u.id]);
  broadcast(u.id, 'status', { isLive: true });
  console.log(`[rtmp] ${u.username} is live (${u.stream_id})`);
  res.redirect(302, u.stream_id);
}));

async function findStreamer(name) {
  return one('SELECT * FROM users WHERE stream_id = $1 OR stream_key = $1', [String(name || '')]);
}

rtmp.post('/publish-done', ah(async (req, res) => {
  const u = await findStreamer(req.body.name);
  if (u) {
    await q('UPDATE users SET is_live = false WHERE id = $1', [u.id]);
    broadcast(u.id, 'status', { isLive: false });
    console.log(`[rtmp] ${u.username} went offline`);
  }
  res.send('ok');
}));

// A finished recording: turn it into a regular family video (unless the streamer opted out).
rtmp.post('/record-done', ah(async (req, res) => {
  res.send('ok'); // respond immediately; nginx doesn't need to wait
  const u = await findStreamer(req.body.name);
  const file = path.join(config.dirs.recordings, path.basename(String(req.body.path || '')));
  if (!u || !fs.existsSync(file) || !file.endsWith('.flv')) return;
  try {
    if (!u.save_streams) return fs.rmSync(file, { force: true });
    const meta = await probe(file).catch(() => null);
    if (!meta || meta.duration < config.minRecordingSeconds) return fs.rmSync(file, { force: true });
    const id = randomId(11);
    fs.mkdirSync(videoDir(id), { recursive: true });
    await fs.promises.rename(file, originalPath(id, 'flv')).catch(async () => {
      await fs.promises.copyFile(file, originalPath(id, 'flv'));
      await fs.promises.rm(file, { force: true });
    });
    const when = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const title = u.stream_title ? `${u.stream_title} (live replay)` : `Live replay — ${when}`;
    await q(
      `INSERT INTO videos (id, user_id, title, source, original_name, original_ext, filmed_on)
       VALUES ($1, $2, $3, 'live', $4, 'flv', current_date)`,
      [id, u.id, title.slice(0, 120), path.basename(file)],
    );
    enqueue(id);
    console.log(`[rtmp] saved replay of ${u.username}'s stream as ${id}`);
  } catch (err) {
    console.error('[rtmp] record-done failed:', err.message);
  }
}));

/**
 * Clear "live" flags whose HLS output has gone stale (missed publish-done callback, crash, restart).
 * Runs at startup and every minute. A stream that is genuinely live rewrites its playlist every few seconds.
 */
export async function sweepStaleLive() {
  const { rows } = await q('SELECT id, stream_id, live_started_at FROM users WHERE is_live');
  for (const u of rows) {
    let fresh = false;
    try {
      fresh = Date.now() - fs.statSync(hlsPlaylist(u.stream_id)).mtimeMs < 45000;
    } catch {
      // No playlist yet: give a just-started stream a minute to produce one.
      fresh = Date.now() - new Date(u.live_started_at).getTime() < 60000;
    }
    if (!fresh) {
      await q('UPDATE users SET is_live = false WHERE id = $1', [u.id]);
      broadcast(u.id, 'status', { isLive: false });
    }
  }
}
