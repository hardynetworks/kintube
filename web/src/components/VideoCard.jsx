import { Link } from 'react-router-dom';
import { Radio, Film } from 'lucide-react';
import { Avatar, LiveBadge } from './ui.jsx';
import { ago, count, duration } from '../format.js';

export function Thumb({ src, children, portrait, small }) {
  return (
    <div className={`thumb${portrait ? ' thumb--portrait' : ''}${small ? ' thumb--sm' : ''}`}>
      {src ? (
        <>
          {portrait && <img src={src} alt="" className="thumb__fill" aria-hidden loading="lazy" />}
          <img src={src} alt="" className="thumb__img" loading="lazy" />
        </>
      ) : (
        <div className="thumb__placeholder"><Film size={small ? 20 : 28} /></div>
      )}
      {children}
    </div>
  );
}

const meta = (v) => `${count(v.views, 'view')} · ${ago(v.createdAt)}`;

/** Grid card: thumbnail, avatar, two-line title, channel, views · age. */
export default function VideoCard({ video, hideOwner = false }) {
  return (
    <Link to={`/watch/${video.id}`} className="vcard">
      <Thumb src={video.thumbnail} portrait={video.height > video.width}>
        {video.source === 'live' && <span className="chip chip--replay"><Radio size={12} /> Replay</span>}
        <span className="chip chip--time">{duration(video.duration)}</span>
      </Thumb>
      <div className="vcard__meta">
        {!hideOwner && <Avatar user={video.owner} size={36} />}
        <div className="vcard__text">
          <h3 className="vcard__title">{video.title}</h3>
          {!hideOwner && <div className="vcard__sub">{video.owner.displayName}</div>}
          <div className="vcard__sub">{meta(video)}</div>
        </div>
      </div>
    </Link>
  );
}

/** "Up next" rail item: small thumbnail beside text. */
export function UpNextCard({ video }) {
  return (
    <Link to={`/watch/${video.id}`} className="upnext">
      <Thumb src={video.thumbnail} portrait={video.height > video.width} small>
        <span className="chip chip--time chip--sm">{duration(video.duration)}</span>
      </Thumb>
      <div className="upnext__text">
        <h3>{video.title}</h3>
        <p>{video.owner.displayName}</p>
        <p>{meta(video)}</p>
      </div>
    </Link>
  );
}

/** Search result row: wide thumbnail with description. */
export function ResultRow({ video }) {
  return (
    <Link to={`/watch/${video.id}`} className="result">
      <Thumb src={video.thumbnail} portrait={video.height > video.width}>
        <span className="chip chip--time">{duration(video.duration)}</span>
      </Thumb>
      <div className="result__text">
        <h3>{video.title}</h3>
        <p className="result__meta">{meta(video)}</p>
        <div className="result__owner">
          <Avatar user={video.owner} size={24} />
          <span>{video.owner.displayName}</span>
        </div>
        {video.description && <p className="result__desc">{video.description}</p>}
      </div>
    </Link>
  );
}

export function LiveCard({ channel }) {
  return (
    <Link to={`/live/${channel.username}`} className="vcard livecard">
      <div className="thumb livecard__stage" style={{ '--avatar': channel.avatarColor }}>
        <div className="livecard__rings" aria-hidden><span /><span /><span /></div>
        <Avatar user={channel} size={64} live />
        <span className="chip chip--live"><LiveBadge small viewers={channel.viewers} /></span>
      </div>
      <div className="vcard__meta">
        <Avatar user={channel} size={36} />
        <div className="vcard__text">
          <h3 className="vcard__title">{channel.title}</h3>
          <div className="vcard__sub">{channel.displayName}</div>
          <div className="vcard__sub vcard__sub--live">Streaming now</div>
        </div>
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
