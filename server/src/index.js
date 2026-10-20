import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrate } from './db.js';
import { loadUser, requireAuth } from './auth.js';
import { resumeQueue } from './transcode.js';
import authRoutes from './routes/auth.js';
import familyRoutes from './routes/family.js';
import videoRoutes, { uploads, cleanupStaleUploads } from './routes/videos.js';
import liveRoutes, { rtmp, sweepStaleLive } from './routes/live.js';
import subscriptionRoutes, { pruneNotifications } from './routes/subscriptions.js';
import adminRoutes, { syncNetbirdConfig } from './routes/admin.js';

const app = express();
app.set('trust proxy', true); // behind Caddy / Cloudflare
app.disable('x-powered-by');

// RTMP callbacks come from nginx on the internal network, no session involved.
app.use('/internal/rtmp', rtmp);

app.use(cookieParser());
app.use(loadUser);
app.use('/api', express.json({ limit: '1mb' }));

app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', authRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/uploads', uploads);
app.use('/api/videos', videoRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Media (signed-in family only) ----
const noDotfiles = { dotfiles: 'deny', index: false };
app.use(
  '/media',
  requireAuth,
  // Originals are only served through /api/videos/:id/download.
  (req, res, next) => (/\/original\./.test(req.path) ? res.status(404).end() : next()),
  express.static(config.dirs.media, {
    ...noDotfiles,
    maxAge: '7d',
    setHeaders(res, file) {
      if (file.endsWith('.m3u8')) res.set('Content-Type', 'application/vnd.apple.mpegurl');
    },
  }),
);
app.use('/hls', requireAuth, express.static(config.dirs.hls, {
  ...noDotfiles,
  setHeaders(res, file) {
    if (file.endsWith('.m3u8')) {
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'no-cache, no-store');
    } else {
      res.set('Cache-Control', 'public, max-age=60');
    }
  },
}));

app.use(['/media', '/hls'], (_req, res) => res.status(404).end());

// ---- Web app ----
if (fs.existsSync(path.join(config.webDir, 'index.html'))) {
  app.use(express.static(config.webDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api|media|hls|internal).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(config.webDir, 'index.html'));
  });
}

// ---- Errors ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

await migrate();
await sweepStaleLive();
await resumeQueue();
await cleanupStaleUploads();
await syncNetbirdConfig();
setInterval(() => sweepStaleLive().catch((e) => console.error('[live] sweep failed', e)), 60000);
setInterval(() => cleanupStaleUploads().catch(() => {}), 60 * 60 * 1000);
setInterval(() => pruneNotifications().catch(() => {}), 24 * 60 * 60 * 1000);

app.listen(config.port, () => console.log(`[kincast] listening on :${config.port}`));
