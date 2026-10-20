import { useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

/** Let the sidebar and other views know subscriptions changed. */
export const SUBS_EVENT = 'kc:subscriptions-changed';

export function subscriberLabel(n) {
  return `${(n ?? 0).toLocaleString()} subscriber${n === 1 ? '' : 's'}`;
}

/**
 * Design's Subscribe pill: white "Subscribe" → grey "Subscribed".
 * Hidden on your own channel. Calls onChange({ subscribed, subscribers }).
 */
export default function SubscribeButton({ username, subscribed, onChange, size = 'sm' }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!username || username === user.username) return null;

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      const d = await api(`/subscriptions/${username}`, { method: subscribed ? 'DELETE' : 'PUT' });
      onChange?.(d);
      window.dispatchEvent(new CustomEvent(SUBS_EVENT));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`btn btn--${size} ${subscribed ? 'btn--ghost' : 'btn--primary'} subscribe`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={subscribed}
      title={subscribed ? 'Unsubscribe' : 'Get notified when they upload or go live'}
    >
      {subscribed ? <><BellRing size={15} /> Subscribed</> : <><Bell size={15} /> Subscribe</>}
    </button>
  );
}
