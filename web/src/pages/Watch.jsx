import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Heart, Download, Pencil, Trash2, CalendarDays, Radio, Loader, Send } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Player from '../components/Player.jsx';
import VideoCard from '../components/VideoCard.jsx';
import EditVideo from '../components/EditVideo.jsx';
import { Avatar, Empty, ErrorNote, Spinner } from '../components/ui.jsx';
import { ago, count, filmed } from '../format.js';

function Comments({ videoId }) {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/videos/${videoId}/comments`).then((d) => setList(d.comments));
  }, [videoId]);

  async function post(e) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      const { comment } = await api(`/videos/${videoId}/comments`, { method: 'POST', body: { body } });
      setList([comment, ...list]);
      setBody('');
      setError(null);
    } catch (err) {
      setError(err);
    }
  }

  async function remove(id) {
    await api(`/videos/${videoId}/comments/${id}`, { method: 'DELETE' });
    setList(list.filter((c) => c.id !== id));
  }

  return (
    <section className="comments">
      <h3 className="h3">{list ? count(list.length, 'comment') : 'Comments'}</h3>
      <form className="comment-form" onSubmit={post}>
        <Avatar user={user} size={36} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Say something nice…"
          rows={1}
          maxLength={2000}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) post(e); }}
        />
        <button className="icon-btn icon-btn--accent" aria-label="Post comment" disabled={!body.trim()}><Send size={18} /></button>
      </form>
      <ErrorNote error={error} />
      {list?.map((c) => (
        <div key={c.id} className="comment">
          <Avatar user={c.author} size={34} />
          <div className="comment__body">
            <div className="comment__head">
              <Link to={`/c/${c.author.username}`}>{c.author.displayName}</Link>
              <span>{ago(c.createdAt)}</span>
              {c.canDelete && (
                <button className="link-btn" onClick={() => remove(c.id)} aria-label="Delete comment"><Trash2 size={14} /></button>
              )}
            </div>
            <p>{c.body}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

export default function Watch() {
  const { id } = useParams();
  const nav = useNavigate();
  const [video, setVideo] = useState(null);
  const [error, setError] = useState(null);
  const [more, setMore] = useState([]);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const viewed = useRef(false);

  useEffect(() => {
    let alive = true;
    let poll;
    setVideo(null);
    setError(null);
    viewed.current = false;
    const load = () =>
      api(`/videos/${id}`).then((d) => {
        if (!alive) return;
        setVideo(d.video);
        if (d.video.status === 'queued' || d.video.status === 'processing') poll = setTimeout(load, 4000);
      }).catch((e) => alive && setError(e));
    load();
    api(`/videos?limit=12&exclude=${id}`).then((d) => alive && setMore(d.videos)).catch(() => {});
    window.scrollTo(0, 0);
    return () => { alive = false; clearTimeout(poll); };
  }, [id]);

  if (error) return <div className="page"><Empty title="Video not found">{error.message}</Empty></div>;
  if (!video) return <div className="page center pad"><Spinner /></div>;

  const ready = video.status === 'ready';
  const portrait = video.height > video.width;

  async function toggleLike() {
    const d = await api(`/videos/${video.id}/like`, { method: video.liked ? 'DELETE' : 'PUT' });
    setVideo({ ...video, liked: d.liked, likes: d.likes });
  }

  async function remove() {
    if (!confirm(`Delete “${video.title}”? This can't be undone.`)) return;
    await api(`/videos/${video.id}`, { method: 'DELETE' });
    nav('/studio');
  }

  const desc = video.description || '';
  const longDesc = desc.length > 240 || desc.split('\n').length > 3;

  return (
    <div className="watch">
      <div className="watch__main">
        {ready ? (
          <Player
            src={video.hls}
            poster={video.thumbnail}
            portrait={portrait}
            onPlay={() => {
              if (viewed.current) return;
              viewed.current = true;
              api(`/videos/${video.id}/view`, { method: 'POST' }).catch(() => {});
            }}
          />
        ) : (
          <div className="player player--status">
            {video.status === 'failed' ? (
              <div className="processing">
                <h3>Processing failed</h3>
                <ErrorNote error={video.error} />
              </div>
            ) : (
              <div className="processing">
                <Loader className="spin" size={28} />
                <h3>{video.status === 'queued' ? 'Waiting to process…' : `Processing · ${video.progress}%`}</h3>
                <div className="bar"><div className="bar__fill" style={{ width: `${video.progress}%` }} /></div>
                <p>We're making this video play smoothly on every device. This page updates on its own.</p>
              </div>
            )}
          </div>
        )}

        <h1 className="watch__title">{video.title}</h1>
        <div className="watch__bar">
          <Link to={`/c/${video.owner.username}`} className="owner">
            <Avatar user={video.owner} size={40} />
            <div>
              <strong>{video.owner.displayName}</strong>
              <span>{count(video.views, 'view')} · {ago(video.createdAt)}</span>
            </div>
          </Link>
          <div className="watch__actions">
            <button className={`pill${video.liked ? ' pill--on' : ''}`} onClick={toggleLike} disabled={!ready}>
              <Heart size={17} fill={video.liked ? 'currentColor' : 'none'} /> {video.likes}
            </button>
            {video.hasOriginal && ready && (
              <a className="pill" href={`/api/videos/${video.id}/download`}><Download size={17} /> Original</a>
            )}
            {video.canEdit && (
              <>
                <button className="pill" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
                <button className="pill pill--danger" onClick={remove} aria-label="Delete"><Trash2 size={16} /></button>
              </>
            )}
          </div>
        </div>

        <div className="desc">
          <div className="desc__meta">
            {video.filmedOn && <span><CalendarDays size={15} /> Filmed {filmed(video.filmedOn)}</span>}
            {video.source === 'live' && <span><Radio size={15} /> Live stream replay</span>}
          </div>
          {desc ? (
            <>
              <p className={`desc__text${longDesc && !expanded ? ' desc__text--clamp' : ''}`}>{desc}</p>
              {longDesc && <button className="link-btn" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show more'}</button>}
            </>
          ) : (
            <p className="muted">No description.</p>
          )}
        </div>

        {ready && <Comments videoId={video.id} />}
      </div>

      <aside className="watch__side">
        <h3 className="h3">More from the family</h3>
        <div className="stack">
          {more.map((v) => <VideoCard key={v.id} video={v} compact />)}
          {!more.length && <p className="muted">Nothing else yet.</p>}
        </div>
      </aside>

      {editing && <EditVideo video={video} onClose={() => setEditing(false)} onSaved={setVideo} />}
    </div>
  );
}
