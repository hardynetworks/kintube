import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one } from './db.js';
import { httpError } from './util.js';

const COOKIE = 'kc_session';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export function setSession(res, userId) {
  const token = jwt.sign({ uid: userId }, config.sessionSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export const USER_COLUMNS =
  'id, username, email, display_name, role, avatar_color, stream_id, stream_title, is_live, live_started_at, save_streams, created_at';

/** A TV's token: signed like a session, and valid while its tv_devices row exists. */
export function tvToken(userId, deviceId) {
  return jwt.sign({ uid: userId, tv: deviceId }, config.sessionSecret);
}

const seen = new Map(); // device id -> last time last_seen_at was written

/**
 * Attach req.user if a valid session cookie (browsers) or bearer token (TVs)
 * is present. Never rejects.
 */
export async function loadUser(req, _res, next) {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '')?.[1];
  const token = bearer || req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const claims = jwt.verify(token, config.sessionSecret);
    if (bearer) {
      // Only TV tokens are accepted as bearer tokens, and only while the TV is connected.
      if (!claims.tv) throw new Error('not a TV token');
      const dev = await one('SELECT 1 FROM tv_devices WHERE id = $1 AND user_id = $2', [claims.tv, claims.uid]);
      if (!dev) throw new Error('TV removed');
      req.tvDevice = claims.tv;
      const last = seen.get(claims.tv) || 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        seen.set(claims.tv, Date.now());
        one('UPDATE tv_devices SET last_seen_at = now() WHERE id = $1', [claims.tv]).catch(() => {});
      }
    } else if (claims.tv) {
      throw new Error('TV tokens are not cookies');
    }
    req.user = await one(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [claims.uid]);
    // A TV only watches: whoever paired it, it can't upload, go live or manage the family.
    if (req.tvDevice && req.user) req.user = { ...req.user, role: 'viewer' };
  } catch {
    req.user = null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Please sign in'));
  next();
}

const RANK = { viewer: 0, member: 1, admin: 2 };

export const requireRole = (role) => (req, _res, next) => {
  if (!req.user) return next(httpError(401, 'Please sign in'));
  if (RANK[req.user.role] < RANK[role]) return next(httpError(403, 'You do not have permission to do that'));
  next();
};

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    avatarColor: u.avatar_color,
    isLive: u.is_live,
  };
}
