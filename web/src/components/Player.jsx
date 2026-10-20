import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Settings2 } from 'lucide-react';

/**
 * HLS player. Uses hls.js where supported (Chrome, Firefox, Edge, Android) and native HLS on Safari/iOS.
 * For live streams it keeps retrying until the playlist appears (the first segments take a few seconds).
 */
export default function Player({ src, poster, live = false, autoPlay = false, onPlay, portrait = false }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState(-1);
  const [menu, setMenu] = useState(false);
  const [waiting, setWaiting] = useState(live);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    let retry;
    let destroyed = false;

    if (Hls.isSupported()) {
      const start = () => {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          liveSyncDurationCount: 3,
          capLevelToPlayerSize: true,
          xhrSetup: (xhr) => { xhr.withCredentials = true; },
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
          setWaiting(false);
          setLevels(data.levels.map((l, i) => ({ i, height: Math.min(l.height, l.width) || l.height })));
          if (autoPlay) video.play().catch(() => {});
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, d) => hls.autoLevelEnabled || setLevel(d.level));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) return hls.recoverMediaError();
          // Network error (e.g. live playlist not written yet): rebuild and retry.
          hls.destroy();
          if (!destroyed) {
            setWaiting(true);
            retry = setTimeout(start, 3000);
          }
        });
      };
      start();
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      const onErr = () => {
        if (!live || destroyed) return;
        setWaiting(true);
        retry = setTimeout(() => { video.src = src; video.load(); }, 3000);
      };
      const onMeta = () => setWaiting(false);
      video.addEventListener('error', onErr);
      video.addEventListener('loadedmetadata', onMeta);
      if (autoPlay) video.play().catch(() => {});
    }

    return () => {
      destroyed = true;
      clearTimeout(retry);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, live, autoPlay]);

  const choose = (i) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = i; // -1 = auto
      setLevel(i);
    }
    setMenu(false);
  };

  return (
    <div className={`player${portrait ? ' player--portrait' : ''}`}>
      {poster && <div className="player__ambient" style={{ backgroundImage: `url(${poster})` }} aria-hidden />}
      <video
        ref={videoRef}
        className="player__video"
        controls
        playsInline
        poster={poster || undefined}
        onPlay={onPlay}
      />
      {waiting && live && (
        <div className="player__waiting">
          <span className="spinner" />
          <span>Connecting to the stream…</span>
        </div>
      )}
      {levels.length > 1 && (
        <div className="player__quality">
          <button className="player__quality-btn" onClick={() => setMenu((m) => !m)} aria-label="Quality">
            <Settings2 size={16} />
            <span>{level === -1 ? 'Auto' : `${levels[level]?.height}p`}</span>
          </button>
          {menu && (
            <div className="player__quality-menu">
              <button className={level === -1 ? 'active' : ''} onClick={() => choose(-1)}>Auto</button>
              {[...levels].sort((a, b) => b.height - a.height).map((l) => (
                <button key={l.i} className={level === l.i ? 'active' : ''} onClick={() => choose(l.i)}>{l.height}p</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
