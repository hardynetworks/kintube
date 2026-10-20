// Turns an original video file into adaptive HLS (several qualities) + a thumbnail.
// Jobs run one at a time; the queue is rebuilt from the database on startup.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { q, one } from './db.js';

const BITRATES = { 2160: 14000, 1440: 9000, 1080: 5000, 720: 2800, 480: 1400, 360: 800, 240: 400 };

export const videoDir = (id) => path.join(config.dirs.media, id);
export const originalPath = (id, ext) => path.join(videoDir(id), `original.${ext}`);

const queue = [];
let running = false;

export function enqueue(videoId) {
  if (!queue.includes(videoId)) queue.push(videoId);
  setImmediate(runNext);
}

export async function resumeQueue() {
  const { rows } = await q(
    "SELECT id FROM videos WHERE status IN ('queued', 'processing') ORDER BY created_at",
  );
  for (const r of rows) enqueue(r.id);
  if (rows.length) console.log(`[transcode] resumed ${rows.length} job(s)`);
}

async function runNext() {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  running = true;
  try {
    await processVideo(id);
  } catch (err) {
    console.error(`[transcode] ${id} failed:`, err.message);
    await q("UPDATE videos SET status = 'failed', error = $2 WHERE id = $1", [id, err.message.slice(0, 500)]).catch(() => {});
  } finally {
    running = false;
    setImmediate(runNext);
  }
}

function run(cmd, args, { onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d;
      onStdout?.(d.toString());
    });
    p.stderr.on('data', (d) => {
      err += d;
      if (err.length > 20000) err = err.slice(-10000);
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}

export async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]);
  const info = JSON.parse(out);
  const v = info.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error('No video track found in file');
  const hasAudio = info.streams.some((s) => s.codec_type === 'audio');
  let width = v.width;
  let height = v.height;
  // Phones store portrait video as landscape + a rotation flag; ffmpeg auto-rotates, so report display size.
  const rotation = Math.abs(
    Number(v.tags?.rotate || v.side_data_list?.find((s) => s.rotation !== undefined)?.rotation || 0),
  ) % 180;
  if (rotation === 90) [width, height] = [height, width];
  const duration = Number(info.format?.duration || v.duration || 0);
  const creation = info.format?.tags?.creation_time || v.tags?.creation_time || null;
  return { width, height, hasAudio, duration, creation };
}

function ladderFor(width, height) {
  const short = Math.min(width, height);
  let rungs = config.renditions.filter((r) => r <= short);
  if (!rungs.length) rungs = [Math.max(2, short - (short % 2))];
  return rungs.map((r) => {
    // Scale so the *short* side equals r, keeping aspect (works for portrait and landscape).
    const landscape = width >= height;
    const w = landscape ? Math.round((width * r) / height / 2) * 2 : r;
    const h = landscape ? r : Math.round((height * r) / width / 2) * 2;
    const kbps = BITRATES[r] || Math.round(r * 5);
    return { r, w, h, kbps };
  });
}

async function processVideo(id) {
  const video = await one('SELECT * FROM videos WHERE id = $1', [id]);
  if (!video) return;
  const dir = videoDir(id);
  const input = originalPath(id, video.original_ext);
  if (!fs.existsSync(input)) throw new Error('Original file is missing');

  await q("UPDATE videos SET status = 'processing', progress = 0, error = NULL WHERE id = $1", [id]);
  const meta = await probe(input);
  const filmedOn = video.filmed_on || (meta.creation ? meta.creation.slice(0, 10) : null);
  await q('UPDATE videos SET duration = $2, width = $3, height = $4, filmed_on = $5 WHERE id = $1', [
    id, meta.duration, meta.width, meta.height, filmedOn,
  ]);

  // Thumbnail from ~10% in (skips black intro frames).
  const at = Math.max(0, Math.min(meta.duration * 0.1, meta.duration - 0.5)).toFixed(2);
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', at, '-i', input, '-frames:v', '1',
    '-vf', "scale='if(gt(iw,ih),min(960,iw),-2)':'if(gt(iw,ih),-2,min(960,ih))'", '-q:v', '3',
    path.join(dir, 'thumb.jpg')]).catch((e) => console.warn(`[transcode] thumbnail failed for ${id}:`, e.message));

  // Clean previous partial output.
  const hlsDir = path.join(dir, 'hls');
  fs.rmSync(hlsDir, { recursive: true, force: true });
  fs.mkdirSync(hlsDir, { recursive: true });

  const rungs = ladderFor(meta.width, meta.height);
  const split = `[0:v]split=${rungs.length}${rungs.map((_, i) => `[s${i}]`).join('')}`;
  const scales = rungs.map((g, i) => `[s${i}]scale=${g.w}:${g.h}:flags=bicubic,format=yuv420p[v${i}]`);
  const args = ['-y', '-v', 'error', '-nostats', '-progress', 'pipe:1', '-i', input,
    '-filter_complex', [split, ...scales].join(';')];
  rungs.forEach((g, i) => {
    args.push('-map', `[v${i}]`);
    if (meta.hasAudio) args.push('-map', '0:a:0');
    args.push(`-c:v:${i}`, 'libx264', `-b:v:${i}`, `${g.kbps}k`, `-maxrate:v:${i}`, `${Math.round(g.kbps * 1.07)}k`,
      `-bufsize:v:${i}`, `${Math.round(g.kbps * 1.5)}k`);
  });
  args.push('-preset', config.x264Preset, '-profile:v', 'high', '-sc_threshold', '0',
    '-force_key_frames', 'expr:gte(t,n_forced*4)');
  if (meta.hasAudio) args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
  const varMap = rungs.map((g, i) => (meta.hasAudio ? `v:${i},a:${i},name:${g.r}p` : `v:${i},name:${g.r}p`)).join(' ');
  args.push('-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', path.join(hlsDir, '%v', 'seg_%05d.ts'),
    '-master_pl_name', 'master.m3u8', '-var_stream_map', varMap, path.join(hlsDir, '%v', 'index.m3u8'));

  let lastPct = -1;
  let lastWrite = 0;
  await run('ffmpeg', args, {
    onStdout: (chunk) => {
      const m = chunk.match(/out_time_us=(\d+)/g);
      if (!m || !meta.duration) return;
      const us = Number(m[m.length - 1].split('=')[1]);
      const pct = Math.min(99, Math.floor((us / 1e6 / meta.duration) * 100));
      const now = Date.now();
      if (pct !== lastPct && now - lastWrite > 1500) {
        lastPct = pct;
        lastWrite = now;
        q('UPDATE videos SET progress = $2 WHERE id = $1', [id, pct]).catch(() => {});
      }
    },
  });

  if (!config.keepOriginals) fs.rmSync(input, { force: true });
  await q("UPDATE videos SET status = 'ready', progress = 100 WHERE id = $1", [id]);
  console.log(`[transcode] ${id} ready (${rungs.map((g) => g.r + 'p').join(', ')})`);
}
