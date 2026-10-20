import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, X, CheckCircle2, AlertCircle, Film } from 'lucide-react';
import { api, uploadVideo } from '../api.js';
import { bytes } from '../format.js';

const VIDEO_RE = /\.(mp4|mov|m4v|mkv|webm|avi|mts|m2ts|3gp|mpg|mpeg|wmv|flv|ts)$/i;
let nextKey = 1;

function guessTitle(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function guessDate(file) {
  // Phone exports like IMG_20190704_101500.mp4 or PXL_20230102...; fall back to the file's modified date.
  const m = file.name.match(/(19|20)(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
  if (m) {
    const [y, mo, d] = [m[1] + m[2], m[3], m[4]];
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return `${y}-${mo}-${d}`;
  }
  return '';
}

export default function Upload() {
  const [items, setItems] = useState([]);
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const [maxBytes, setMaxBytes] = useState(null);
  const inputRef = useRef(null);
  const cancelled = useRef(new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    api('/config').then((d) => setMaxBytes(d.maxUploadBytes)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!running) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  function add(files) {
    const list = [...files].map((file) => {
      const ok = VIDEO_RE.test(file.name);
      const tooBig = maxBytes && file.size > maxBytes;
      return {
        key: nextKey++,
        file,
        title: guessTitle(file.name),
        description: '',
        filmedOn: guessDate(file),
        status: ok && !tooBig ? 'ready' : 'error',
        error: !ok ? 'Not a video file' : tooBig ? `Larger than ${bytes(maxBytes)}` : null,
        progress: 0,
      };
    });
    setItems((cur) => [...cur, ...list]);
  }

  const update = (key, patch) => setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function startAll() {
    setRunning(true);
    const queue = itemsRef.current.filter((i) => i.status === 'ready');
    for (const it of queue) {
      if (cancelled.current.has(it.key)) continue;
      update(it.key, { status: 'uploading', progress: 0 });
      try {
        const latest = itemsRef.current.find((x) => x.key === it.key) || it;
        const { video } = await uploadVideo(
          it.file,
          { title: latest.title, description: latest.description, filmedOn: latest.filmedOn || undefined },
          {
            onProgress: (p) => update(it.key, { progress: p }),
            isCancelled: () => cancelled.current.has(it.key),
          },
        );
        update(it.key, { status: 'done', progress: 1, videoId: video.id });
      } catch (err) {
        update(it.key, { status: 'error', error: err.message });
      }
    }
    setRunning(false);
  }

  function remove(key) {
    cancelled.current.add(key);
    setItems((cur) => cur.filter((i) => i.key !== key || i.status === 'uploading'));
  }

  const pending = items.filter((i) => i.status === 'ready').length;
  const done = items.filter((i) => i.status === 'done').length;

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="h1">Upload videos</h1>
        {done > 0 && <Link to="/studio" className="btn btn--ghost btn--sm">View in Studio</Link>}
      </div>

      <div
        className={`drop${drag ? ' drop--over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <div className="drop__icon"><UploadCloud size={34} /></div>
        <h3>Drop home videos here</h3>
        <p>or click to choose files · MP4, MOV, MKV and more{maxBytes ? ` · up to ${bytes(maxBytes)} each` : ''}</p>
        <input ref={inputRef} type="file" accept="video/*,.mkv,.mts,.m2ts" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <div className="uploads">
          {items.map((it) => (
            <div key={it.key} className={`upload upload--${it.status}`}>
              <div className="upload__icon">
                {it.status === 'done' ? <CheckCircle2 size={22} /> : it.status === 'error' ? <AlertCircle size={22} /> : <Film size={22} />}
              </div>
              <div className="upload__body">
                {it.status === 'ready' ? (
                  <div className="upload__fields">
                    <input className="upload__title" value={it.title} onChange={(e) => update(it.key, { title: e.target.value })} placeholder="Title" maxLength={120} />
                    <input type="date" value={it.filmedOn} onChange={(e) => update(it.key, { filmedOn: e.target.value })} title="Date filmed (optional — detected automatically when possible)" />
                    <textarea rows={2} value={it.description} onChange={(e) => update(it.key, { description: e.target.value })} placeholder="Add a description (optional)" maxLength={5000} />
                  </div>
                ) : (
                  <strong className="upload__name">{it.title}</strong>
                )}
                <div className="upload__meta">
                  <span className="mono">{it.file.name} · {bytes(it.file.size)}</span>
                  {it.status === 'uploading' && <span className="mono">{Math.floor(it.progress * 100)}%</span>}
                  {it.status === 'done' && <Link to={`/watch/${it.videoId}`}>Uploaded — processing now</Link>}
                  {it.status === 'error' && <span className="text-danger">{it.error}</span>}
                </div>
                {it.status === 'uploading' && <div className="bar"><div className="bar__fill" style={{ width: `${it.progress * 100}%` }} /></div>}
              </div>
              {(it.status === 'ready' || it.status === 'error' || it.status === 'uploading') && (
                <button className="icon-btn" onClick={() => remove(it.key)} aria-label={it.status === 'uploading' ? 'Cancel' : 'Remove'}><X size={18} /></button>
              )}
            </div>
          ))}
          <div className="uploads__foot">
            <span className="muted">{done}/{items.length} uploaded</span>
            <button className="btn btn--primary" onClick={startAll} disabled={running || !pending}>
              {running ? 'Uploading…' : `Upload ${pending || ''} video${pending === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
