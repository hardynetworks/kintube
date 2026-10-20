import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AuthShell, ErrorNote } from '../components/ui.jsx';

export default function Setup() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ familyName: '', displayName: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/setup', { method: 'POST', body: f });
      setUser(user);
      nav('/family', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="auth__title">Welcome to KinCast</h1>
      <p className="auth__lead">Set up your family's private video space. You'll be the admin and can invite everyone next.</p>
      <form onSubmit={submit} className="form">
        <label className="field"><span>Family name</span>
          <input value={f.familyName} onChange={set('familyName')} placeholder="The Hardys" required maxLength={60} autoFocus />
        </label>
        <label className="field"><span>Your name</span>
          <input value={f.displayName} onChange={set('displayName')} placeholder="Cade" required maxLength={60} />
        </label>
        <label className="field"><span>Email</span>
          <input type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label className="field"><span>Password</span>
          <input type="password" value={f.password} onChange={set('password')} minLength={8} required autoComplete="new-password" />
          <small>At least 8 characters</small>
        </label>
        <ErrorNote error={error} />
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Creating…' : 'Create family space'}</button>
      </form>
    </AuthShell>
  );
}
