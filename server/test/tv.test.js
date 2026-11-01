// TV pairing, end to end against a running KinCast server with an empty database:
//   KINCAST_TEST_URL=http://localhost:3000 node --test test/*.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.KINCAST_TEST_URL;

function client() {
  let cookie = '';
  return async function call(path, { method = 'GET', body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (cookie) headers.Cookie = cookie;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data };
  };
}

test('a TV pairs with a code, watches as a viewer, and is signed out when removed', { skip: !BASE }, async () => {
  const web = client();
  const tv = client();

  // An admin sets up the family in a browser.
  const setup = await web('/api/setup', { method: 'POST', body: { familyName: 'Hardy', displayName: 'Cade', email: 'cade@example.com', password: 'password123' } });
  assert.equal(setup.status, 201, JSON.stringify(setup.data));

  // The TV asks for a code.
  const pair = await tv('/api/tv/pair', { method: 'POST', body: { name: 'Living room TV' } });
  assert.equal(pair.status, 201);
  assert.match(pair.data.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(pair.data.verifyUrl, 'http://kincast.test/tv');
  assert.equal(pair.data.familyName, 'Hardy');

  // Not approved yet.
  let poll = await tv('/api/tv/pair/poll', { method: 'POST', body: { pollToken: pair.data.pollToken } });
  assert.equal(poll.status, 202);
  assert.equal((await tv('/api/tv/pair/poll', { method: 'POST', body: { pollToken: 'nope' } })).status, 410);

  // The TV shows a QR code for the approve page; no sign-in needed to fetch it.
  assert.equal(pair.data.qrUrl, `/api/tv/pair/${pair.data.code}/qr.png`);
  const qr = await fetch(`${BASE}${pair.data.qrUrl}`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/png');
  const png = Buffer.from(await qr.arrayBuffer());
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal((await fetch(`${BASE}/api/tv/pair/ZZZZ-ZZZZ/qr.png`)).status, 404);

  // Approving needs a signed-in person; codes are accepted in any case and spacing.
  assert.equal((await tv('/api/tv/approve', { method: 'POST', body: { code: pair.data.code } })).status, 401);
  const typed = pair.data.code.toLowerCase().replace('-', ' ');
  const look = await web(`/api/tv/pair/${encodeURIComponent(typed)}`);
  assert.equal(look.status, 200);
  assert.equal(look.data.deviceName, 'Living room TV');
  assert.equal((await web('/api/tv/approve', { method: 'POST', body: { code: 'AAAA-AAAA' } })).status, 404);
  const ok = await web('/api/tv/approve', { method: 'POST', body: { code: typed } });
  assert.equal(ok.status, 201);
  // A code works once.
  assert.equal((await web('/api/tv/approve', { method: 'POST', body: { code: typed } })).status, 404);

  // The TV gets its token once.
  poll = await tv('/api/tv/pair/poll', { method: 'POST', body: { pollToken: pair.data.pollToken } });
  assert.equal(poll.status, 200);
  assert.equal(poll.data.user.displayName, 'Cade');
  const token = poll.data.token;
  assert.equal((await tv('/api/tv/pair/poll', { method: 'POST', body: { pollToken: pair.data.pollToken } })).status, 410);

  // With the token the TV can watch, but it acts as a viewer even for an admin.
  const me = await tv('/api/auth/me', { token });
  assert.equal(me.data.user.role, 'viewer');
  assert.equal((await tv('/api/videos', { token })).status, 200);
  assert.equal((await tv('/api/live', { token })).status, 200);
  assert.equal((await tv('/api/admin/server', { token })).status, 403);
  assert.equal((await tv('/api/uploads', { method: 'POST', token, body: { filename: 'a.mp4', size: 10 } })).status, 403);
  assert.equal((await tv('/api/tv/approve', { method: 'POST', token, body: { code: 'AAAA-AAAA' } })).status, 403);
  // Media needs the token too.
  assert.equal((await tv('/media/x/thumb.jpg')).status, 401);
  assert.equal((await tv('/media/x/thumb.jpg', { token })).status, 404);

  // A browser session cookie can't be used as a bearer token, nor a TV token as a cookie.
  const devices = await web('/api/tv/devices');
  assert.equal(devices.data.devices.length, 1);
  assert.equal(devices.data.devices[0].name, 'Living room TV');
  const tvList = await tv('/api/tv/devices', { token });
  assert.equal(tvList.data.devices[0].current, true);

  // Removing the TV signs it out at once.
  assert.equal((await web(`/api/tv/devices/${devices.data.devices[0].id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await tv('/api/videos', { token })).status, 401);
  assert.equal((await tv('/api/auth/me', { token })).data.user, null);
});
