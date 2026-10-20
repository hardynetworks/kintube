import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AuthShell, ErrorNote } from '../components/ui.jsx';

export default function Login() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: f });
      setUser(user);
      const next = params.get('next');
      nav(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="auth__title">Sign in</h1>
      <p className="auth__lead">Home videos and live streams, just for family.</p>
      <form onSubmit={submit} className="form">
        <label className="field"><span>Email or username</span>
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoFocus autoComplete="username" />
        </label>
        <label className="field"><span>Password</span>
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="current-password" />
        </label>
        <ErrorNote error={error} />
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth__hint">New here? Ask a family admin for an invite link.</p>
    </AuthShell>
  );
}
