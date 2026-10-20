import { Router } from 'express';
import fs from 'node:fs';
import { q, one, getSetting, setSetting } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { ah, httpError, cleanText, randomId } from '../util.js';
import { config } from '../config.js';
import { videoDir } from '../transcode.js';

const r = Router();
r.use(requireAuth);

// Everyone in the family, with channel stats (powers the sidebar + family page).
r.get('/members', ah(async (_req, res) => {
  const { rows } = await q(`
    SELECT u.id, u.username, u.display_name, u.role, u.avatar_color, u.is_live, u.created_at,
           count(v.id) FILTER (WHERE v.status = 'ready')::int AS video_count
    FROM users u LEFT JOIN videos v ON v.user_id = u.id
    GROUP BY u.id ORDER BY u.is_live DESC, u.display_name`);
  res.json({
    members: rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      role: u.role,
      avatarColor: u.avatar_color,
      isLive: u.is_live,
      videoCount: u.video_count,
      joinedAt: u.created_at,
    })),
  });
}));

r.get('/settings', ah(async (_req, res) => {
  res.json({ familyName: await getSetting('family_name', 'KinCast'), rtmpUrl: config.rtmpUrl });
}));

r.patch('/settings', requireRole('admin'), ah(async (req, res) => {
  const name = cleanText(req.body.familyName, 60);
  if (!name) throw httpError(400, 'Family name is required');
  await setSetting('family_name', name);
  res.json({ familyName: name });
}));

// ---- Admin: members ----
r.patch('/members/:id', requireRole('admin'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const role = req.body.role;
  if (!['admin', 'member', 'viewer'].includes(role)) throw httpError(400, 'Invalid role');
  if (id === req.user.id && role !== 'admin') {
    const admins = await one("SELECT count(*)::int AS n FROM users WHERE role = 'admin'");
    if (admins.n <= 1) throw httpError(400, 'You are the only admin — promote someone else first');
  }
  const { rowCount } = await q('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
  if (!rowCount) throw httpError(404, 'Member not found');
  res.json({ ok: true });
}));

r.delete('/members/:id', requireRole('admin'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw httpError(400, "You can't remove yourself");
  const { rows } = await q('SELECT id FROM videos WHERE user_id = $1', [id]);
  const { rowCount } = await q('DELETE FROM users WHERE id = $1', [id]);
  if (!rowCount) throw httpError(404, 'Member not found');
  for (const v of rows) fs.rmSync(videoDir(v.id), { recursive: true, force: true });
  res.json({ ok: true });
}));

// ---- Admin: invites ----
r.get('/invites', requireRole('admin'), ah(async (_req, res) => {
  const { rows } = await q(`
    SELECT i.code, i.role, i.expires_at, i.used_at, i.created_at, u.display_name AS used_by_name
    FROM invites i LEFT JOIN users u ON u.id = i.used_by
    WHERE i.used_at IS NOT NULL OR i.expires_at > now()
    ORDER BY i.created_at DESC LIMIT 50`);
  res.json({
    invites: rows.map((i) => ({
      code: i.code,
      role: i.role,
      expiresAt: i.expires_at,
      usedAt: i.used_at,
      usedByName: i.used_by_name,
      url: `${config.publicUrl}/join/${i.code}`,
    })),
  });
}));

r.post('/invites', requireRole('admin'), ah(async (req, res) => {
  const role = ['admin', 'member', 'viewer'].includes(req.body.role) ? req.body.role : 'member';
  const days = Math.min(30, Math.max(1, Number(req.body.days) || 7));
  const code = randomId(20);
  await q(
    "INSERT INTO invites (code, role, created_by, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)",
    [code, role, req.user.id, String(days)],
  );
  res.status(201).json({ code, role, url: `${config.publicUrl}/join/${code}` });
}));

r.delete('/invites/:code', requireRole('admin'), ah(async (req, res) => {
  await q('DELETE FROM invites WHERE code = $1 AND used_at IS NULL', [req.params.code]);
  res.json({ ok: true });
}));

export default r;
