import { useState } from 'react';
import { api } from '../api.js';
import { ErrorNote, Modal } from './ui.jsx';

export default function EditVideo({ video, onClose, onSaved }) {
  const [f, setF] = useState({
    title: video.title,
    description: video.description || '',
    filmedOn: video.filmedOn || '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/videos/${video.id}`, { method: 'PATCH', body: f });
      onSaved({ ...video, ...f, filmedOn: f.filmedOn || null });
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Edit video"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form className="form" onSubmit={save}>
        <label className="field"><span>Title</span>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} required />
        </label>
        <label className="field"><span>Description</span>
          <textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={5000} />
        </label>
        <label className="field"><span>Date filmed</span>
          <input type="date" value={f.filmedOn} onChange={(e) => setF({ ...f, filmedOn: e.target.value })} />
          <small>Powers “On this day” memories on the home page.</small>
        </label>
        <ErrorNote error={error} />
      </form>
    </Modal>
  );
}
