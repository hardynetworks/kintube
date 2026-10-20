import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Pencil, Trash2, RotateCcw, Eye, Heart, MessageCircle, Radio, Clapperboard } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Spinner } from '../components/ui.jsx';
import { Thumb } from '../components/VideoCard.jsx';
import EditVideo from '../components/EditVideo.jsx';
import { ago, duration, filmed } from '../format.js';

const STATUS = {
  queued: 'Waiting',
  processing: 'Processing',
  ready: 'Published',
  failed: 'Failed',
};

export default function Studio() {
  const [videos, setVideos] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    let alive = true;
    let t;
    const load = () =>
      api('/videos/mine').then((d) => {
        if (!alive) return;
        setVideos(d.videos);
        if (d.videos.some((v) => v.status === 'queued' || v.status === 'processing')) t = setTimeout(load, 3000);
      });
    load();
    return () => { alive = false; clearTimeout(t); };
  }, []);

  async function remove(v) {
    if (!confirm(`Delete “${v.title}”? This can't be undone.`)) return;
    await api(`/videos/${v.id}`, { method: 'DELETE' });
    setVideos(videos.filter((x) => x.id !== v.id));
  }

  async function retry(v) {
    await api(`/videos/${v.id}/retry`, { method: 'POST' });
    setVideos(videos.map((x) => (x.id === v.id ? { ...x, status: 'queued', error: null } : x)));
  }

  const totals = (videos || []).reduce((a, v) => ({ views: a.views + v.views, likes: a.likes + v.likes }), { views: 0, likes: 0 });

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1">Studio</h1>
        <div className="row gap">
          <Link to="/go-live" className="btn btn--ghost btn--sm"><Radio size={16} /> Go live</Link>
          <Link to="/upload" className="btn btn--primary btn--sm"><Upload size={16} /> Upload</Link>
        </div>
      </div>

      {videos && videos.length > 0 && (
        <div className="stats">
          <div className="stat"><span className="stat__n">{videos.length}</span><span>videos</span></div>
          <div className="stat"><span className="stat__n">{totals.views}</span><span>views</span></div>
          <div className="stat"><span className="stat__n">{totals.likes}</span><span>likes</span></div>
        </div>
      )}

      {videos === null ? (
        <div className="center pad"><Spinner /></div>
      ) : videos.length === 0 ? (
        <Empty icon={Clapperboard} title="Your studio is empty" action={<Link to="/upload" className="btn btn--primary"><Upload size={16} /> Upload a video</Link>}>
          Videos you upload or stream will appear here so you can manage them.
        </Empty>
      ) : (
        <div className="table">
          {videos.map((v) => (
            <div key={v.id} className="trow">
              <Link to={`/watch/${v.id}`} className="trow__thumb">
                <Thumb src={v.thumbnail} portrait={v.height > v.width}>
                  {v.duration ? <span className="chip chip--time">{duration(v.duration)}</span> : null}
                </Thumb>
              </Link>
              <div className="trow__main">
                <Link to={`/watch/${v.id}`} className="trow__title">{v.title}</Link>
                <div className="trow__sub">
                  {v.source === 'live' && <span className="tag"><Radio size={12} /> Replay</span>}
                  <span>Uploaded {ago(v.createdAt)}</span>
                  {v.filmedOn && <span>· Filmed {filmed(v.filmedOn)}</span>}
                </div>
                {(v.status === 'processing' || v.status === 'queued') && (
                  <div className="bar bar--sm"><div className="bar__fill" style={{ width: `${v.progress}%` }} /></div>
                )}
                {v.status === 'failed' && <div className="text-danger small">{v.error}</div>}
              </div>
              <span className={`status status--${v.status}`}>
                {STATUS[v.status]}{v.status === 'processing' ? ` ${v.progress}%` : ''}
              </span>
              <div className="trow__stats">
                <span><Eye size={14} /> {v.views}</span>
                <span><Heart size={14} /> {v.likes}</span>
                <span><MessageCircle size={14} /> {v.comments}</span>
              </div>
              <div className="trow__actions">
                {v.status === 'failed' && <button className="icon-btn" onClick={() => retry(v)} title="Retry"><RotateCcw size={17} /></button>}
                <button className="icon-btn" onClick={() => setEditing(v)} title="Edit"><Pencil size={17} /></button>
                <button className="icon-btn icon-btn--danger" onClick={() => remove(v)} title="Delete"><Trash2 size={17} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <EditVideo
          video={editing}
          onClose={() => setEditing(null)}
          onSaved={(nv) => setVideos(videos.map((x) => (x.id === nv.id ? nv : x)))}
        />
      )}
    </div>
  );
}
