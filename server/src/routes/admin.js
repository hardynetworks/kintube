// Server admin: overview + NetBird client settings (admins only).
import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { q, one, getSetting, setSetting } from '../db.js';
import { requireRole } from '../auth.js';
import { ah, httpError, cleanText } from '../util.js';
import { config } from '../config.js';
import { siteView, normalizeSiteUrl, normalizeRtmpUrl, saveSiteSettings } from '../site.js';

const r = Router();
r.use(requireRole('admin'));

const NB_CONF = () => path.join(config.dirs.netbird, 'netbird.json');
const NB_STATUS = () => path.join(config.dirs.netbird, 'netbird-status.json');
const DEFAULT_MGMT = 'https://api.netbird.io';
const startedAt = Date.now();
const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

let ffmpegVersion = null;
execFile('ffmpeg', ['-version'], (err, out) => {
  ffmpegVersion = err ? null : (out.match(/ffmpeg version (\S+)/)?.[1] || 'installed');
});

async function netbirdSettings() {
  return {
    enabled: (await getSetting('netbird_enabled', 'false')) === 'true',
    managementUrl: await getSetting('netbird_management_url', ''),
    setupKey: await getSetting('netbird_setup_key', ''),
    hostname: await getSetting('netbird_hostname', 'kintube'),
    nonce: await getSetting('netbird_nonce', ''),
  };
}

/** Write the settings where the NetBird sidecar picks them up (it polls every few seconds). */
export async function syncNetbirdConfig() {
  const s = await netbirdSettings();
  if (!s.managementUrl && !s.enabled) return; // never configured
  const file = NB_CONF();
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[netbird] could not write settings for the sidecar:', err.message);
  }
}

function readStatus() {
  try {
    const st = fs.statSync(NB_STATUS());
    const data = JSON.parse(fs.readFileSync(NB_STATUS(), 'utf8'));
    return { data, ageSec: Math.round((Date.now() - st.mtimeMs) / 1000) };
  } catch {
    return null;
  }
}

async function netbirdView() {
  const s = await netbirdSettings();
  const st = readStatus();
  const nb = st?.data?.netbird || {};
  const ctl = st?.data?.controller || {};
  // The sidecar rewrites its status every ~5s (at most ~40s apart while registering);
  // older than 60s means it isn't running or is stuck.
  const sidecar = !st ? 'missing' : st.ageSec > 60 ? 'stopped' : 'running';
  let state;
  if (sidecar !== 'running') state = 'no-client';
  else if (!s.enabled) state = 'disabled';
  else if (ctl.state === 'error') state = 'error';
  else if (nb.management?.connected) state = 'connected';
  else state = 'connecting';
  return {
    settings: {
      enabled: s.enabled,
      managementUrl: s.managementUrl || DEFAULT_MGMT,
      hostname: s.hostname,
      setupKeySet: !!s.setupKey,
      setupKeyHint: s.setupKey ? `••••${s.setupKey.slice(-4)}` : null,
    },
    status: {
      state,
      sidecar,
      lastError: ctl.lastError || nb.management?.error || '',
      ip: (nb.netbirdIp || '').split('/')[0] || null,
      fqdn: nb.fqdn || null,
      managementConnected: !!nb.management?.connected,
      signalConnected: !!nb.signal?.connected,
      peers: nb.peers ? { connected: nb.peers.connected ?? 0, total: nb.peers.total ?? 0 } : null,
      version: nb.daemonVersion || null,
      forwardPort: ctl.forwardPort || 3000,
      updatedAt: ctl.updatedAt || null,
    },
  };
}

async function diskUsage(dir) {
  try {
    const s = await fs.promises.statfs(dir);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

r.get('/server', ah(async (_req, res) => {
  const [counts, disk, netbird] = await Promise.all([
    one(`SELECT
      (SELECT count(*)::int FROM users) AS members,
      (SELECT count(*)::int FROM videos WHERE status = 'ready') AS videos,
      (SELECT coalesce(sum(duration), 0)::float FROM videos WHERE status = 'ready') AS seconds,
      (SELECT count(*)::int FROM videos WHERE status IN ('queued', 'processing')) AS processing,
      (SELECT count(*)::int FROM videos WHERE status = 'failed') AS failed,
      (SELECT count(*)::int FROM users WHERE is_live) AS live,
      (SELECT count(*)::int FROM comments) AS comments,
      (SELECT count(*)::int FROM subscriptions) AS subscriptions`),
    diskUsage(config.dirs.media),
    netbirdView(),
  ]);
  res.json({
    server: {
      version: pkg.version,
      node: process.versions.node,
      ffmpeg: ffmpegVersion,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memory: { total: os.totalmem(), free: os.freemem() },
      load: os.loadavg()[0],
      site: siteView(),
      renditions: config.renditions,
      maxUploadBytes: config.maxUploadBytes,
      disk,
    },
    counts,
    netbird,
  });
}));

r.get('/netbird', ah(async (_req, res) => res.json(await netbirdView())));

r.put('/netbird', ah(async (req, res) => {
  const body = req.body || {};
  const current = await netbirdSettings();
  const managementUrl = cleanText(body.managementUrl ?? current.managementUrl, 300).replace(/\/+$/, '') || DEFAULT_MGMT;
  if (!/^https?:\/\/[^\s/]+(:\d+)?(\/\S*)?$/.test(managementUrl)) throw httpError(400, 'Management URL must look like https://netbird.example.com');
  const hostname = cleanText(body.hostname ?? current.hostname, 63).toLowerCase() || 'kintube';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(hostname)) throw httpError(400, 'Hostname can only use letters, numbers and dashes');
  let setupKey = current.setupKey;
  if (typeof body.setupKey === 'string' && body.setupKey.trim()) setupKey = body.setupKey.trim();
  if (body.clearSetupKey) setupKey = '';
  const enabled = body.enabled === undefined ? current.enabled : !!body.enabled;
  if (enabled && !setupKey) throw httpError(400, 'Add a setup key to connect');

  await setSetting('netbird_enabled', enabled);
  await setSetting('netbird_management_url', managementUrl);
  await setSetting('netbird_hostname', hostname);
  await setSetting('netbird_setup_key', setupKey);
  await syncNetbirdConfig();
  res.json(await netbirdView());
}));

// Site + streaming addresses used in links. Empty value = use the .env setting.
r.put('/site', ah(async (req, res) => {
  const body = req.body || {};
  const update = {};
  if (body.siteUrl !== undefined) {
    const v = normalizeSiteUrl(body.siteUrl);
    if (v === null) throw httpError(400, 'Enter a domain like kincast.vpn.hardynetworks.net');
    update.siteUrl = v;
  }
  if (body.rtmpUrl !== undefined) {
    const v = normalizeRtmpUrl(body.rtmpUrl);
    if (v === null) throw httpError(400, 'Enter a streaming host like live.example.com or the server IP');
    update.rtmpUrl = v;
  }
  await saveSiteSettings(update);
  res.json({ site: siteView() });
}));

r.post('/netbird/reconnect', ah(async (_req, res) => {
  if ((await getSetting('netbird_enabled', 'false')) !== 'true') throw httpError(400, 'NetBird is turned off');
  await setSetting('netbird_nonce', crypto.randomBytes(6).toString('hex'));
  await syncNetbirdConfig();
  res.json(await netbirdView());
}));

export default r;
