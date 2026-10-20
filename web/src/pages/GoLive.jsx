import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, Eye, EyeOff, RefreshCw, Radio, ExternalLink, Smartphone, Monitor } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorNote, LiveBadge, Spinner, useCopy } from '../components/ui.jsx';
import Player from '../components/Player.jsx';

function CopyField({ label, value, secret, copied, onCopy }) {
  const [show, setShow] = useState(!secret);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="copyfield">
        <code className="mono">{show ? value : '•'.repeat(Math.min(32, value.length))}</code>
        {secret && (
          <button className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide' : 'Show'}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
        <button className="icon-btn" onClick={() => onCopy(value, label)} aria-label={`Copy ${label}`}>
          {copied === label ? <Check size={16} className="text-ok" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

export default function GoLive() {
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [copied, copy] = useCopy();
  const [channel, setChannel] = useState(null);

  useEffect(() => {
    api('/live/me').then((d) => { setS(d); setTitle(d.title); }).catch(setError);
  }, []);

  // Watch our own status so the preview appears when OBS connects.
  useEffect(() => {
    let alive = true;
    const load = () => api(`/live/channel/${user.username}`).then((d) => alive && setChannel(d.channel)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [user.username]);

  async function saveTitle(e) {
    e.preventDefault();
    await api('/live/me', { method: 'PATCH', body: { title } });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function toggleSave() {
    const next = !s.saveStreams;
    setS({ ...s, saveStreams: next });
    await api('/live/me', { method: 'PATCH', body: { saveStreams: next } });
  }

  async function resetKey() {
    if (!confirm('Generate a new stream key? Your old key stops working immediately, so update OBS afterwards.')) return;
    const { streamKey } = await api('/live/me/reset-key', { method: 'POST' });
    setS({ ...s, streamKey });
  }

  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!s) return <div className="page center pad"><Spinner /></div>;

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="h1">Go live</h1>
        <Link to={`/live/${user.username}`} className="btn btn--ghost btn--sm"><ExternalLink size={15} /> Your live page</Link>
      </div>

      <div className={`golive-status${channel?.isLive ? ' golive-status--on' : ''}`}>
        {channel?.isLive ? (
          <>
            <LiveBadge viewers={channel.viewers} />
            <span>You're live! The family can watch at <Link to={`/live/${user.username}`}>your live page</Link>.</span>
          </>
        ) : (
          <>
            <Radio size={18} />
            <span>You're offline. Start streaming from OBS (or another RTMP app) with the details below.</span>
          </>
        )}
      </div>

      {channel?.isLive && (
        <div className="card">
          <h3 className="h3">Preview</h3>
          <Player key={channel.hls} src={channel.hls} live autoPlay />
          <p className="muted small">Your preview runs ~10 seconds behind. Muted by default in most browsers.</p>
        </div>
      )}

      <div className="card">
        <h3 className="h3">Stream details</h3>
        <form className="form" onSubmit={saveTitle}>
          <label className="field"><span>Stream title</span>
            <div className="row gap">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${user.displayName} is live`} maxLength={120} />
              <button className="btn btn--ghost">{saved ? <Check size={16} /> : 'Save'}</button>
            </div>
          </label>
        </form>
        <label className="toggle">
          <input type="checkbox" checked={s.saveStreams} onChange={toggleSave} />
          <span className="toggle__ui" />
          <span>Save a replay to my channel when the stream ends</span>
        </label>
      </div>

      <div className="card">
        <h3 className="h3">Encoder setup</h3>
        <CopyField label="Server" value={s.rtmpUrl} copied={copied} onCopy={copy} />
        <CopyField label="Stream key" value={s.streamKey} secret copied={copied} onCopy={copy} />
        <div className="row between">
          <p className="muted small">Keep your key private — anyone with it can stream as you.</p>
          <button className="btn btn--ghost btn--sm" onClick={resetKey}><RefreshCw size={14} /> New key</button>
        </div>
      </div>

      <div className="howto">
        <div className="howto__col">
          <h4><Monitor size={18} /> From a computer (OBS Studio)</h4>
          <ol>
            <li>Install <a href="https://obsproject.com" target="_blank" rel="noreferrer">OBS Studio</a> (free).</li>
            <li>Settings → Stream → Service: <b>Custom…</b></li>
            <li>Paste the <b>Server</b> and <b>Stream key</b> above.</li>
            <li>Settings → Output: video bitrate 2500–4500 Kbps, keyframe interval <b>2s</b>.</li>
            <li>Click <b>Start Streaming</b>.</li>
          </ol>
        </div>
        <div className="howto__col">
          <h4><Smartphone size={18} /> From a phone</h4>
          <ol>
            <li>Use an RTMP camera app like <b>Larix Broadcaster</b> (iOS/Android, free).</li>
            <li>Add a connection with URL: <code className="mono">{s.rtmpUrl}/{'<stream key>'}</code></li>
            <li>Tap record to go live.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
