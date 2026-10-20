import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Film } from 'lucide-react';
import { api } from '../api.js';
import { Avatar, Empty, LiveBadge, Spinner } from '../components/ui.jsx';
import { VideoGrid } from '../components/VideoCard.jsx';
import SubscribeButton, { subscriberLabel } from '../components/Subscribe.jsx';

export default function Channel() {
  const { username } = useParams();
  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setChannel(null);
    setVideos(null);
    api(`/live/channel/${username}`).then((d) => setChannel(d.channel)).catch(setError);
    api(`/videos?user=${encodeURIComponent(username)}&limit=60`).then((d) => setVideos(d.videos));
  }, [username]);

  if (error) return <div className="page"><Empty title="Channel not found">{error.message}</Empty></div>;
  if (!channel) return <div className="page center pad"><Spinner /></div>;

  return (
    <div className="page">
      <div className="banner" style={{ '--avatar': channel.avatarColor }}>
        <div className="banner__grid" aria-hidden />
        <div className="banner__body">
          <Avatar user={channel} size={92} live={channel.isLive} />
          <div>
            <h1 className="h1">{channel.displayName}</h1>
            <p className="muted">
              @{channel.username} · {subscriberLabel(channel.subscribers)} · {videos ? `${videos.length} video${videos.length === 1 ? '' : 's'}` : '…'}
            </p>
          </div>
          <SubscribeButton
            username={channel.username}
            subscribed={channel.subscribed}
            size="md"
            onChange={(d) => setChannel((c) => ({ ...c, subscribed: d.subscribed, subscribers: d.subscribers }))}
          />
          {channel.isLive && (
            <Link to={`/live/${channel.username}`} className="btn btn--live"><LiveBadge small /> Watch live</Link>
          )}
        </div>
      </div>
      {videos === null ? (
        <div className="center pad"><Spinner /></div>
      ) : videos.length ? (
        <VideoGrid videos={videos} hideOwner />
      ) : (
        <Empty icon={Film} title="No videos yet">{channel.displayName} hasn't shared any videos.</Empty>
      )}
    </div>
  );
}
