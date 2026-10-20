// The addresses KinCast puts in links (invites, stream settings).
// An address saved on the Server admin page wins; otherwise the .env value is used.
import { config } from './config.js';
import { getSetting, setSetting } from './db.js';

const cache = { publicUrl: null, rtmpUrl: null };

export const publicUrl = () => cache.publicUrl || config.publicUrl;
export const rtmpUrl = () => cache.rtmpUrl || config.rtmpUrl;

export async function loadSiteSettings() {
  cache.publicUrl = (await getSetting('site_url', '')) || null;
  cache.rtmpUrl = (await getSetting('rtmp_url', '')) || null;
}

export function siteView() {
  return {
    publicUrl: publicUrl(),
    rtmpUrl: rtmpUrl(),
    publicUrlFrom: cache.publicUrl ? 'admin' : 'env',
    rtmpUrlFrom: cache.rtmpUrl ? 'admin' : 'env',
    envPublicUrl: config.publicUrl,
    envRtmpUrl: config.rtmpUrl,
  };
}

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** "kincast.vpn.example.net", "https://kincast.vpn.example.net/" → "https://kincast.vpn.example.net" */
export function normalizeSiteUrl(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  if (!/^https?:\/\//.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!HOST.test(u.hostname) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) return null;
  if (u.pathname !== '/' || u.search || u.hash) return null;
  return `${u.protocol}//${u.host}`;
}

/** "live.example.net", "203.0.113.5", "rtmp://live.example.net:1935/live" → "rtmp://live.example.net:1935/live" */
export function normalizeRtmpUrl(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  if (!/^rtmps?:\/\//.test(s)) s = `rtmp://${s}`;
  let u;
  try { u = new URL(s.replace(/^rtmp/, 'http')); } catch { return null; }
  if (!HOST.test(u.hostname) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) return null;
  const scheme = s.startsWith('rtmps') ? 'rtmps' : 'rtmp';
  const port = u.port || (scheme === 'rtmps' ? '443' : '1935');
  const app = u.pathname.replace(/\/+$/, '') || '/live';
  return `${scheme}://${u.hostname}:${port}${app}`;
}

/** Save new addresses; empty strings go back to the .env values. */
export async function saveSiteSettings({ siteUrl, rtmpUrl: rtmp }) {
  if (siteUrl !== undefined) await setSetting('site_url', siteUrl);
  if (rtmp !== undefined) await setSetting('rtmp_url', rtmp);
  await loadSiteSettings();
}
