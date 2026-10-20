import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, ErrorNote } from '../components/ui.jsx';

const COLORS = ['#22D3EE', '#6366F1', '#C026D3', '#F43F5E', '#F59E0B', '#10B981', '#3B82F6', '#A855F7'];

function Saved({ on }) {
  return on ? <span className="text-ok small row gap-sm"><Check size={14} /> Saved</span> : null;
}

export default function Settings() {
  const { user, setUser, isAdmin } = useAuth();
  const [name, setName] = useState(user.displayName);
  const [color, setColor] = useState(user.avatarColor);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [family, setFamily] = useState(user.familyName);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState(null);

  const flash = (k) => { setSaved(k); setError(null); setTimeout(() => setSaved(''), 1800); };

  async function saveProfile(e) {
    e.preventDefault();
    try {
      const { user: u } = await api('/me', { method: 'PATCH', body: { displayName: name, avatarColor: color } });
      setUser(u);
      flash('profile');
    } catch (err) { setError(err); }
  }

  async function savePassword(e) {
    e.preventDefault();
    try {
      await api('/me', { method: 'PATCH', body: pw });
      setPw({ currentPassword: '', newPassword: '' });
      flash('password');
    } catch (err) { setError(err); }
  }

  async function saveFamily(e) {
    e.preventDefault();
    try {
      const d = await api('/family/settings', { method: 'PATCH', body: { familyName: family } });
      setUser({ ...user, familyName: d.familyName });
      flash('family');
    } catch (err) { setError(err); }
  }

  return (
    <div className="page page--narrow">
      <div className="page__head"><h1 className="h1">Settings</h1></div>
      <ErrorNote error={error} />

      <form className="card form" onSubmit={saveProfile}>
        <h3 className="h3">Profile</h3>
        <div className="row gap">
          <Avatar user={{ displayName: name, avatarColor: color }} size={56} />
          <div className="swatches" role="radiogroup" aria-label="Avatar color">
            {COLORS.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={color === c} className={`swatch${color === c ? ' swatch--on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
        </div>
        <label className="field"><span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </label>
        <div className="field"><span>Email</span><input value={user.email} disabled /></div>
        <div className="row gap"><button className="btn btn--primary">Save profile</button><Saved on={saved === 'profile'} /></div>
      </form>

      <form className="card form" onSubmit={savePassword}>
        <h3 className="h3">Password</h3>
        <label className="field"><span>Current password</span>
          <input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required autoComplete="current-password" />
        </label>
        <label className="field"><span>New password</span>
          <input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} minLength={8} required autoComplete="new-password" />
        </label>
        <div className="row gap"><button className="btn btn--ghost">Change password</button><Saved on={saved === 'password'} /></div>
      </form>

      {isAdmin && (
        <form className="card form" onSubmit={saveFamily}>
          <h3 className="h3">Family</h3>
          <label className="field"><span>Family name</span>
            <input value={family} onChange={(e) => setFamily(e.target.value)} maxLength={60} required />
          </label>
          <div className="row gap"><button className="btn btn--ghost">Save</button><Saved on={saved === 'family'} /></div>
        </form>
      )}
    </div>
  );
}
