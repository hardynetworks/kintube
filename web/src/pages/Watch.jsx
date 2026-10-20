import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ThumbsUp, Download, Pencil, Trash2, Share2, Check, Radio, Loader } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Player from '../components/Player.jsx';
import { UpNextCard } from '../components/VideoCard.jsx';
import SubscribeButton, { subscriberLabel } from '../components/Subscribe.jsx';
import EditVideo from '../components/EditVideo.jsx';
import { Avatar, Empty, ErrorNote, Spinner, useCopy } from '../components/ui.jsx';
import { ago, count, filmed } from '../format.js';

function Comments({ videoId }) {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [body, setBody] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/videos/${videoId}/comments`).then((d) => setList(d.comments));
  }, [videoId]);

  async function post(e) {
    e?.preventDefault();
    if (!body.trim()) return;
    try {
      const { comment } = await api(`/videos/${videoId}/comments`, { method: 'POST', body: { body } });
      setList([comment, ...list]);
      setBody('');
      setFocused(false);
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
      <h2 className="comments__title">{list ? `${list.length.toLocaleString()} Comment${list.length === 1 ? '' : 's'}` : 'Comments'}</h2>
      <form className="comment-form" onSubmit={post}>
        <Avatar user={user} size={32} />
        <div className="comment-form__body">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Add a comment..."
            maxLength={2000}
            aria-label="Add a comment"
          />
          {(focused || body) && (
            <div className="comment-form__actions">
              <button type="button" className="btn btn--text btn--sm" onClick={() => { setBody(''); setFocused(false); }}>Cancel</button>
              <button className="btn btn--primary btn--sm" disabled={!body.trim()}>Comment</button>
            </div>
          )}
        </div>
      </form>
      <ErrorNote error={error} />
      {list?.map((c) => (
        <div key={c.id} className="comment">
          <Avatar user={c.author} size={32} />
          <div className="comment__body">
            <div className="comment__head">
              <Link to={`/c/${c.author.username}`}>@{c.author.username}</Link>
              <span>{ago(c.createdAt)}</span>
            </div>
            <p>{c.body}</p>
            {c.canDelete && (
              <div className="comment__actions">
                <button className="link-btn" onClick={() => remove(c.id)}><Trash2 size={12} /> Delete</button>
              </div>
            )}
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
  const [copied, copy] = useCopy();
  const viewed = useRef(false);

  useEffect(() => {
    let alive = true;
    let poll;
    setVideo(null);
    setError(null);
    setExpanded(false);
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
            portrait={video.height > video.width}
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
          <div className="owner">
            <Link to={`/c/${video.owner.username}`}><Avatar user={video.owner} size={40} /></Link>
            <div className="owner__text">
              <Link to={`/c/${video.owner.username}`} className="owner__name">{video.owner.displayName}</Link>
              <span>{subscriberLabel(video.owner.subscribers)}</span>
            </div>
            <span className="owner__cta">
              <SubscribeButton
                username={video.owner.username}
                subscribed={video.owner.subscribed}
                onChange={(d) => setVideo((v) => ({ ...v, owner: { ...v.owner, subscribed: d.subscribed, subscribers: d.subscribers } }))}
              />
            </span>
          </div>

          <div className="watch__actions">
            <button className={`pill${video.liked ? ' pill--on' : ''}`} onClick={toggleLike} disabled={!ready} aria-pressed={video.liked}>
              <ThumbsUp size={16} fill={video.liked ? 'currentColor' : 'none'} /> {video.likes.toLocaleString()}
            </button>
            <button className="pill" onClick={() => copy(window.location.href, 'share')}>
              {copied === 'share' ? <Check size={16} /> : <Share2 size={16} />} {copied === 'share' ? 'Link copied' : 'Share'}
            </button>
            {video.hasOriginal && ready && (
              <a className="pill" href={`/api/videos/${video.id}/download`}><Download size={16} /> Download</a>
            )}
            {video.canEdit && (
              <>
                <button className="pill" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>
                <button className="pill pill--icon pill--danger" onClick={remove} aria-label="Delete video"><Trash2 size={16} /></button>
              </>
            )}
          </div>
        </div>

        <div className="desc">
          <p className="desc__meta">
            <strong>{count(video.views, 'view')}</strong> · {ago(video.createdAt)}
            {video.filmedOn && <> · Filmed {filmed(video.filmedOn)}</>}
            {video.source === 'live' && <span className="desc__tag"><Radio size={13} /> Live replay</span>}
          </p>
          {desc ? (
            <>
              <p className={`desc__text${longDesc && !expanded ? ' desc__text--clamp' : ''}`}>{desc}</p>
              {longDesc && <button className="desc__more" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : '...more'}</button>}
            </>
          ) : (
            <p className="desc__text muted">No description.</p>
          )}
        </div>

        {ready && <Comments videoId={video.id} />}
      </div>

      <aside className="watch__side">
        <h2 className="side-title">Up next</h2>
        <div className="upnext-list">
          {more.map((v) => <UpNextCard key={v.id} video={v} />)}
          {!more.length && <p className="muted small">Nothing else yet.</p>}
        </div>
      </aside>

      {editing && <EditVideo video={video} onClose={() => setEditing(false)} onSaved={setVideo} />}
    </div>
  );
}
