import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, one, getSetting, setSetting, pool } from '../db.js';
import { setSession, clearSession, USER_COLUMNS, requireAuth } from '../auth.js';
import { ah, httpError, cleanText, randomId, pickColor, slugUsername } from '../util.js';
import { config } from '../config.js';

const r = Router();

// Simple in-memory login throttle: 10 failures per IP per 15 minutes.
const failures = new Map();
function throttle(ip) {
  const now = Date.now();
  const rec = failures.get(ip);
  if (rec && now - rec.first < 15 * 60 * 1000 && rec.count >= 10) {
    throw httpError(429, 'Too many attempts. Try again in a few minutes.');
  }
}
function fail(ip) {
  const now = Date.now();
  const rec = failures.get(ip);
  if (!rec || now - rec.first > 15 * 60 * 1000) failures.set(ip, { first: now, count: 1 });
  else rec.count++;
}

function validateAccount(body) {
  const displayName = cleanText(body.displayName, 60);
  const email = cleanText(body.email, 200).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!displayName) throw httpError(400, 'Name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Enter a valid email');
  if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
  const explicit = !!body.username;
  let username = slugUsername(body.username || displayName);
  if (username.length < 3) username = slugUsername(email.split('@')[0]);
  if (username.length < 3) username = `member${randomId(4).toLowerCase()}`;
  return { displayName, email, username, password, explicit };
}

async function createUser(client, { displayName, email, username, password, explicit }, role) {
  if ((await client.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount) {
    throw httpError(409, 'An account with that email already exists');
  }
  // Usernames are channel URLs (/c/mom). If a generated one is taken, add a number.
  const base = username;
  for (let n = 2; (await client.query('SELECT 1 FROM users WHERE username = $1', [username])).rowCount; n++) {
    if (explicit) throw httpError(409, 'That username is already taken');
    username = `${base.slice(0, 21)}${n}`;
  }
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await client.query(
    `INSERT INTO users (username, email, display_name, password_hash, role, avatar_color, stream_key, stream_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${USER_COLUMNS}`,
    [username, email, displayName, hash, role, pickColor(username), `kc_${randomId(28)}`, randomId(16)],
  );
  return rows[0];
}

export function serializeMe(u, familyName) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    avatarColor: u.avatar_color,
    familyName,
  };
}

r.get('/setup', ah(async (_req, res) => {
  const row = await one('SELECT count(*)::int AS n FROM users');
  res.json({ needsSetup: row.n === 0, familyName: await getSetting('family_name', 'KinCast') });
}));

r.post('/setup', ah(async (req, res) => {
  const familyName = cleanText(req.body.familyName, 60) || 'Our Family';
  const account = validateAccount(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
    if (rows[0].n > 0) throw httpError(409, 'Setup has already been completed');
    const user = await createUser(client, account, 'admin');
    await client.query('COMMIT');
    await setSetting('family_name', familyName);
    setSession(res, user.id);
    res.status(201).json({ user: serializeMe(user, familyName) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

r.post('/auth/login', ah(async (req, res) => {
  throttle(req.ip);
  const login = cleanText(req.body.email, 200).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const row = await one('SELECT id, password_hash FROM users WHERE email = $1 OR username = $1', [login]);
  const ok = row && (await bcrypt.compare(password, row.password_hash));
  if (!ok) {
    fail(req.ip);
    throw httpError(401, 'Wrong email or password');
  }
  failures.delete(req.ip);
  setSession(res, row.id);
  const user = await one(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [row.id]);
  res.json({ user: serializeMe(user, await getSetting('family_name', 'KinCast')) });
}));

r.post('/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.get('/auth/me', ah(async (req, res) => {
  res.json({ user: req.user ? serializeMe(req.user, await getSetting('family_name', 'KinCast')) : null });
}));

r.get('/invites/:code', ah(async (req, res) => {
  const inv = await one(
    'SELECT role FROM invites WHERE code = $1 AND used_at IS NULL AND expires_at > now()',
    [req.params.code],
  );
  if (!inv) throw httpError(404, 'This invite link is invalid or has expired');
  res.json({ role: inv.role, familyName: await getSetting('family_name', 'KinCast') });
}));

r.post('/auth/register', ah(async (req, res) => {
  const code = cleanText(req.body.code, 64);
  const account = validateAccount(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM invites WHERE code = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE',
      [code],
    );
    const inv = rows[0];
    if (!inv) throw httpError(400, 'This invite link is invalid or has expired');
    const user = await createUser(client, account, inv.role);
    await client.query('UPDATE invites SET used_by = $2, used_at = now() WHERE code = $1', [code, user.id]);
    await client.query('COMMIT');
    setSession(res, user.id);
    res.status(201).json({ user: serializeMe(user, await getSetting('family_name', 'KinCast')) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

// ---- Own profile ----
r.patch('/me', requireAuth, ah(async (req, res) => {
  const updates = [];
  const vals = [req.user.id];
  if (req.body.displayName !== undefined) {
    const v = cleanText(req.body.displayName, 60);
    if (!v) throw httpError(400, 'Name is required');
    vals.push(v);
    updates.push(`display_name = $${vals.length}`);
  }
  if (req.body.avatarColor !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(req.body.avatarColor)) throw httpError(400, 'Invalid color');
    vals.push(req.body.avatarColor);
    updates.push(`avatar_color = $${vals.length}`);
  }
  if (req.body.newPassword !== undefined) {
    const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(String(req.body.currentPassword || ''), row.password_hash))) {
      throw httpError(400, 'Current password is incorrect');
    }
    if (String(req.body.newPassword).length < 8) throw httpError(400, 'Password must be at least 8 characters');
    vals.push(await bcrypt.hash(String(req.body.newPassword), 12));
    updates.push(`password_hash = $${vals.length}`);
  }
  if (updates.length) await q(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, vals);
  const user = await one(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.user.id]);
  res.json({ user: serializeMe(user, await getSetting('family_name', 'KinCast')) });
}));

// Info the client needs to configure itself.
r.get('/config', (_req, res) => {
  res.json({ maxUploadBytes: config.maxUploadBytes, chunkBytes: CHUNK_BYTES });
});

// Upload chunk size. Must stay under any proxy's request-size cap (Cloudflare: 100 MB).
export const CHUNK_BYTES = Math.min(95, Math.max(1, Number(process.env.UPLOAD_CHUNK_MB) || 32)) * 1024 * 1024;
export default r;
