import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarHeart, Film, Upload, SearchX } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import VideoCard, { LiveCard, ResultRow } from '../components/VideoCard.jsx';
import { yearsAgo } from '../format.js';

const BASE_CHIPS = [
  { key: 'all', label: 'All', query: 'sort=latest' },
  { key: 'live', label: 'Live & replays', query: 'source=live' },
  { key: 'filmed', label: 'Recently filmed', query: 'sort=filmed' },
  { key: 'popular', label: 'Most watched', query: 'sort=popular' },
  { key: 'oldest', label: 'Oldest uploads', query: 'sort=oldest' },
];

function SearchResults({ q }) {
  const [videos, setVideos] = useState(null);
  useEffect(() => {
    setVideos(null);
    api(`/videos?limit=60&q=${encodeURIComponent(q)}`).then((d) => setVideos(d.videos));
  }, [q]);
  if (!videos) return <div className="center pad"><Spinner /></div>;
  return (
    <div className="results">
      <p className="results__count">{videos.length} result{videos.length === 1 ? '' : 's'} for “{q}”</p>
      {videos.length ? (
        <div className="results__list">{videos.map((v) => <ResultRow key={v.id} video={v} />)}</div>
      ) : (
        <Empty icon={SearchX} title="No videos found">Try a different name or word.</Empty>
      )}
    </div>
  );
}

export default function Home() {
  const { canUpload } = useAuth();
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [chip, setChip] = useState(params.get('sort') === 'popular' ? 'popular' : 'all');
  const [members, setMembers] = useState([]);
  const [videos, setVideos] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [live, setLive] = useState([]);
  const [memories, setMemories] = useState([]);

  useEffect(() => {
    setChip(params.get('sort') === 'popular' ? 'popular' : 'all');
  }, [params]);

  const following = members.some((m) => m.subscribed);
  const chips = useMemo(() => [
    BASE_CHIPS[0],
    ...(following ? [{ key: 'subs', label: 'Subscriptions', query: 'subscribed=1' }] : []),
    ...BASE_CHIPS.slice(1),
    ...(memories.length ? [{ key: 'memories', label: 'On this day' }] : []),
    ...members
      .filter((m) => m.videoCount > 0)
      .map((m) => ({ key: `u:${m.username}`, label: m.displayName, query: `user=${encodeURIComponent(m.username)}` })),
  ], [members, memories.length, following]);
  const active = chips.find((c) => c.key === chip) || BASE_CHIPS[0];

  useEffect(() => {
    let alive = true;
    const loadLive = () => api('/live').then((d) => alive && setLive(d.channels)).catch(() => {});
    loadLive();
    api('/videos/on-this-day').then((d) => alive && setMemories(d.videos)).catch(() => {});
    api('/family/members').then((d) => alive && setMembers(d.members)).catch(() => {});
    const t = setInterval(loadLive, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (q || active.key === 'memories') return;
    let alive = true;
    setVideos(null);
    api(`/videos?limit=24&offset=0&${active.query}`).then((d) => {
      if (!alive) return;
      setVideos(d.videos);
      setHasMore(d.hasMore);
    });
    return () => { alive = false; };
  }, [q, active.key, active.query]);

  async function more() {
    setLoadingMore(true);
    const d = await api(`/videos?limit=24&offset=${videos.length}&${active.query}`);
    setVideos([...videos, ...d.videos]);
    setHasMore(d.hasMore);
    setLoadingMore(false);
  }

  if (q) return <SearchResults q={q} />;

  const subscribedIds = new Set(members.filter((m) => m.subscribed).map((m) => m.id));
  const showLive = active.key === 'all' || active.key === 'live' || active.key === 'subs';
  const liveCards = active.key === 'subs' ? live.filter((c) => subscribedIds.has(c.id)) : live;
  const list = active.key === 'memories' ? memories : videos;

  return (
    <div>
      <div className="chips" role="tablist" aria-label="Filter videos">
        {chips.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={c.key === active.key}
            className={`chip-btn${c.key === active.key ? ' chip-btn--on' : ''}`}
            onClick={() => setChip(c.key)}
          >
            {c.key === 'memories' && <CalendarHeart size={14} />}
            {c.label}
          </button>
        ))}
      </div>

      <div className="feed">
        {list === null ? (
          <div className="center pad"><Spinner /></div>
        ) : list.length === 0 && !(showLive && liveCards.length) ? (
          <Empty
            icon={Film}
            title={active.key === 'all' ? 'No videos yet' : 'Nothing here yet'}
            action={active.key === 'all' && canUpload && <Link to="/upload" className="btn btn--primary"><Upload size={16} /> Upload the first one</Link>}
          >
            {active.key === 'all' ? 'Home videos your family shares will show up here.' : 'Try another filter.'}
          </Empty>
        ) : (
          <>
            <div className="grid">
              {showLive && liveCards.map((c) => <LiveCard key={`live-${c.id}`} channel={c} />)}
              {list.map((v) => (
                <div key={v.id} className="grid__cell">
                  {active.key === 'memories' && <span className="memory-tag">{yearsAgo(v.filmedOn)}</span>}
                  <VideoCard video={v} />
                </div>
              ))}
            </div>
            {hasMore && active.key !== 'memories' && (
              <div className="center pad">
                <button className="btn btn--ghost" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
