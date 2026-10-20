import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Home, Radio, Clapperboard, Users, Settings, Upload, Search, Menu, LogOut, PlaySquare, CalendarHeart, Flame, BellRing, Server,
} from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Avatar, Logo } from './ui.jsx';
import Notifications from './Notifications.jsx';
import { SUBS_EVENT } from './Subscribe.jsx';

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
      <div className="search__box">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search family videos" />
        <button type="submit" className="search__btn" aria-label="Search"><Search size={16} /></button>
      </div>
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
        <Avatar user={user} size={32} />
      </button>
      {open && (
        <div className="menu__panel" onClick={() => setOpen(false)}>
          <div className="menu__who">
            <Avatar user={user} size={40} />
            <div>
              <strong>{user.displayName}</strong>
              <span>@{user.username}</span>
            </div>
          </div>
          <Link to={`/c/${user.username}`} className="menu__item"><PlaySquare size={18} /> Your channel</Link>
          <Link to="/settings" className="menu__item"><Settings size={18} /> Settings</Link>
          <button className="menu__item" onClick={async () => { await logout(); nav('/login'); }}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, icon: Icon, label, end, badge, isActive }) {
  const loc = useLocation();
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive: routeActive }) => `nav-item${(isActive ? isActive(loc) : routeActive) ? ' active' : ''}`}
    >
      <Icon size={20} className="nav-item__icon" />
      <span className="nav-item__label">{label}</span>
      {badge ? <span className="nav-item__count">{badge}</span> : null}
    </NavLink>
  );
}

const COLLAPSE_KEY = 'kc.sidebarCollapsed';

export default function Layout() {
  const { user, canUpload, isAdmin } = useAuth();
  const loc = useLocation();
  const [members, setMembers] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => setDrawer(false), [loc.pathname]);

  useEffect(() => {
    let alive = true;
    const load = () => api('/family/members').then((d) => alive && setMembers(d.members)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    window.addEventListener(SUBS_EVENT, load);
    return () => { alive = false; clearInterval(t); window.removeEventListener(SUBS_EVENT, load); };
  }, []);

  function toggleMenu() {
    // Desktop: collapse to an icon rail. Narrow screens: slide-out drawer.
    if (window.matchMedia('(max-width: 900px)').matches) return setDrawer((d) => !d);
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
      return !c;
    });
  }

  const liveCount = members.filter((m) => m.isLive).length;
  const others = members.filter((m) => m.id !== user.id);
  const subscribed = others.filter((m) => m.subscribed);
  const channels = others.filter((m) => !m.subscribed && (m.role !== 'viewer' || m.videoCount > 0));
  const channelLink = (m) => (
    <NavLink key={m.id} to={m.isLive ? `/live/${m.username}` : `/c/${m.username}`} className="nav-item nav-item--channel" title={m.displayName}>
      <Avatar user={m} size={24} live={m.isLive} />
      <span className="nav-item__label">{m.displayName}</span>
      {m.isLive && <span className="dot-live" title="Live now" />}
    </NavLink>
  );

  return (
    <div className={`shell${collapsed ? ' shell--collapsed' : ''}`}>
      <header className="topbar">
        <div className="topbar__left">
          <button className="icon-btn icon-btn--round" onClick={toggleMenu} aria-label="Toggle menu">
            <Menu size={20} />
          </button>
          <Logo height={30} />
        </div>
        <SearchBox />
        <div className="topbar__right">
          {canUpload && (
            <>
              <Link to="/go-live" className="icon-btn icon-btn--round hide-sm" title="Go live" aria-label="Go live"><Radio size={20} /></Link>
              <Link to="/upload" className="icon-btn icon-btn--round hide-sm" title="Upload" aria-label="Upload"><Upload size={20} /></Link>
            </>
          )}
          <Notifications />
          <UserMenu />
        </div>
      </header>

      <aside className={`sidebar${drawer ? ' sidebar--open' : ''}`}>
        <nav className="sidebar__group">
          <NavItem to="/" end icon={Home} label="Home" isActive={(l) => l.pathname === '/' && !l.search.includes('sort=popular')} />
          <NavItem to="/subscriptions" icon={BellRing} label="Subscriptions" />
          <NavItem to="/live" icon={Radio} label="Live now" badge={liveCount} />
          <NavItem to="/?sort=popular" icon={Flame} label="Most watched" isActive={(l) => l.pathname === '/' && l.search.includes('sort=popular')} />
          <NavItem to="/family" icon={Users} label="Family" />
        </nav>

        <div className="sidebar__divider" />
        <p className="sidebar__heading">You</p>
        <nav className="sidebar__group">
          <NavItem to={`/c/${user.username}`} icon={PlaySquare} label="Your videos" />
          {canUpload && <NavItem to="/studio" icon={Clapperboard} label="Studio" />}
          {canUpload && <NavItem to="/upload" icon={Upload} label="Upload" />}
          {canUpload && <NavItem to="/go-live" icon={Radio} label="Go live" />}
          <NavItem to="/settings" icon={Settings} label="Settings" />
          {isAdmin && <NavItem to="/admin" icon={Server} label="Server admin" />}
        </nav>

        {subscribed.length > 0 && (
          <>
            <div className="sidebar__divider" />
            <p className="sidebar__heading">Subscriptions</p>
            <nav className="sidebar__group">{subscribed.map(channelLink)}</nav>
          </>
        )}

        {channels.length > 0 && (
          <>
            <div className="sidebar__divider" />
            <p className="sidebar__heading">{subscribed.length ? 'More family' : 'Family channels'}</p>
            <nav className="sidebar__group">{channels.map(channelLink)}</nav>
          </>
        )}

        <div className="sidebar__divider" />
        <p className="sidebar__foot">
          <CalendarHeart size={13} /> {user.familyName}<br />
          Private family space · KinCast
        </p>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
