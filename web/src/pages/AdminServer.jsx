import { useCallback, useEffect, useState } from 'react';
import {
  Server, HardDrive, Film, Users, Cpu, Radio, Network, RefreshCw, Power, Check, Copy, Eye, EyeOff, ExternalLink,
} from 'lucide-react';
import { api } from '../api.js';
import { ErrorNote, Spinner, useCopy } from '../components/ui.jsx';
import { bytes } from '../format.js';

const STATE = {
  connected: { label: 'Connected', tone: 'ok' },
  connecting: { label: 'Connecting…', tone: 'warn' },
  error: { label: 'Connection failed', tone: 'bad' },
  disabled: { label: 'Off', tone: 'off' },
  'no-client': { label: 'Client not running', tone: 'bad' },
};

function uptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function Stat({ icon: Icon, label, value, sub, children }) {
  return (
    <div className="astat">
      <div className="astat__head"><Icon size={16} /> {label}</div>
      <div className="astat__value">{value}</div>
      {sub && <div className="astat__sub">{sub}</div>}
      {children}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="kv">
      <span className="kv__k">{label}</span>
      <span className="kv__v">{children}</span>
    </div>
  );
}

function NetBirdCard({ initial }) {
  const [nb, setNb] = useState(initial);
  const [form, setForm] = useState({
    managementUrl: initial.settings.managementUrl,
    hostname: initial.settings.hostname,
    setupKey: '',
  });
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, copy] = useCopy();

  const refresh = useCallback(() => api('/admin/netbird').then(setNb).catch(() => {}), []);
  const state = nb.status.state;

  // Poll quickly while connecting, slowly otherwise.
  useEffect(() => {
    const t = setInterval(refresh, state === 'connecting' ? 2000 : 8000);
    return () => clearInterval(t);
  }, [refresh, state]);

  async function save(enabled) {
    setBusy(true);
    setError(null);
    try {
      const body = { managementUrl: form.managementUrl, hostname: form.hostname, enabled };
      if (form.setupKey.trim()) body.setupKey = form.setupKey.trim();
      setNb(await api('/admin/netbird', { method: 'PUT', body }));
      setForm((f) => ({ ...f, setupKey: '' }));
      setTimeout(refresh, 1500);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function reconnect() {
    setBusy(true);
    setError(null);
    try {
      setNb(await api('/admin/netbird/reconnect', { method: 'POST' }));
      setTimeout(refresh, 1500);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const s = nb.status;
  const tone = STATE[state] || STATE.disabled;
  const connected = state === 'connected';

  return (
    <section className="card">
      <div className="card__title-row">
        <h2 className="h3"><Network size={18} /> NetBird</h2>
        <span className={`state-pill state-pill--${tone.tone}`}><span className="state-pill__dot" />{tone.label}</span>
      </div>
      <p className="muted small card__lead">
        KinCast runs its own NetBird client, so the NetBird reverse proxy can reach the site without opening ports on this server.
      </p>

      {s.sidecar !== 'running' && (
        <div className="note note--warn">
          The NetBird client container isn't running. Add <code>COMPOSE_FILE=docker-compose.yml:docker-compose.netbird.yml</code> to
          your <code>.env</code> and run <code>docker compose up -d</code>, then come back here.
        </div>
      )}
      {state === 'error' && s.lastError && <div className="note note--error">{s.lastError}</div>}

      {s.sidecar === 'running' && (connected || s.ip) && (
        <div className="kv-grid">
          <Row label="NetBird IP">{s.ip ? <span className="mono">{s.ip}</span> : '—'}</Row>
          <Row label="Peer name">{s.fqdn ? <span className="mono">{s.fqdn}</span> : nb.settings.hostname}</Row>
          <Row label="Management">{s.managementConnected ? 'Connected' : 'Not connected'} · Signal {s.signalConnected ? 'connected' : 'not connected'}</Row>
          <Row label="Peers">{s.peers ? `${s.peers.connected} of ${s.peers.total} connected` : '—'}</Row>
          <Row label="Proxy target">
            <span className="mono">{s.fqdn || nb.settings.hostname}:{s.forwardPort}</span>
            <button className="icon-btn icon-btn--xs" onClick={() => copy(`${s.ip || s.fqdn}:${s.forwardPort}`, 'target')} aria-label="Copy target">
              {copied === 'target' ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </Row>
          <Row label="Client version">{s.version || '—'}</Row>
        </div>
      )}

      <form className="form" onSubmit={(e) => { e.preventDefault(); save(true); }}>
        <label className="field"><span>Management URL</span>
          <input value={form.managementUrl} onChange={(e) => setForm({ ...form, managementUrl: e.target.value })} placeholder="https://vpn.hardynetworks.net" required />
          <small>Your self-hosted NetBird address, or https://api.netbird.io for NetBird Cloud.</small>
        </label>
        <label className="field"><span>Setup key</span>
          <div className="input-with-btn">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.setupKey}
              onChange={(e) => setForm({ ...form, setupKey: e.target.value })}
              placeholder={nb.settings.setupKeySet ? `Saved (${nb.settings.setupKeyHint}) — paste a new one to replace it` : 'Paste a setup key from NetBird'}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="icon-btn" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Hide key' : 'Show key'}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small>NetBird → Setup Keys → Create. A one-time key is fine; KinCast only uses it the first time it connects.</small>
        </label>
        <label className="field"><span>Peer name</span>
          <input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="kintube" maxLength={63} />
          <small>How this server appears in your NetBird peer list.</small>
        </label>
        <ErrorNote error={error} />
        <div className="row gap wrap">
          <button className="btn btn--red" disabled={busy}>
            {busy ? 'Saving…' : nb.settings.enabled ? 'Save & reconnect' : 'Save & connect'}
          </button>
          {nb.settings.enabled && (
            <>
              <button type="button" className="btn btn--ghost" onClick={reconnect} disabled={busy}><RefreshCw size={15} /> Reconnect</button>
              <button type="button" className="btn btn--ghost" onClick={() => save(false)} disabled={busy}><Power size={15} /> Turn off</button>
            </>
          )}
        </div>
      </form>

      <details className="howto-box" open={!connected}>
        <summary>Put the site on your domain with the NetBird reverse proxy</summary>
        <ol>
          <li>Connect here first — this server shows up as the peer <b>{nb.settings.hostname}</b>.</li>
          <li>In NetBird open <b>Reverse Proxy → Services → Add Service</b>, mode <b>HTTP</b>, and pick your domain (e.g. <span className="mono">kintube.hardynetworks.net</span>).</li>
          <li>Target: <b>Peer</b> → <b>{nb.settings.hostname}</b>, protocol <b>HTTP</b>, port <b>{s.forwardPort}</b>.</li>
          <li>Authentication: <b>none</b> (KinCast has its own logins). Add a <b>Block access</b> rule for the path <span className="mono">/internal</span>.</li>
          <li>In Cloudflare, point the domain's CNAME at the address NetBird shows, as <b>DNS only</b> (grey cloud).</li>
        </ol>
        <a className="link-btn" href="https://docs.netbird.io/manage/reverse-proxy" target="_blank" rel="noreferrer">NetBird reverse proxy docs <ExternalLink size={12} /></a>
      </details>
    </section>
  );
}

export default function AdminServer() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = () => api('/admin/server').then(setData).catch(setError);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!data) return <div className="page center pad"><Spinner /></div>;

  const { server: s, counts: c } = data;
  const used = s.disk ? s.disk.total - s.disk.free : 0;
  const usedPct = s.disk ? Math.round((used / s.disk.total) * 100) : 0;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1 row gap"><Server size={24} /> Server admin</h1>
        <span className="muted small mono">KinCast {s.version} · up {uptime(s.uptimeSec)}</span>
      </div>

      <div className="astats">
        <Stat icon={Film} label="Videos" value={c.videos} sub={`${(c.seconds / 3600).toFixed(1)} hours of family video`} />
        <Stat icon={Users} label="Family" value={c.members} sub={`${c.subscriptions} subscriptions · ${c.comments} comments`} />
        <Stat
          icon={Cpu}
          label="Processing"
          value={c.processing}
          sub={c.failed ? `${c.failed} failed — retry from Studio` : `${s.cpus} CPU cores · load ${s.load.toFixed(2)}`}
        />
        <Stat icon={HardDrive} label="Storage" value={s.disk ? `${bytes(s.disk.free)} free` : '—'} sub={s.disk ? `${bytes(used)} of ${bytes(s.disk.total)} used` : 'Unavailable'}>
          {s.disk && <div className={`bar${usedPct > 85 ? ' bar--bad' : ''}`}><div className="bar__fill" style={{ width: `${usedPct}%` }} /></div>}
        </Stat>
      </div>

      <div className="admin-cols">
        <NetBirdCard initial={data.netbird} />

        <section className="card">
          <h2 className="h3"><Radio size={18} /> Site & streaming</h2>
          <div className="kv-grid kv-grid--single">
            <Row label="Site address"><span className="mono">{s.publicUrl}</span></Row>
            <Row label="Stream server (OBS)"><span className="mono">{s.rtmpUrl}</span></Row>
            <Row label="Live now">{c.live} stream{c.live === 1 ? '' : 's'}</Row>
            <Row label="Video qualities">{s.renditions.map((r) => `${r}p`).join(' · ')}</Row>
            <Row label="Max upload">{bytes(s.maxUploadBytes)}</Row>
            <Row label="Memory">{bytes(s.memory.total - s.memory.free)} of {bytes(s.memory.total)} used</Row>
            <Row label="Software"><span className="mono">Node {s.node} · ffmpeg {s.ffmpeg || 'missing'}</span></Row>
            <Row label="Container"><span className="mono">{s.hostname}</span></Row>
          </div>
          <p className="muted small">Address, stream server and video settings come from the server's <code>.env</code> file.</p>
        </section>
      </div>
    </div>
  );
}
