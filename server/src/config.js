import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const env = process.env;

const DATA_DIR = path.resolve(env.DATA_DIR || './data');

function secret() {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  // Dev fallback: persist a random secret so sessions survive restarts.
  const file = path.join(DATA_DIR, '.session-secret');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  console.warn('[config] SESSION_SECRET not set (or < 32 chars); using generated secret in', file);
  return fs.readFileSync(file, 'utf8').trim();
}

export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://kincast:kincast@localhost:5432/kincast',
  sessionSecret: secret(),
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : env.NODE_ENV === 'production',
  publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  // What family members type into OBS, e.g. rtmp://live.example.com/live
  rtmpUrl: env.RTMP_PUBLIC_URL || 'rtmp://localhost:1935/live',
  rtmpCallbackSecret: env.RTMP_CALLBACK_SECRET || '',
  maxUploadBytes: Number(env.MAX_UPLOAD_GB || 20) * 1024 ** 3,
  renditions: (env.TRANSCODE_RENDITIONS || '1080,720,360').split(',').map(Number).filter(Boolean).sort((a, b) => b - a),
  x264Preset: env.X264_PRESET || 'veryfast',
  keepOriginals: (env.KEEP_ORIGINALS || 'true') === 'true',
  minRecordingSeconds: Number(env.MIN_RECORDING_SECONDS || 15),
  webDir: path.resolve(env.WEB_DIR || './public'),
  dirs: {
    data: DATA_DIR,
    media: path.join(DATA_DIR, 'media'),       // processed VOD: media/<videoId>/...
    uploads: path.join(DATA_DIR, 'uploads'),   // chunked uploads in progress
    hls: path.resolve(env.HLS_DIR || path.join(DATA_DIR, 'hls')),               // written by nginx-rtmp
    recordings: path.resolve(env.RECORDINGS_DIR || path.join(DATA_DIR, 'recordings')), // written by nginx-rtmp
  },
};

for (const dir of Object.values(config.dirs)) fs.mkdirSync(dir, { recursive: true });
