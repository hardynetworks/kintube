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

/** Attach req.user if a valid session cookie is present. Never rejects. */
export async function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { uid } = jwt.verify(token, config.sessionSecret);
    req.user = await one(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [uid]);
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
