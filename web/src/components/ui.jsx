import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';

export function Logo({ height = 30, to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="KinCast home">
      <img src="/kincast-logo-dark.svg" alt="KinCast" style={{ height }} />
    </Link>
  );
}

export function Avatar({ user, size = 36, live = false }) {
  const name = user?.displayName || '?';
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      className={`avatar${live ? ' avatar--live' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38, '--avatar': user?.avatarColor || '#6366F1' }}
      title={name}
    >
      {initials}
    </span>
  );
}

export function Spinner({ size = 22 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function Splash() {
  return (
    <div className="splash">
      <img src="/kincast-mark.svg" alt="" width="72" height="72" className="splash__mark" />
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty__icon"><Icon size={28} /></div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function LiveBadge({ viewers, small }) {
  return (
    <span className={`live-badge${small ? ' live-badge--sm' : ''}`}>
      <span className="live-badge__dot" />
      LIVE{viewers != null && <span className="live-badge__count">{viewers}</span>}
    </span>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="note note--error" role="alert">{String(error.message || error)}</div>;
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = async (text, key = text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  };
  return [copied, copy];
}

export function AuthShell({ children, wide }) {
  return (
    <div className="auth">
      <div className="auth__glow" aria-hidden />
      <div className={`auth__card${wide ? ' auth__card--wide' : ''}`}>
        <div className="auth__logo"><img src="/kincast-logo-dark.svg" alt="KinCast" /></div>
        {children}
      </div>
      <p className="auth__foot">Private to your family · Self-hosted</p>
    </div>
  );
}
