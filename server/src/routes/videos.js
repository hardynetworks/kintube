import { Router } from 'express';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { q, one } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { ah, httpError, cleanText, randomId } from '../util.js';
import { config } from '../config.js';
import { enqueue, videoDir, originalPath } from '../transcode.js';
import { CHUNK_BYTES } from './auth.js';

const r = Router();
r.use(requireAuth);

const VIDEO_SELECT = `
  SELECT v.*, u.username, u.display_name, u.avatar_color,
         (SELECT count(*)::int FROM likes l WHERE l.video_id = v.id) AS like_count,
         (SELECT count(*)::int FROM comments c WHERE c.video_id = v.id) AS comment_count
  FROM videos v JOIN users u ON u.id = v.user_id`;

export function serializeVideo(v, extra = {}) {
  const ready = v.status === 'ready';
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    status: v.status,
    progress: v.progress,
    error: v.error,
    duration: v.duration,
    width: v.width,
    height: v.height,
    source: v.source,
    filmedOn: v.filmed_on,
    views: v.views,
    likes: v.like_count ?? 0,
    comments: v.comment_count ?? 0,
    createdAt: v.created_at,
    thumbnail: fs.existsSync(path.join(videoDir(v.id), 'thumb.jpg')) ? `/media/${v.id}/thumb.jpg` : null,
    hls: ready ? `/media/${v.id}/hls/master.m3u8` : null,
    owner: { id: v.user_id, username: v.username, displayName: v.display_name, avatarColor: v.avatar_color },
    ...extra,
  };
}

function canEdit(user, video) {
  return user.role === 'admin' || user.id === video.user_id;
}

// ---- Listing / search ----
r.get('/', ah(async (req, res) => {
  const where = ["v.status = 'ready'"];
  const vals = [];
  const search = cleanText(req.query.q, 100);
  if (search) {
    vals.push(`%${search.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(v.title ILIKE $${vals.length} OR v.description ILIKE $${vals.length} OR u.display_name ILIKE $${vals.length})`);
  }
  if (req.query.user) {
    vals.push(String(req.query.user));
    where.push(`u.username = $${vals.length}`);
  }
  if (req.query.source === 'live' || req.query.source === 'upload') {
    vals.push(req.query.source);
    where.push(`v.source = $${vals.length}`);
  }
  if (req.query.subscribed === '1') {
    vals.push(req.user.id);
    where.push(`v.user_id IN (SELECT channel_id FROM subscriptions WHERE subscriber_id = $${vals.length})`);
  }
  if (req.query.exclude) {
    vals.push(String(req.query.exclude));
    where.push(`v.id <> $${vals.length}`);
  }
  const order = {
    popular: 'v.views DESC, v.created_at DESC',
    filmed: 'v.filmed_on DESC NULLS LAST, v.created_at DESC',
    oldest: 'v.created_at ASC',
  }[req.query.sort] || 'v.created_at DESC';
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const { rows } = await q(
    `${VIDEO_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit + 1} OFFSET ${offset}`,
    vals,
  );
  res.json({ videos: rows.slice(0, limit).map((v) => serializeVideo(v)), hasMore: rows.length > limit });
}));

// "On this day": videos filmed on today's month/day in earlier years.
r.get('/on-this-day', ah(async (_req, res) => {
  const { rows } = await q(`${VIDEO_SELECT}
    WHERE v.status = 'ready' AND v.filmed_on IS NOT NULL
      AND extract(month FROM v.filmed_on) = extract(month FROM now())
      AND extract(day FROM v.filmed_on) = extract(day FROM now())
      AND extract(year FROM v.filmed_on) < extract(year FROM now())
    ORDER BY v.filmed_on DESC LIMIT 12`);
  res.json({ videos: rows.map((v) => serializeVideo(v)) });
}));

// The signed-in user's own videos, including those still processing (Studio).
r.get('/mine', ah(async (req, res) => {
  const { rows } = await q(`${VIDEO_SELECT} WHERE v.user_id = $1 ORDER BY v.created_at DESC`, [req.user.id]);
  res.json({ videos: rows.map((v) => serializeVideo(v)) });
}));

r.get('/:id', ah(async (req, res) => {
  const v = await one(`${VIDEO_SELECT} WHERE v.id = $1`, [req.params.id]);
  if (!v) throw httpError(404, 'Video not found');
  if (v.status !== 'ready' && !canEdit(req.user, v)) throw httpError(404, 'Video not found');
  const liked = await one('SELECT 1 FROM likes WHERE video_id = $1 AND user_id = $2', [v.id, req.user.id]);
  const sub = await one(
    `SELECT (SELECT count(*)::int FROM subscriptions WHERE channel_id = $1) AS n,
            EXISTS (SELECT 1 FROM subscriptions WHERE channel_id = $1 AND subscriber_id = $2) AS mine`,
    [v.user_id, req.user.id],
  );
  const video = serializeVideo(v, {
      liked: !!liked,
      canEdit: canEdit(req.user, v),
      hasOriginal: fs.existsSync(originalPath(v.id, v.original_ext)),
  });
  video.owner = { ...video.owner, subscribers: sub.n, subscribed: sub.mine };
  res.json({ video });
}));

