'use strict';
// Zuno 0.58: calls through Cloudflare's call server (Realtime SFU).
//
// Before this, everyone in a call connected straight to everyone else (a "mesh"): one weak link
// broke the call, and every extra person meant another full upload for everyone. Now each person
// keeps two connections, both to Cloudflare: one sends their voice, camera/screen and screen sound
// once, the other receives everyone else's. Nobody connects to anybody else's computer.
//
// Zuno's server is the only one that talks to Cloudflare (it holds the app secret) and only lets
// people in a call receive the people in that same call. It never sees or stores any sound or video.
//
// Setup: ZUNO_CF_SFU_APP_ID and ZUNO_CF_SFU_APP_SECRET on the server, then turn "New calls" on in
// the Admin Dashboard. Calls already going on keep the way they started; new ones use the switch.
// ZUNO_SFU_BASE only exists for tests (a stand-in call server).
module.exports = function (z) {
  const { data, save, route, fail, hooks, send, limit, rooms, isFounder, isManager, stillInvited } = z;
  const APP = () => process.env.ZUNO_CF_SFU_APP_ID || '';
  const SECRET = () => process.env.ZUNO_CF_SFU_APP_SECRET || '';
  const BASE = () => (process.env.ZUNO_SFU_BASE || 'https://rtc.live.cloudflare.com/v1').replace(/\/$/, '');
  const configured = () => !!(APP() && SECRET());
  const switchedOn = () => configured() && data.sfuCalls === true;
  const SLOTS = ['mic', 'video', 'screenaudio'];

  // Which rooms use the call server (decided when the room starts, so a call never switches halfway).
  const sfuRooms = new Set();
  // "room|user" -> { attempt, pub, sub, slots: Set } (memory only; sessions end with the call)
  const sess = new Map();
  const key = (room, uid) => room + '|' + uid;

  async function cf(method, path, body) {
    let res;
    try {
      res = await fetch(`${BASE()}/apps/${encodeURIComponent(APP())}${path}`, {
        method, signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${SECRET()}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch { fail(502, "Couldn't reach the call server. Trying again…"); }
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.errorCode) {
      console.warn(`Call server: ${method} ${path.replace(/[0-9a-f]{20,}/gi, '…')} -> ${res.status} ${d.errorCode || ''} ${d.errorDescription || ''}`.trim());
      fail(502, 'The call server had a problem. Reconnecting…');
    }
    return d;
  }
  async function newSession() {
    const d = await cf('POST', '/sessions/new');
    if (!d.sessionId) fail(502, 'The call server had a problem. Reconnecting…');
    return d.sessionId;
  }
  // Your own sessions for this call. A new attempt (after a dropped connection) starts fresh ones.
  function mine(room, me, attempt) {
    const r = rooms.get(room);
    if (!r?.has(me.id) || !sfuRooms.has(room)) fail(409, "You're not in that call anymore.");
    if (!stillInvited(me.id, room)) fail(403, "You can't be in that call anymore.");
    let s = sess.get(key(room, me.id));
    const a = Math.max(1, Math.floor(Number(attempt)) || 1);
    if (!s || s.attempt !== a) { s = { attempt: a, pub: null, sub: null, slots: new Set() }; sess.set(key(room, me.id), s); }
    return s;
  }
  const cleanSdp = v => { const sdp = typeof v === 'string' ? v : ''; if (!sdp || sdp.length > 200000) fail(400, 'Bad connection details.'); return sdp; };
  const tellRoom = (room, uid, s) => { for (const id of rooms.get(room)?.keys() || []) if (id !== uid) send(id, 'rtc-sfu', { room, userId: uid, pub: s.pub, slots: [...s.slots] }); };

  // Joining: say whether this call uses the call server, and where everyone already in it sends from.
  // (A rejoin after Zuno restarted keeps the way the call was going: "want" is what the app used.)
  hooks.rtcJoinExtra = (roomId, me, isNew, want) => {
    if (isNew) { if (want === undefined ? switchedOn() : (want && configured())) sfuRooms.add(roomId); else sfuRooms.delete(roomId); }
    if (!sfuRooms.has(roomId)) return { sfu: false };
    const peers = {};
    for (const id of rooms.get(roomId)?.keys() || []) {
      const s = sess.get(key(roomId, id));
      if (id !== me.id && s?.pub && s.slots.size) peers[id] = { pub: s.pub, slots: [...s.slots] };
    }
    return { sfu: true, sfuPeers: peers };
  };
  hooks.roomChange.push((roomId, uid, what) => {
    if (what === 'leave') sess.delete(key(roomId, uid));
    if (!rooms.has(roomId)) { sfuRooms.delete(roomId); for (const k of [...sess.keys()]) if (k.startsWith(roomId + '|')) sess.delete(k); }
  });

  // Send: publish your voice / camera-or-screen / screen sound (the browser's offer, Cloudflare's answer).
  route('POST', '/api/rtc/sfu/publish', async ({ me, body }) => {
    limit('sfu:' + me.id, 60, 10e3, 'Slow down a little.');
    const room = String(body.room || '');
    const s = mine(room, me, body.attempt);
    const tracks = (Array.isArray(body.tracks) ? body.tracks : []).slice(0, 3).map(t => {
      if (!SLOTS.includes(t?.slot) || typeof t.mid !== 'string' || !t.mid || t.mid.length > 32) fail(400, 'Bad track.');
      return { location: 'local', mid: t.mid, trackName: `${me.id}-${t.slot}` };
    });
    if (!tracks.length) fail(400, 'Nothing to send.');
    if (!s.pub) s.pub = await newSession();
    const pub = s.pub;
    const d = await cf('POST', `/sessions/${pub}/tracks/new`, { sessionDescription: { type: 'offer', sdp: cleanSdp(body.sdp) }, tracks });
    if (sess.get(key(room, me.id)) !== s) fail(409, 'That connection was replaced.');
    for (const t of d.tracks || []) if (t.errorCode) fail(502, 'The call server had a problem. Reconnecting…');
    for (const t of tracks) s.slots.add(t.trackName.slice(me.id.length + 1));
    tellRoom(room, me.id, s);
    return { pub, answer: d.sessionDescription };
  });

  // Receive: ask for someone else's voice/video. Only people in the same call can be received.
  route('POST', '/api/rtc/sfu/subscribe', async ({ me, body }) => {
    limit('sfu:' + me.id, 60, 10e3, 'Slow down a little.');
    const room = String(body.room || '');
    const s = mine(room, me, body.attempt);
    const peerId = String(body.peerId || '');
    if (peerId === me.id || !rooms.get(room)?.has(peerId)) fail(404, "They're not in this call.");
    const p = sess.get(key(room, peerId));
    if (!p?.pub || p.pub !== body.pub) return { gone: true }; // they reconnected; a newer "rtc-sfu" is on its way
    const slots = [...new Set((Array.isArray(body.slots) ? body.slots : []).filter(x => SLOTS.includes(x) && p.slots.has(x)))];
    if (!slots.length) return { tracks: [] };
    if (!s.sub) s.sub = await newSession();
    const d = await cf('POST', `/sessions/${s.sub}/tracks/new`, { tracks: slots.map(slot => ({ location: 'remote', sessionId: p.pub, trackName: `${peerId}-${slot}` })) });
    if (sess.get(key(room, me.id)) !== s) fail(409, 'That connection was replaced.');
    return {
      offer: d.sessionDescription || null,
      renegotiate: !!d.requiresImmediateRenegotiation,
      tracks: (d.tracks || []).map(t => ({ mid: t.mid, slot: String(t.trackName || '').slice(peerId.length + 1), error: t.errorCode || null })),
    };
  });
  // The browser's answer to Cloudflare's offer for new things to receive.
  route('POST', '/api/rtc/sfu/answer', async ({ me, body }) => {
    limit('sfu:' + me.id, 60, 10e3, 'Slow down a little.');
    const s = mine(String(body.room || ''), me, body.attempt);
    if (!s.sub) fail(409, 'Nothing to answer.');
    await cf('PUT', `/sessions/${s.sub}/renegotiate`, { sessionDescription: { type: 'answer', sdp: cleanSdp(body.sdp) } });
    return { ok: true };
  });
  // Stop receiving someone (they left or reconnected). No new offer needed.
  route('POST', '/api/rtc/sfu/unsubscribe', async ({ me, body }) => {
    limit('sfu:' + me.id, 60, 10e3, 'Slow down a little.');
    const s = mine(String(body.room || ''), me, body.attempt);
    const mids = (Array.isArray(body.mids) ? body.mids : []).filter(m => typeof m === 'string' && m && m.length <= 32).slice(0, 30);
    if (!s.sub || !mids.length) return { ok: true };
    await cf('PUT', `/sessions/${s.sub}/tracks/close`, { tracks: mids.map(mid => ({ mid })), force: true }).catch(() => {});
    return { ok: true };
  });

  // ---------- the switch (Admin Dashboard) ----------
  const canSwitch = me => isFounder(me.id) || isManager(me);
  route('GET', '/api/admin/sfu', async ({ me }) => {
    if (!canSwitch(me)) fail(403, 'Only the founder and Zuno Managers can see this.');
    return { configured: configured(), on: data.sfuCalls === true, rooms: sfuRooms.size };
  });
  route('PUT', '/api/admin/sfu', async ({ me, body }) => {
    if (!canSwitch(me)) fail(403, 'Only the founder and Zuno Managers can change this.');
    if (body.on && !configured()) fail(400, 'Add ZUNO_CF_SFU_APP_ID and ZUNO_CF_SFU_APP_SECRET on the server first.');
    data.sfuCalls = !!body.on; save();
    return { configured: configured(), on: data.sfuCalls === true, rooms: sfuRooms.size };
  });
};
