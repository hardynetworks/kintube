import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Radio, Upload } from 'lucide-react';
import { api } from '../api.js';
import { Avatar } from './ui.jsx';
import { ago } from '../format.js';

/** Header bell: unread badge + dropdown of uploads / go-lives from channels you follow. */
export default function Notifications() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, notifications: [] });

  const load = useCallback(() => api('/notifications').then(setData).catch(() => {}), []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open, load]);

  async function openItem(n) {
    setOpen(false);
    if (!n.read) {
      setData((d) => ({
        unread: Math.max(0, d.unread - 1),
        notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      }));
      api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
    }
    nav(n.link);
  }

  async function markAll() {
    setData((d) => ({ unread: 0, notifications: d.notifications.map((x) => ({ ...x, read: true })) }));
    await api('/notifications/read', { method: 'POST', body: {} }).catch(() => {});
  }

  return (
    <div className="menu" onClick={(e) => e.stopPropagation()}>
      <button
        className="icon-btn icon-btn--round bell"
        onClick={() => setOpen((o) => !o)}
        aria-label={data.unread ? `Notifications, ${data.unread} unread` : 'Notifications'}
      >
        <Bell size={20} />
        {data.unread > 0 && <span className="bell__badge">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="menu__panel notif">
          <div className="notif__head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button className="link-btn" onClick={markAll}>Mark all as read</button>}
          </div>
          <div className="notif__list">
            {data.notifications.length === 0 ? (
              <div className="notif__empty">
                <Bell size={28} />
                <p>Subscribe to family members to hear when they upload or go live.</p>
              </div>
            ) : data.notifications.map((n) => (
              <button key={n.id} className={`notif__item${n.read ? '' : ' notif__item--unread'}`} onClick={() => openItem(n)}>
                <span className="notif__dot" aria-hidden />
                <Avatar user={n.actor} size={40} live={n.stillLive} />
                <span className="notif__text">
                  <span className="notif__msg">
                    {n.type === 'live'
                      ? <><b>{n.actor.displayName}</b> {n.stillLive ? 'is live' : 'was live'}: {n.title}</>
                      : <><b>{n.actor.displayName}</b> uploaded: {n.title}</>}
                  </span>
                  <span className="notif__time">
                    {n.type === 'live' ? <Radio size={12} /> : <Upload size={12} />} {ago(n.createdAt)}
                  </span>
                </span>
                {n.thumbnail && <img className="notif__thumb" src={n.thumbnail} alt="" loading="lazy" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
