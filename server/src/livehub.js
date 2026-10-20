// Server-Sent Events hub: one channel per family member's live stream.
// Carries chat messages, viewer counts and live/offline status.
const channels = new Map(); // channelId -> Set<{res, userId}>

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function subscribe(channelId, req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  if (!channels.has(channelId)) channels.set(channelId, new Set());
  const set = channels.get(channelId);
  const client = { res, userId: req.user.id };
  set.add(client);
  broadcastViewers(channelId);

  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    set.delete(client);
    if (!set.size) channels.delete(channelId);
    else broadcastViewers(channelId);
  });
}

export function viewerCount(channelId) {
  const set = channels.get(channelId);
  if (!set) return 0;
  return new Set([...set].map((c) => c.userId)).size; // unique people, not tabs
}

export function broadcast(channelId, event, data) {
  const set = channels.get(channelId);
  if (!set) return;
  for (const c of set) send(c.res, event, data);
}

function broadcastViewers(channelId) {
  broadcast(channelId, 'viewers', { count: viewerCount(channelId) });
}