r.patch('/:id', ah(async (req, res) => {
  const v = await one('SELECT * FROM videos WHERE id = $1', [req.params.id]);
  if (!v) throw httpError(404, 'Video not found');
  if (!canEdit(req.user, v)) throw httpError(403, 'Only the uploader can edit this video');
  const title = req.body.title !== undefined ? cleanText(req.body.title, 120) : v.title;
  if (!title) throw httpError(400, 'Title is required');
  const description = req.body.description !== undefined ? cleanText(req.body.description, 5000) : v.description;
  let filmedOn = v.filmed_on;
  if (req.body.filmedOn !== undefined) {
    filmedOn = req.body.filmedOn && /^\d{4}-\d{2}-\d{2}$/.test(req.body.filmedOn) ? req.body.filmedOn : null;
  }
  await q('UPDATE videos SET title = $2, description = $3, filmed_on = $4 WHERE id = $1', [v.id, title, description, filmedOn]);
  res.json({ ok: true });
}));

r.delete('/:id', ah(async (req, res) => {
  const v = await one('SELECT * FROM videos WHERE id = $1', [req.params.id]);
  if (!v) throw httpError(404, 'Video not found');
  if (!canEdit(req.user, v)) throw httpError(403, 'Only the uploader can delete this video');
  await q('DELETE FROM videos WHERE id = $1', [v.id]);
  fs.rmSync(videoDir(v.id), { recursive: true, force: true });
  res.json({ ok: true });
}));

r.post('/:id/retry', ah(async (req, res) => {
  const v = await one('SELECT * FROM videos WHERE id = $1', [req.params.id]);
  if (!v) throw httpError(404, 'Video not found');
  if (!canEdit(req.user, v)) throw httpError(403, 'Not allowed');
  if (v.status !== 'failed') throw httpError(400, 'Only failed videos can be retried');
  await q("UPDATE videos SET status = 'queued', progress = 0, error = NULL WHERE id = $1", [v.id]);
  enqueue(v.id);
  res.json({ ok: true });
}));

r.get('/:id/download', ah(async (req, res) => {
  const v = await one('SELECT * FROM videos WHERE id = $1', [req.params.id]);
  if (!v || v.status !== 'ready') throw httpError(404, 'Video not found');
  const file = originalPath(v.id, v.original_ext);
  if (!fs.existsSync(file)) throw httpError(404, 'The original file was not kept for this video');
  const safe = v.title.replace(/[^\w\- ]+/g, '').trim() || 'video';
  res.download(file, `${safe}.${v.original_ext}`);
}));

r.post('/:id/view', ah(async (req, res) => {
  await q("UPDATE videos SET views = views + 1 WHERE id = $1 AND status = 'ready'", [req.params.id]);
  res.json({ ok: true });
}));

r.put('/:id/like', ah(async (req, res) => {
  await q('INSERT INTO likes (video_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
  const row = await one('SELECT count(*)::int AS n FROM likes WHERE video_id = $1', [req.params.id]);
  res.json({ liked: true, likes: row.n });
}));

r.delete('/:id/like', ah(async (req, res) => {
  await q('DELETE FROM likes WHERE video_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  const row = await one('SELECT count(*)::int AS n FROM likes WHERE video_id = $1', [req.params.id]);
  res.json({ liked: false, likes: row.n });
}));

// ---- Comments ----
r.get('/:id/comments', ah(async (req, res) => {
  const { rows } = await q(
    `SELECT c.id, c.body, c.created_at, c.user_id, u.username, u.display_name, u.avatar_color
     FROM comments c JOIN users u ON u.id = c.user_id WHERE c.video_id = $1 ORDER BY c.created_at DESC`,
    [req.params.id],
  );
  res.json({
    comments: rows.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      canDelete: c.user_id === req.user.id || req.user.role === 'admin',
      author: { id: c.user_id, username: c.username, displayName: c.display_name, avatarColor: c.avatar_color },
    })),
  });
}));

r.post('/:id/comments', ah(async (req, res) => {
  const body = cleanText(req.body.body, 2000);
  if (!body) throw httpError(400, 'Comment is empty');
  const v = await one("SELECT id FROM videos WHERE id = $1 AND status = 'ready'", [req.params.id]);
  if (!v) throw httpError(404, 'Video not found');
  const c = await one('INSERT INTO comments (video_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at', [
    v.id, req.user.id, body,
  ]);
  res.status(201).json({
    comment: {
      id: c.id, body, createdAt: c.created_at, canDelete: true,
      author: { id: req.user.id, username: req.user.username, displayName: req.user.display_name, avatarColor: req.user.avatar_color },
    },
  });
}));

