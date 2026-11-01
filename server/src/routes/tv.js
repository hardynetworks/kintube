// Signing in TVs (the Roku channel) without typing a password on a remote:
// 1) The TV asks for a code:   POST /api/tv/pair {name}       -> {code, pollToken, verifyUrl, ...}
// 2) Someone signed in enters it at /tv:   POST /api/tv/approve {code}
// 3) The TV polls:             POST /api/tv/pair/poll {pollToken} -> 202 waiting | 200 {token, user}
// The token is sent as "Authorization: Bearer ..." and works until the TV is removed.
import { Router } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { q, one, getSetting } from '../db.js';
import { requireAuth, tvToken, USER_COLUMNS } from '../auth.js';
import { ah, httpError, cleanText, randomId } from '../util.js';
import { publicUrl } from '../site.js';
import { serializeMe } from './auth.js';

const r = Router();

const PAIR_MINUTES = 10;
const POLL_SECONDS = 3;
// Codes avoid look-alike characters (no 0/O, 1/I/L) so they're easy to read off a TV.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** "abcd efgh", "ABCD-EFGH", "abcdefgh" → "ABCD-EFGH" */
export function normalizeCode(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

// Throttle code requests: 20 per IP per 10 minutes.
const requests = new Map();
function throttle(ip) {
  const now = Date.now();
  const rec = requests.get(ip);
  if (!rec || now - rec.first > 10 * 60 * 1000) {
    requests.set(ip, { first: now, count: 1 });
    return;
  }
  if (++rec.count > 20) throw httpError(429, 'Too many requests. Try again in a few minutes.');
}

r.post('/pair', ah(async (req, res) => {
  throttle(req.ip);
  await q('DELETE FROM tv_pairings WHERE expires_at < now()');
  const name = cleanText(req.body?.name, 60) || 'TV';
  const pollToken = randomId(40);
  let code;
  for (let attempt = 0; ; attempt++) {
    code = newCode();
    const row = await one(
      `INSERT INTO tv_pairings (code, poll_hash, device_name, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4)) ON CONFLICT (code) DO NOTHING RETURNING code`,
      [code, sha256(pollToken), name, PAIR_MINUTES],
    );
    if (row) break;
    if (attempt > 5) throw httpError(503, 'Try again');
  }
  const site = publicUrl();
  res.status(201).json({
    code,
    pollToken,
    verifyUrl: `${site}/tv`,
    // Scanning this opens the approve page with the code filled in.
    qrUrl: `/api/tv/pair/${code}/qr.png`,
    verifyUrlShort: `${site.replace(/^https?:\/\//, '')}/tv`,
    expiresIn: PAIR_MINUTES * 60,
    interval: POLL_SECONDS,
    familyName: await getSetting('family_name', 'KinCast'),
  });
}));

// The QR code the TV shows: a link to /tv?code=... on this site.
// Only for codes that are waiting, and it holds nothing secret (approving needs a sign-in).
r.get('/pair/:code/qr.png', ah(async (req, res) => {
  const code = normalizeCode(req.params.code);
  const p = code && (await one('SELECT 1 FROM tv_pairings WHERE code = $1 AND expires_at > now() AND device_id IS NULL', [code]));
  if (!p) throw httpError(404, 'Code expired');
  const png = await QRCode.toBuffer(`${publicUrl()}/tv?code=${code}`, {
    type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 480,
    color: { dark: '#0f0f0fff', light: '#ffffffff' },
  });
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
  res.send(png);
}));

r.post('/pair/poll', ah(async (req, res) => {
  const token = typeof req.body?.pollToken === 'string' ? req.body.pollToken : '';
  const p = token && (await one('SELECT * FROM tv_pairings WHERE poll_hash = $1', [sha256(token)]));
  if (!p || new Date(p.expires_at) < new Date()) {
    if (p) await q('DELETE FROM tv_pairings WHERE code = $1', [p.code]);
    throw httpError(410, 'This code expired. Get a new one.');
  }
  if (!p.device_id) return res.status(202).json({ status: 'waiting', interval: POLL_SECONDS });
  // Approved: hand over the token once.
  await q('DELETE FROM tv_pairings WHERE code = $1', [p.code]);
  const user = await one(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [p.user_id]);
  if (!user) throw httpError(410, 'That account no longer exists');
  res.json({
    status: 'approved',
    token: tvToken(user.id, p.device_id),
    deviceId: p.device_id,
    user: serializeMe(user, await getSetting('family_name', 'KinCast')),
  });
}));

// ---- Signed in (browser) ----
r.get('/pair/:code', requireAuth, ah(async (req, res) => {
  const code = normalizeCode(req.params.code);
  const p = code && (await one('SELECT device_name, device_id FROM tv_pairings WHERE code = $1 AND expires_at > now()', [code]));
  if (!p) throw httpError(404, "That code isn't valid. Check the TV, or get a new code there.");
  res.json({ code, deviceName: p.device_name, approved: !!p.device_id });
}));

r.post('/approve', requireAuth, ah(async (req, res) => {
  if (req.tvDevice) throw httpError(403, 'Approve TVs from a phone or computer');
  const code = normalizeCode(req.body?.code);
  if (!code) throw httpError(400, 'Enter the 8-character code shown on the TV');
  const name = cleanText(req.body?.name, 60);
  const id = randomId(16);
  const p = await one(
    `UPDATE tv_pairings SET user_id = $2, device_id = $3, device_name = COALESCE(NULLIF($4, ''), device_name)
     WHERE code = $1 AND expires_at > now() AND device_id IS NULL RETURNING device_name`,
    [code, req.user.id, id, name],
  );
  if (!p) throw httpError(404, "That code isn't valid. Check the TV, or get a new code there.");
  await q('INSERT INTO tv_devices (id, user_id, name) VALUES ($1, $2, $3)', [id, req.user.id, p.device_name]);
  res.status(201).json({ device: { id, name: p.device_name } });
}));

r.get('/devices', requireAuth, ah(async (req, res) => {
  const { rows } = await q(
    'SELECT id, name, created_at, last_seen_at FROM tv_devices WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user.id],
  );
  res.json({
    devices: rows.map((d) => ({
      id: d.id, name: d.name, createdAt: d.created_at, lastSeenAt: d.last_seen_at, current: d.id === req.tvDevice,
    })),
  });
}));

// Remove a TV (signs it out). A TV may also remove itself ("Sign out" on the TV).
r.delete('/devices/:id', requireAuth, ah(async (req, res) => {
  const { rowCount } = await q('DELETE FROM tv_devices WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw httpError(404, 'TV not found');
  res.json({ ok: true });
}));

export default r;
