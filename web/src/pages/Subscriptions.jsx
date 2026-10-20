import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Empty, Spinner } from '../components/ui.jsx';
import VideoCard, { LiveCard } from '../components/VideoCard.jsx';
import SubscribeButton, { SUBS_EVENT, subscriberLabel } from '../components/Subscribe.jsx';

function Suggestions({ onChange }) {
  const { user } = useAuth();
  const [members, setMembers] = useState(null);
  useEffect(() => {
    api('/family/members').then((d) => setMembers(d.members.filter((m) => m.id !== user.id && !m.subscribed)));
  }, [user.id]);
  if (!members?.length) return null;
  return (
    <div className="suggest">
      {members.map((m) => (
        <div key={m.id} className="suggest__item">
          <Link to={`/c/${m.username}`} className="suggest__who">
            <Avatar user={m} size={56} live={m.isLive} />
            <strong>{m.displayName}</strong>
            <span>{m.videoCount} video{m.videoCount === 1 ? '' : 's'} · {subscriberLabel(m.subscribers)}</span>
          </Link>
          <SubscribeButton username={m.username} subscribed={false} onChange={onChange} />
        </div>
      ))}
    </div>
  );
}

export default function Subscriptions() {
  const [channels, setChannels] = useState(null);
  const [videos, setVideos] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [live, setLive] = useState([]);

  const load = useCallback(async () => {
    const [subs, feed, liveNow] = await Promise.all([
      api('/subscriptions'),
      api('/videos?subscribed=1&limit=24'),
      api('/live'),
    ]);
    const ids = new Set(subs.channels.map((c) => c.id));
    setChannels(subs.channels);
    setVideos(feed.videos);
    setHasMore(feed.hasMore);
    setLive(liveNow.channels.filter((c) => ids.has(c.id)));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(SUBS_EVENT, load);
    return () => window.removeEventListener(SUBS_EVENT, load);
  }, [load]);

  async function more() {
    const d = await api(`/videos?subscribed=1&limit=24&offset=${videos.length}`);
    setVideos([...videos, ...d.videos]);
    setHasMore(d.hasMore);
  }

  if (channels === null) return <div className="page center pad"><Spinner /></div>;

  if (channels.length === 0) {
    return (
      <div className="page">
        <Empty icon={BellRing} title="Follow your family">
          Subscribe to family members to get their videos here and a notification when they upload or go live.
        </Empty>
        <Suggestions onChange={load} />
      </div>
    );
  }

  return (
    <div>
      <div className="subs-strip">
        {channels.map((c) => (
          <Link key={c.id} to={c.isLive ? `/live/${c.username}` : `/c/${c.username}`} className="subs-strip__item" title={c.displayName}>
            <Avatar user={c} size={56} live={c.isLive} />
            <span>{c.displayName}</span>
          </Link>
        ))}
        <Link to="/family" className="subs-strip__manage">Manage</Link>
      </div>

      <div className="feed">
        <h1 className="h2">Latest from your subscriptions</h1>
        {videos.length === 0 && live.length === 0 ? (
          <Empty title="Nothing new yet">The people you follow haven't shared any videos yet.</Empty>
        ) : (
          <div className="grid">
            {live.map((c) => <LiveCard key={`live-${c.id}`} channel={c} />)}
            {videos.map((v) => <VideoCard key={v.id} video={v} />)}
          </div>
        )}
        {hasMore && <div className="center pad"><button className="btn btn--ghost" onClick={more}>Show more</button></div>}

        <h2 className="h2 subs-more">More family to follow</h2>
        <Suggestions onChange={load} />
      </div>
    </div>
  );
}
