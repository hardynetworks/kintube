export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

function putChunk(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error'));
    xhr.send(blob);
  });
}

/**
 * Upload a file in chunks (gets around proxy request-size limits like Cloudflare's 100 MB),
 * retrying each chunk a few times on network hiccups.
 */
export async function uploadVideo(file, meta, { onProgress, isCancelled } = {}) {
  const { uploadId, chunkBytes } = await api('/uploads', { method: 'POST', body: { filename: file.name, size: file.size } });
  let sent = 0;
  const total = Math.ceil(file.size / chunkBytes);
  for (let i = 0; i < total; i++) {
    if (isCancelled?.()) {
      await api(`/uploads/${uploadId}`, { method: 'DELETE' }).catch(() => {});
      throw new ApiError(0, 'Cancelled');
    }
    const blob = file.slice(i * chunkBytes, Math.min(file.size, (i + 1) * chunkBytes));
    for (let attempt = 1; ; attempt++) {
      try {
        await putChunk(`/api/uploads/${uploadId}/chunks/${i}`, blob, (loaded) => onProgress?.((sent + loaded) / file.size));
        break;
      } catch (err) {
        if (attempt >= 4 || (err.status >= 400 && err.status < 500)) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    sent += blob.size;
    onProgress?.(sent / file.size);
  }
  return api(`/uploads/${uploadId}/complete`, { method: 'POST', body: meta });
}
