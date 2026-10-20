import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, Spinner } from '../components/ui.jsx';
import { LiveCard, VideoGrid } from '../components/VideoCard.jsx';

export default function LiveNow() {
  const { canUpload } = useAuth();
  const [channels, setChannels] = useState(null);
  const [replays, setReplays] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => api('/live').then((d) => alive && setChannels(d.channels)).catch(() => {});
    load();
    api('/videos?source=live&limit=12').then((d) => alive && setReplays(d.videos)).catch(() => {});
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1">Live now</h1>
        {canUpload && <Link to="/go-live" className="btn btn--primary btn--sm"><Radio size={16} /> Go live</Link>}
      </div>
      {channels === null ? (
        <div className="center pad"><Spinner /></div>
      ) : channels.length ? (
        <div className="live-row">{channels.map((c) => <LiveCard key={c.id} channel={c} big={channels.length === 1} />)}</div>
      ) : (
        <Empty icon={Radio} title="Nobody's live right now">
          When someone in the family starts streaming — a recital, a birthday, a game — it'll show up here.
        </Empty>
      )}
      {replays.length > 0 && (
        <section className="section">
          <h2 className="h2">Recent stream replays</h2>
          <VideoGrid videos={replays} />
        </section>
      )}
    </div>
  );
}
