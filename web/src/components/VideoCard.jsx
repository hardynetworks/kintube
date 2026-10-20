import { Link } from 'react-router-dom';
import { Radio, Film } from 'lucide-react';
import { Avatar, LiveBadge } from './ui.jsx';
import { ago, count, duration } from '../format.js';

export function Thumb({ src, children, portrait }) {
  return (
    <div className={`thumb${portrait ? ' thumb--portrait' : ''}`}>
      {src ? (
        <>
          {portrait && <img src={src} alt="" className="thumb__fill" aria-hidden loading="lazy" />}
          <img src={src} alt="" className="thumb__img" loading="lazy" />
        </>
      ) : (
        <div className="thumb__placeholder"><Film size={28} /></div>
      )}
      {children}
    </div>
  );
}

export default function VideoCard({ video, compact = false, hideOwner = false }) {
  const portrait = video.height > video.width;
  return (
    <Link to={`/watch/${video.id}`} className={`vcard${compact ? ' vcard--compact' : ''}`}>
      <Thumb src={video.thumbnail} portrait={portrait}>
        <span className="chip chip--time">{duration(video.duration)}</span>
        {video.source === 'live' && <span className="chip chip--replay"><Radio size={12} /> Replay</span>}
      </Thumb>
      <div className="vcard__meta">
        {!hideOwner && !compact && <Avatar user={video.owner} size={34} />}
        <div className="vcard__text">
          <h3 className="vcard__title">{video.title}</h3>
          {!hideOwner && <div className="vcard__sub">{video.owner.displayName}</div>}
          <div className="vcard__sub">
            {count(video.views, 'view')} · {ago(video.createdAt)}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function LiveCard({ channel, big }) {
  return (
    <Link to={`/live/${channel.username}`} className={`livecard${big ? ' livecard--big' : ''}`}>
      <div className="livecard__stage" style={{ '--avatar': channel.avatarColor }}>
        <div className="livecard__rings" aria-hidden><span /><span /><span /></div>
        <Avatar user={channel} size={big ? 88 : 64} live />
        <LiveBadge viewers={channel.viewers} />
      </div>
      <div className="livecard__meta">
        <h3>{channel.title}</h3>
        <span>{channel.displayName}</span>
      </div>
    </Link>
  );
}

export function VideoGrid({ videos, hideOwner }) {
  return (
    <div className="grid">
      {videos.map((v) => <VideoCard key={v.id} video={v} hideOwner={hideOwner} />)}
    </div>
  );
}
