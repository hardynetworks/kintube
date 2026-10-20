import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AuthShell, ErrorNote, Spinner } from '../components/ui.jsx';

const ROLE_COPY = {
  admin: 'You can share videos, go live, and manage the family.',
  member: 'You can watch, share your own videos, and go live.',
  viewer: 'You can watch, like and comment on family videos.',
};

export default function Join() {
  const { code } = useParams();
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [f, setF] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/invites/${code}`).then(setInvite).catch(setLoadError);
  }, [code]);

  if (user) {
    return (
      <AuthShell>
        <h1 className="auth__title">You're already signed in</h1>
        <p className="auth__lead">This invite is for a new family member. Sign out first if you're setting up someone else's account.</p>
        <Link to="/" className="btn btn--primary btn--block">Go to KinCast</Link>
      </AuthShell>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api('/auth/register', { method: 'POST', body: { ...f, code } });
      setUser(user);
      nav('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthShell>
        <h1 className="auth__title">Invite not valid</h1>
        <p className="auth__lead">{loadError.message}. Ask whoever sent it for a fresh link.</p>
        <Link to="/login" className="btn btn--ghost btn--block">Go to sign in</Link>
      </AuthShell>
    );
  }
  if (!invite) return <AuthShell><div className="center"><Spinner /></div></AuthShell>;

  return (
    <AuthShell>
      <span className="eyebrow">You're invited</span>
      <h1 className="auth__title">Join {invite.familyName}</h1>
      <p className="auth__lead">{ROLE_COPY[invite.role]}</p>
      <form onSubmit={submit} className="form">
        <label className="field"><span>Your name</span>
          <input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} placeholder="Grandma Jo" required autoFocus />
        </label>
        <label className="field"><span>Email</span>
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" />
        </label>
        <label className="field"><span>Password</span>
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={8} required autoComplete="new-password" />
          <small>At least 8 characters</small>
        </label>
        <ErrorNote error={error} />
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Joining…' : 'Join the family'}</button>
      </form>
    </AuthShell>
  );
}
