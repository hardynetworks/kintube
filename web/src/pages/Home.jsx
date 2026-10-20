import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarHeart, Film, Upload, SearchX } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import VideoCard, { LiveCard, VideoGrid } from '../components/VideoCard.jsx';
import { yearsAgo } from '../format.js';

const SORTS = [
  ['latest', 'Latest'],
  ['filmed', 'By date filmed'],
  ['popular', 'Most watched'],
];

export default function Home() {
  const { user, canUpload } = useAuth();
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [sort, setSort] = useState('latest');
  const [videos, setVideos] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [live, setLive] = useState([]);
  const [memories, setMemories] = useState([]);

  const query = (offset) =>
    api(`/videos?limit=24&offset=${offset}&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ''}`);

  useEffect(() => {
    let alive = true;
    setVideos(null);
    query(0).then((d) => {
      if (!alive) return;
      setVideos(d.videos);
      setHasMore(d.hasMore);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort]);

  useEffect(() => {
    if (q) return;
    let alive = true;
    const loadLive = () => api('/live').then((d) => alive && setLive(d.channels)).catch(() => {});
    loadLive();
    api('/videos/on-this-day').then((d) => alive && setMemories(d.videos)).catch(() => {});
    const t = setInterval(loadLive, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [q]);

  async function more() {
    setLoadingMore(true);
    const d = await query(videos.length);
    setVideos([...videos, ...d.videos]);
    setHasMore(d.hasMore);
    setLoadingMore(false);
  }

  return (
    <div className="page">
      {q ? (
        <div className="page__head">
          <h1 className="h1">Results for “{q}”</h1>
        </div>
      ) : (
        <>
          <div className="hero">
            <div>
              <span className="eyebrow">{user.familyName}</span>
              <h1 className="hero__title">Hey {user.displayName.split(' ')[0]}, <span className="grad">what's new?</span></h1>
            </div>
          </div>

          {live.length > 0 && (
            <section className="section">
              <h2 className="h2"><span className="dot-live" /> Live right now</h2>
              <div className="live-row">
                {live.map((c) => <LiveCard key={c.id} channel={c} big={live.length === 1} />)}
              </div>
            </section>
          )}

          {memories.length > 0 && (
            <section className="section">
              <h2 className="h2"><CalendarHeart size={20} className="h2__icon" /> On this day</h2>
              <div className="scroller">
                {memories.map((v) => (
                  <div key={v.id} className="scroller__item">
                    <span className="memory-tag">{yearsAgo(v.filmedOn)}</span>
                    <VideoCard video={v} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="section">
        <div className="section__head">
          {!q && <h2 className="h2">Family videos</h2>}
          <div className="tabs" role="tablist">
            {SORTS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={sort === k} className={`tab${sort === k ? ' tab--on' : ''}`} onClick={() => setSort(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {videos === null ? (
          <div className="center pad"><Spinner /></div>
        ) : videos.length === 0 ? (
          q ? (
            <Empty icon={SearchX} title="No videos found">Try a different name or word.</Empty>
          ) : (
            <Empty
              icon={Film}
              title="No videos yet"
              action={canUpload && <Link to="/upload" className="btn btn--primary"><Upload size={16} /> Upload the first one</Link>}
            >
              Home videos your family shares will show up here.
            </Empty>
          )
        ) : (
          <>
            <VideoGrid videos={videos} />
            {hasMore && (
              <div className="center pad">
                <button className="btn btn--ghost" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
