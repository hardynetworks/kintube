import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Send, Users, Clock, Radio } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Player from '../components/Player.jsx';
import { Avatar, Empty, LiveBadge, Spinner } from '../components/ui.jsx';
import { elapsed } from '../format.js';
import SubscribeButton from '../components/Subscribe.jsx';

function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Chat({ username, messages, onSend }) {
  const [body, setBody] = useState('');
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages.length]);

  return (
    <div className="chat">
      <div className="chat__head">Family chat</div>
      <div className="chat__list">
        {messages.length === 0 && <p className="chat__empty">Say hi to {username}! 👋</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat__msg">
            <Avatar user={m.author} size={24} />
            <p><strong style={{ color: m.author.avatarColor }}>{m.author.displayName}</strong> {m.body}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          onSend(body);
          setBody('');
        }}
      >
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Send a message" maxLength={500} />
        <button className="icon-btn icon-btn--accent" aria-label="Send" disabled={!body.trim()}><Send size={17} /></button>
      </form>
    </div>
  );
}

export default function Live() {
  const { username } = useParams();
  const { user } = useAuth();
  const [channel, setChannel] = useState(null);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [viewers, setViewers] = useState(0);
  useTick(1000);

  useEffect(() => {
    let alive = true;
    setChannel(null);
    api(`/live/channel/${username}`).then((d) => {
      if (!alive) return;
      setChannel(d.channel);
      setViewers(d.channel.viewers);
    }).catch((e) => alive && setError(e));
    api(`/live/channel/${username}/chat`).then((d) => alive && setMessages(d.messages)).catch(() => {});

    const es = new EventSource(`/api/live/channel/${username}/events`);
    es.addEventListener('chat', (e) => {
      const m = JSON.parse(e.data);
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list.slice(-199), m]));
    });
    es.addEventListener('viewers', (e) => setViewers(JSON.parse(e.data).count));
    es.addEventListener('title', (e) => setChannel((c) => c && { ...c, title: JSON.parse(e.data).title }));
    es.addEventListener('status', () => {
      // Refetch so we get the playback URL / start time.
      api(`/live/channel/${username}`).then((d) => alive && setChannel(d.channel)).catch(() => {});
    });
    return () => { alive = false; es.close(); };
  }, [username]);

  async function send(body) {
    const { message } = await api(`/live/channel/${username}/chat`, { method: 'POST', body: { body } });
    setMessages((list) => (list.some((x) => x.id === message.id) ? list : [...list, message]));
  }

  if (error) return <div className="page"><Empty title="Channel not found">{error.message}</Empty></div>;
  if (!channel) return <div className="page center pad"><Spinner /></div>;

  const isMe = user.username === channel.username;

  return (
    <div className="live">
      <div className="live__main">
        {channel.isLive ? (
          <Player key={channel.hls} src={channel.hls} live autoPlay />
        ) : (
          <div className="player player--offline" style={{ '--avatar': channel.avatarColor }}>
            <div className="offline">
              <Avatar user={channel} size={84} />
              <h3>{channel.displayName} is offline</h3>
              <p>This page will start playing automatically when they go live.</p>
              <Link to={`/c/${channel.username}`} className="btn btn--ghost btn--sm">See their videos</Link>
            </div>
          </div>
        )}
        <div className="live__info">
          <Avatar user={channel} size={48} live={channel.isLive} />
          <div className="live__text">
            <h1 className="watch__title">{channel.title}</h1>
            <div className="live__stats">
              <Link to={`/c/${channel.username}`}>{channel.displayName}</Link>
              {channel.isLive && (
                <>
                  <LiveBadge small />
                  <span><Users size={14} /> {viewers} watching</span>
                  {channel.startedAt && <span className="mono"><Clock size={14} /> {elapsed(channel.startedAt)}</span>}
                </>
              )}
            </div>
          </div>
          {isMe ? (
            <Link to="/go-live" className="btn btn--ghost btn--sm"><Radio size={15} /> Stream settings</Link>
          ) : (
            <SubscribeButton
              username={channel.username}
              subscribed={channel.subscribed}
              onChange={(d) => setChannel((c) => ({ ...c, subscribed: d.subscribed, subscribers: d.subscribers }))}
            />
          )}
        </div>
      </div>
      <Chat username={channel.displayName} messages={messages} onSend={send} />
    </div>
  );
}
