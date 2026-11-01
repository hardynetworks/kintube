import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Tv as TvIcon } from 'lucide-react';
import { api } from '../api.js';
import { ErrorNote } from '../components/ui.jsx';

/** Format what's typed as "ABCD-EFGH" (letters and digits only). */
function formatCode(v) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

/** Connect a TV: enter the code the KinCast TV app shows. */
export default function Tv() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(formatCode(params.get('code') || ''));
  const [found, setFound] = useState(null);
  const [name, setName] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const complete = code.length === 9;

  // Look the code up as soon as it's complete, to show which TV it is.
  useEffect(() => {
    setFound(null);
    setError(null);
    if (!complete) return undefined;
    const ctl = new AbortController();
    api(`/tv/pair/${encodeURIComponent(code)}`, { signal: ctl.signal })
      .then((d) => { setFound(d); setName(d.deviceName); })
      .catch((err) => { if (err.name !== 'AbortError') setError(err); });
    return () => ctl.abort();
  }, [code, complete]);

  async function approve(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/tv/approve', { method: 'POST', body: { code, name } });
      setDone(d.device);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="page page--narrow">
        <div className="card tv-link tv-link--done">
          <div className="tv-link__icon tv-link__icon--ok"><Check size={28} /></div>
          <h1 className="h1">{done.name} is connected</h1>
          <p className="muted">It signs in by itself in a moment. You can remove it any time in <Link to="/settings">Settings</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <form className="card form tv-link" onSubmit={approve}>
        <div className="tv-link__icon"><TvIcon size={28} /></div>
        <h1 className="h1">Connect a TV</h1>
        <p className="muted">Open KinCast on your TV, then scan its QR code or type the code it shows. The TV watches as you, but can't upload or change anything.</p>
        <ErrorNote error={error} />
        <label className="field">
          <span>Code on the TV</span>
          <input
            className="tv-link__code"
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            placeholder="ABCD-EFGH"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            autoFocus
            aria-describedby="tv-code-help"
          />
          <small id="tv-code-help">8 letters and numbers. Codes last 10 minutes.</small>
        </label>
        {found && (
          <label className="field">
            <span>Name this TV</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
        )}
        <button className="btn btn--primary btn--block" disabled={!found || busy}>
          {busy ? 'Connecting…' : 'Connect TV'}
        </button>
      </form>
    </div>
  );
}
