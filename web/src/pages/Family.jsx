import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Copy, Check, Trash2, Shield, Video, Eye, Link2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, ErrorNote, Spinner, useCopy } from '../components/ui.jsx';
import { ago } from '../format.js';

const ROLES = {
  admin: { label: 'Admin', icon: Shield, help: 'Manages family & invites' },
  member: { label: 'Member', icon: Video, help: 'Uploads and goes live' },
  viewer: { label: 'Viewer', icon: Eye, help: 'Watches and comments' },
};

function Invites() {
  const [invites, setInvites] = useState(null);
  const [role, setRole] = useState('member');
  const [error, setError] = useState(null);
  const [copied, copy] = useCopy();

  const load = () => api('/family/invites').then((d) => setInvites(d.invites));
  useEffect(() => { load(); }, []);

  async function create() {
    try {
      const inv = await api('/family/invites', { method: 'POST', body: { role, days: 7 } });
      await load();
      copy(inv.url, inv.code);
    } catch (e) {
      setError(e);
    }
  }

  async function revoke(code) {
    await api(`/family/invites/${code}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="card">
      <h3 className="h3"><UserPlus size={18} /> Invite family</h3>
      <p className="muted small">Create a link and text it to them. Links work once and expire after 7 days.</p>
      <div className="role-pick">
        {Object.entries(ROLES).map(([k, r]) => (
          <button key={k} className={`role-opt${role === k ? ' role-opt--on' : ''}`} onClick={() => setRole(k)}>
            <r.icon size={18} />
            <strong>{r.label}</strong>
            <span>{r.help}</span>
          </button>
        ))}
      </div>
      <button className="btn btn--primary" onClick={create}><Link2 size={16} /> Create invite link</button>
      <ErrorNote error={error} />
      {invites === null ? <Spinner /> : invites.length > 0 && (
        <div className="invites">
          {invites.map((i) => (
            <div key={i.code} className={`invite${i.usedAt ? ' invite--used' : ''}`}>
              <span className={`role role--${i.role}`}>{ROLES[i.role].label}</span>
              <code className="mono invite__url">{i.url}</code>
              {i.usedAt ? (
                <span className="muted small">Used by {i.usedByName || 'someone'}</span>
              ) : (
                <>
                  <button className="icon-btn" onClick={() => copy(i.url, i.code)} aria-label="Copy link">
                    {copied === i.code ? <Check size={16} className="text-ok" /> : <Copy size={16} />}
                  </button>
                  <button className="icon-btn icon-btn--danger" onClick={() => revoke(i.code)} aria-label="Revoke"><Trash2 size={16} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Family() {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);

  const load = () => api('/family/members').then((d) => setMembers(d.members));
  useEffect(() => { load(); }, []);

  async function setRole(m, role) {
    try {
      await api(`/family/members/${m.id}`, { method: 'PATCH', body: { role } });
      setError(null);
      load();
    } catch (e) {
      setError(e);
    }
  }

  async function remove(m) {
    if (!confirm(`Remove ${m.displayName} from the family? Their videos will be deleted too.`)) return;
    await api(`/family/members/${m.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="page page--narrow">
      <div className="page__head">
        <h1 className="h1">{user.familyName}</h1>
        {members && <span className="muted">{members.length} {members.length === 1 ? 'person' : 'people'}</span>}
      </div>

      {isAdmin && <Invites />}

      <div className="card">
        <h3 className="h3">Members</h3>
        <ErrorNote error={error} />
        {members === null ? <Spinner /> : (
          <div className="members">
            {members.map((m) => (
              <div key={m.id} className="member">
                <Link to={`/c/${m.username}`} className="member__who">
                  <Avatar user={m} size={44} live={m.isLive} />
                  <div>
                    <strong>{m.displayName}{m.id === user.id && <span className="muted"> (you)</span>}</strong>
                    <span className="muted small">{m.videoCount} video{m.videoCount === 1 ? '' : 's'} · joined {ago(m.joinedAt)}</span>
                  </div>
                </Link>
                {isAdmin ? (
                  <div className="row gap">
                    <select value={m.role} onChange={(e) => setRole(m, e.target.value)} aria-label={`Role for ${m.displayName}`}>
                      {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                    </select>
                    {m.id !== user.id && (
                      <button className="icon-btn icon-btn--danger" onClick={() => remove(m)} aria-label={`Remove ${m.displayName}`}><Trash2 size={16} /></button>
                    )}
                  </div>
                ) : (
                  <span className={`role role--${m.role}`}>{ROLES[m.role].label}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