r.delete('/:id/comments/:commentId', ah(async (req, res) => {
  const c = await one('SELECT user_id FROM comments WHERE id = $1 AND video_id = $2', [req.params.commentId, req.params.id]);
  if (!c) throw httpError(404, 'Comment not found');
  if (c.user_id !== req.user.id && req.user.role !== 'admin') throw httpError(403, 'Not allowed');
  await q('DELETE FROM comments WHERE id = $1', [req.params.commentId]);
  res.json({ ok: true });
}));

// ---- Chunked uploads (members and admins) ----
// 1) POST /uploads {filename, size} -> {uploadId, chunkBytes}
// 2) PUT  /uploads/:id/chunks/:index  (raw bytes, in order)
// 3) POST /uploads/:id/complete {title, description, filmedOn} -> {video}
export const uploads = Router();
uploads.use(requireRole('member'));

const partPath = (id) => path.join(config.dirs.uploads, `${id}.part`);
const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|mts|m2ts|3gp|mpg|mpeg|wmv|flv|ts)$/i;

uploads.post('/', ah(async (req, res) => {
  const filename = cleanText(req.body.filename, 255);
  const size = Number(req.body.size);
  if (!filename || !VIDEO_EXT.test(filename)) throw httpError(400, 'That file type is not supported');
  if (!Number.isFinite(size) || size <= 0) throw httpError(400, 'Invalid file size');
  if (size > config.maxUploadBytes) {
    throw httpError(413, `Files can be up to ${Math.round(config.maxUploadBytes / 1024 ** 3)} GB`);
  }
  const id = randomId(16);
  await q('INSERT INTO uploads (id, user_id, filename, size) VALUES ($1, $2, $3, $4)', [id, req.user.id, filename, size]);
  fs.writeFileSync(partPath(id), '');
  res.status(201).json({ uploadId: id, chunkBytes: CHUNK_BYTES });
}));

uploads.put(
  '/:id/chunks/:index',
  express.raw({ type: '*/*', limit: CHUNK_BYTES + 1024 }),
  ah(async (req, res) => {
    const up = await one('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!up) throw httpError(404, 'Upload not found');
    const index = Number(req.params.index);
    if (index < up.next_index) return res.json({ received: Number(up.received), nextIndex: up.next_index }); // retry of a chunk we have
    if (index !== up.next_index) throw httpError(409, `Expected chunk ${up.next_index}`);
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw httpError(400, 'Empty chunk');
    if (Number(up.received) + buf.length > Number(up.size)) throw httpError(400, 'Upload is larger than declared');
    await fs.promises.appendFile(partPath(up.id), buf);
    const { rows } = await q(
      'UPDATE uploads SET received = received + $2, next_index = next_index + 1 WHERE id = $1 RETURNING received, next_index',
      [up.id, buf.length],
    );
    res.json({ received: Number(rows[0].received), nextIndex: rows[0].next_index });
  }),
);

uploads.post('/:id/complete', ah(async (req, res) => {
  const up = await one('SELECT * FROM uploads WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!up) throw httpError(404, 'Upload not found');
  if (Number(up.received) !== Number(up.size)) throw httpError(400, 'Upload is incomplete');
  const title = cleanText(req.body.title, 120) || up.filename.replace(/\.[^.]+$/, '');
  const description = cleanText(req.body.description, 5000);
  const filmedOn = /^\d{4}-\d{2}-\d{2}$/.test(req.body.filmedOn || '') ? req.body.filmedOn : null;
  const ext = (up.filename.match(VIDEO_EXT)?.[1] || 'mp4').toLowerCase();

  const id = randomId(11);
  fs.mkdirSync(videoDir(id), { recursive: true });
  await fs.promises.rename(partPath(up.id), originalPath(id, ext));
  await q(
    `INSERT INTO videos (id, user_id, title, description, original_name, original_ext, filmed_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, req.user.id, title, description, up.filename, ext, filmedOn],
  );
  await q('DELETE FROM uploads WHERE id = $1', [up.id]);
  enqueue(id);
  res.status(201).json({ video: { id, title, status: 'queued' } });
}));

uploads.delete('/:id', ah(async (req, res) => {
  await q('DELETE FROM uploads WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  fs.rmSync(partPath(req.params.id), { force: true });
  res.json({ ok: true });
}));

/** Remove abandoned uploads older than a day. */
export async function cleanupStaleUploads() {
  const { rows } = await q("DELETE FROM uploads WHERE created_at < now() - interval '1 day' RETURNING id");
  for (const u of rows) fs.rmSync(partPath(u.id), { force: true });
}

export default r;
