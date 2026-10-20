import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Home, Radio, Clapperboard, Users, Settings, Upload, Search, Menu, LogOut, Video } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Avatar, Logo } from './ui.jsx';

function SearchBox() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  useEffect(() => setQ(params.get('q') || ''), [params]);
  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        nav(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/');
      }}
    >
      <Search size={17} className="search__icon" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search family videos" aria-label="Search" />
    </form>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return (
    <div className="menu" onClick={(e) => e.stopPropagation()}>
      <button className="menu__trigger" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <Avatar user={user} size={34} />
      </button>
      {open && (
        <div className="menu__panel" onClick={() => setOpen(false)}>
          <div className="menu__who">
            <Avatar user={user} size={40} />
            <div>
              <strong>{user.displayName}</strong>
              <span>{user.familyName} · {user.role}</span>
            </div>
          </div>
          <Link to={`/c/${user.username}`} className="menu__item"><Video size={16} /> My channel</Link>
          <Link to="/settings" className="menu__item"><Settings size={16} /> Settings</Link>
          <button className="menu__item" onClick={async () => { await logout(); nav('/login'); }}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, canUpload } = useAuth();
  const loc = useLocation();
  const [members, setMembers] = useState([]);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [loc.pathname]);

  useEffect(() => {
    let alive = true;
    const load = () => api('/family/members').then((d) => alive && setMembers(d.members)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const liveCount = members.filter((m) => m.isLive).length;
  const channels = members.filter((m) => m.role !== 'viewer' || m.videoCount > 0);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__left">
          <button className="icon-btn topbar__menu" onClick={() => setDrawer((d) => !d)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <Logo height={28} />
          <span className="topbar__family">{user.familyName}</span>
        </div>
        <SearchBox />
        <div className="topbar__right">
          {canUpload && (
            <>
              <Link to="/go-live" className="btn btn--ghost btn--sm hide-sm"><Radio size={16} /> Go live</Link>
              <Link to="/upload" className="btn btn--primary btn--sm"><Upload size={16} /> <span className="hide-sm">Upload</span></Link>
            </>
          )}
          <UserMenu />
        </div>
      </header>

      <aside className={`sidebar${drawer ? ' sidebar--open' : ''}`}>
        <nav className="sidebar__nav">
          <NavLink to="/" end className="nav-item"><Home size={19} /> Home</NavLink>
          <NavLink to="/live" className="nav-item">
            <Radio size={19} /> Live now {liveCount > 0 && <span className="nav-item__count">{liveCount}</span>}
          </NavLink>
          {canUpload && <NavLink to="/studio" className="nav-item"><Clapperboard size={19} /> Studio</NavLink>}
          <NavLink to="/family" className="nav-item"><Users size={19} /> Family</NavLink>
        </nav>
        <div className="sidebar__section">Channels</div>
        <nav className="sidebar__channels">
          {channels.map((m) => (
            <NavLink key={m.id} to={m.isLive ? `/live/${m.username}` : `/c/${m.username}`} className="channel-link">
              <Avatar user={m} size={26} live={m.isLive} />
              <span className="channel-link__name">{m.displayName}</span>
              {m.isLive ? <span className="dot-live" title="Live now" /> : <span className="channel-link__count">{m.videoCount}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
