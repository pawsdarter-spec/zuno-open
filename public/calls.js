'use strict';
// Zuno calls: DM voice/video calls, voice channels, and screen sharing.
// The Zuno server only passes "how to connect" messages along; the audio and video travel between
// the computers in the call (WebRTC), through the relay when one is set up.

const Calls = (() => {
  // Connection helpers. The server adds a TURN relay when one is set up, so calls work on strict networks too.
  let ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  let iceLoaded = 0, hasRelay = false;
  // (0.45.2) Relay logins can expire, so they're fetched again after an hour.
  async function loadIce() {
    if (iceLoaded && Date.now() - iceLoaded < 3600e3) return;
    try { const r = await api('GET', '/api/rtc/config'); ICE = r.iceServers; hasRelay = !!r.relay; iceLoaded = Date.now(); } catch {}
  }
  const RING_TIMEOUT = 45000;

  const c = {
    room: null, kind: null, peerId: null, serverId: null, channelId: null,
    phase: 'idle',               // idle | calling | connected
    muted: false, deafened: false, video: false, screen: false,
    startedAt: 0,
  };
  let meterTrack = null, gateOpenAt = 0, gateLevel = 0;
  let localAudio = null, cameraTrack = null, screenTrack = null, screenStream = null, screenAudio = null;
  const pcs = new Map();         // userId -> RTCPeerConnection
  const pending = new Map();     // userId -> ICE candidates that arrived early
  const peerStates = new Map();  // userId -> { muted, deafened, video, screen }
  const remote = new Map();      // userId -> { audio: MediaStreamTrack, video: MediaStreamTrack }
  const audioEls = new Map();    // userId -> <audio>
  const meters = new Map();      // userId -> { analyser, data }
  const speaking = new Set();
  let ringing = null;            // incoming ring: { room, from, video, timer }
  let ringTimer = null, toneTimer = null, meterTimer = null, clockTimer = null;
  let actx = null;

  try { const saved = JSON.parse(localStorage.getItem('zuno_voice') || '{}'); c.muted = !!saved.muted; c.deafened = !!saved.deafened; } catch {}
  const saveVoice = () => { try { localStorage.setItem('zuno_voice', JSON.stringify({ muted: c.muted, deafened: c.deafened })); } catch {} };

  // ---------- little sounds ----------
  function ctx() { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; }
  function tone(notes, gain = 0.12) {
    try {
      const a = ctx(), t = a.currentTime;
      notes.forEach(([freq, at, len = 0.16]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(gain, t + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        o.connect(g).connect(a.destination); o.start(t + at); o.stop(t + at + len + 0.05);
      });
    } catch {}
  }
  // A soft bell: a few harmonics that fade out, like a little marimba.
  function bell(notes, gain = 0.12) {
    try {
      const a = ctx(), t = a.currentTime;
      notes.forEach(([freq, at, len = 0.9]) => {
        for (const [mult, g] of [[1, 1], [2, 0.32], [3, 0.12], [4.2, 0.05]]) {
          const o = a.createOscillator(), v = a.createGain();
          o.type = 'sine'; o.frequency.value = freq * mult;
          v.gain.setValueAtTime(0.0001, t + at);
          v.gain.exponentialRampToValueAtTime(gain * g, t + at + 0.012);
          v.gain.exponentialRampToValueAtTime(0.0001, t + at + len / mult);
          o.connect(v).connect(a.destination); o.start(t + at); o.stop(t + at + len + 0.05);
        }
      });
    } catch {}
  }
  // A soft bass pluck and a little hi-hat tick, for a groove under the melody.
  function pluck(notes, gain = 0.1) {
    try {
      const a = ctx(), t = a.currentTime;
      for (const [freq, at, len = 0.35] of notes) {
        const o = a.createOscillator(), f = a.createBiquadFilter(), v = a.createGain();
        o.type = 'triangle'; o.frequency.value = freq;
        f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t + at); f.frequency.exponentialRampToValueAtTime(300, t + at + len);
        v.gain.setValueAtTime(0.0001, t + at); v.gain.exponentialRampToValueAtTime(gain, t + at + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
        o.connect(f).connect(v).connect(a.destination); o.start(t + at); o.stop(t + at + len + 0.05);
      }
    } catch {}
  }
  function tick(times, gain = 0.035) {
    try {
      const a = ctx(), t = a.currentTime;
      const buf = a.createBuffer(1, a.sampleRate * 0.05, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
      for (const at of times) {
        const src = a.createBufferSource(), f = a.createBiquadFilter(), v = a.createGain();
        src.buffer = buf; f.type = 'highpass'; f.frequency.value = 6000; v.gain.value = gain;
        src.connect(f).connect(v).connect(a.destination); src.start(t + at);
      }
    } catch {}
  }
  const B = 0.15; // one beat (about 100 bpm, in eighth notes)
  const sounds = {
    // Zuno's ringtone: a bouncy two-bar tune with a bass line and hi-hats, ready to loop.
    incoming: () => {
      bell([[784, 0, 0.35], [988, B, 0.35], [1175, 2 * B, 0.5], [1568, 3 * B, 0.6], [1319, 5 * B, 0.35], [1175, 6 * B, 0.35], [1319, 7 * B, 0.8],
        [988, 9 * B, 0.35], [1175, 10 * B, 0.35], [1319, 11 * B, 0.5], [1760, 12 * B, 0.9], [1568, 14 * B, 1.1]], 0.085);
      pluck([[196, 0], [196, 2 * B], [247, 4 * B], [294, 6 * B], [262, 8 * B], [262, 10 * B], [294, 12 * B], [392, 14 * B, 0.6]], 0.09);
      tick([1, 3, 5, 7, 9, 11, 13, 15].map(i => i * B));
    },
    // While your call rings on their side: a cheerful "bah-dum" with a tick, softer than the ringtone.
    outgoing: () => { bell([[659, 0, 0.6], [988, 0.14, 0.9]], 0.05); pluck([[165, 0, 0.3], [247, 0.14, 0.4]], 0.05); tick([0.42], 0.02); },
    // (0.38) Each server can have its join & leave sounds on, soft or off (server menu).
    join: () => { const v = vcSoundGain(); if (!v) return; bell([[784, 0, 0.3], [988, 0.07, 0.3], [1319, 0.14, 0.6]], 0.08 * v); tick([0.14], 0.02 * v); },
    leave: () => { const v = vcSoundGain(); if (v) bell([[1047, 0, 0.3], [784, 0.08, 0.3], [523, 0.16, 0.5]], 0.07 * v); },
    mute: () => tone([[440, 0, 0.08]], 0.08),
    unmute: () => tone([[660, 0, 0.08]], 0.08),
  };
  function vcSoundGain() {
    if (c.kind !== 'voice' || !c.serverId) return 1;
    const m = typeof vcSoundMode === 'function' ? vcSoundMode(c.serverId) : 'default';
    return m === 'off' ? 0 : m === 'soft' ? 0.35 : 1;
  }
  // (0.39) Better sound and sharper video from the first second:
  //  - Voice (Opus) up to 96 kbps with loss recovery, and no "silence skipping" (DTX), which made
  //    speech choppy. (The browser default is about 32 kbps.)
  //  - Video starts at 1.5 Mbps instead of ramping up from a blurry start.
  function tuneSdp(d) {
    if (!d?.sdp) return d;
    let sdp = d.sdp;
    // Opus settings for every sound slot (the old code only reached the first one, the mic, so a
    // stream's sound went out at the browser's low default). The second sound slot is stream sound:
    // stereo and a higher bitrate so music and games sound right.
    const parts = sdp.split(/(?=\r?\nm=)/);
    let audioN = 0;
    sdp = parts.map(part => {
      if (!/^\r?\n?m=audio/.test(part)) return part;
      const n = audioN++;
      const opus = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(part);
      if (!opus) return part;
      const extra = n === 1 ? { stereo: '1', 'sprop-stereo': '1', maxaveragebitrate: '160000' } : { maxaveragebitrate: '96000' };
      const re = new RegExp(`a=fmtp:${opus[1]} ([^\\r\\n]*)`);
      return re.test(part)
        ? part.replace(re, (all, params) => {
          const p = Object.fromEntries(params.split(';').filter(Boolean).map(x => x.split('=')));
          Object.assign(p, { useinbandfec: '1', usedtx: '0', maxplaybackrate: '48000' }, extra);
          return `a=fmtp:${opus[1]} ` + Object.entries(p).map(([k, v]) => `${k}=${v}`).join(';');
        })
        : part.replace(opus[0], `${opus[0]}\r\na=fmtp:${opus[1]} minptime=10;useinbandfec=1;usedtx=0;` + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(';'));
    }).join('');
    sdp = sdp.replace(/a=fmtp:(\d+) ([^\r\n]*)/g, (all, pt, params) => {
      if (/x-google-start-bitrate/.test(params) || !new RegExp(`a=rtpmap:${pt} (VP8|VP9|H264|AV1)/90000`, 'i').test(sdp)) return all;
      return `${all};x-google-start-bitrate=1500;x-google-min-bitrate=400`;
    });
    return { type: d.type, sdp };
  }
  function loopTone(fn, every) { stopTone(); fn(); toneTimer = setInterval(fn, every); }
  function stopTone() { clearInterval(toneTimer); toneTimer = null; if (ringAudio) { ringAudio.pause(); ringAudio = null; } }

  // ---------- ringtones ----------
  // A special tone from the server (both people hear it), else your own MP3 for incoming calls, else Zuno's.
  let ringAudio = null;
  function startRing(kind, special) {
    stopTone();
    const fallback = () => (kind === 'incoming' ? loopTone(sounds.incoming, 16 * B * 1000 + 300) : loopTone(sounds.outgoing, 2200));
    // (0.42) Zuno's ringtone is "Call Song", and once in a while (1 in 10) a hidden one plays instead.
    const zunoTone = () => (Math.random() < 0.1 ? '/tones/HiddenCall.mp3' : '/tones/CallSong.mp3');
    const src = special ? `/tones/${encodeURIComponent(special)}.mp3` : kind === 'incoming' ? state.extras?.ringtone?.url || zunoTone() : zunoTone(); // (0.43.1) the caller hears it too
    if (!src) return fallback();
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = kind === 'incoming' ? 0.8 : 0.45;
    ringAudio = audio;
    audio.play().catch(() => { if (ringAudio === audio) { ringAudio = null; fallback(); } });
  }
  // Settings uses this to let you hear a ringtone. Returns a function that stops it.
  function previewRing(src) {
    stopTone();
    const a = new Audio(src || '/tones/CallSong.mp3'); a.volume = 0.8; a.play().catch(() => {}); ringAudio = a;
    setTimeout(() => { if (!c.room && !ringing) stopTone(); }, 8000);
    return () => { if (!c.room && !ringing) stopTone(); };
  }

  // ---------- helpers ----------
  // "is calling Squad…" for a named group, else "is calling you and Bob…".
  function groupRingText(group, from) {
    const g = state.groups.find(x => x.id === group.id) || group;
    if (g.name) return `is calling <b>${esc(g.name)}</b>…`;
    const others = (g.members || []).map(m => (typeof m === 'string' ? user(m) : m)).filter(u => u && u.id !== state.me.id && u.id !== from?.id).map(u => esc(u.displayName));
    return `is calling you${others.length ? ` and <b>${others.slice(0, 3).join(', ')}${others.length > 3 ? ` +${others.length - 3}` : ''}</b>` : ''}…`;
  }
  const dmRoom = peerId => 'dm:' + [state.me.id, peerId].sort().join(':');
  // (0.46) Messages to each person go out one after another. Sent all at once, a connection's
  // network paths could arrive before the offer they belong to and were lost, so far-away calls
  // (that need every path) often never connected.
  // (0.56) Messages that pile up while one is on its way go together in the next request, so joining
  // a big call is a handful of requests instead of hundreds (which used to hit Zuno's flood limit and
  // lose some, leaving you unable to hear some people).
  const sigQ = new Map(), sigWait = new Map();
  const signal = (to, data) => {
    const room = c.room;
    let box = sigWait.get(to);
    if (box && box.room === room) { box.list.push(data); return box.done; }
    box = { room, list: [data] };
    sigWait.set(to, box);
    const next = (sigQ.get(to) || Promise.resolve()).then(() => new Promise(r => setTimeout(r, 30))).then(() => {
      if (sigWait.get(to) === box) sigWait.delete(to);
      return c.room === room ? api('POST', '/api/rtc/signal', box.list.length === 1 ? { room, to, data: box.list[0] } : { room, to, batch: box.list }).catch(() => {}) : null;
    });
    box.done = next;
    sigQ.set(to, next);
    next.then(() => { if (sigQ.get(to) === next) sigQ.delete(to); });
    return next;
  };
  const myState = () => ({ muted: c.muted || c.deafened, deafened: c.deafened, video: c.video, screen: c.screen });
  const pushState = () => { if (c.room) api('POST', '/api/rtc/state', { room: c.room, ...myState() }).catch(() => {}); };
  const currentVideo = () => screenTrack || cameraTrack || null;

  // Settings › Voice & Video: which microphone, and how it's cleaned up (saved on this device).
  const VOICE_DEFAULTS = { noiseSuppression: true, echoCancellation: true, autoGainControl: true, micId: '', inputMode: 'voice', pttKey: 'Backquote', pttName: '`', noiseLevel: 'standard', sensAuto: true, sens: 40 };
  const voiceSettings = () => { try { return { ...VOICE_DEFAULTS, ...JSON.parse(localStorage.getItem('zuno_voice_settings') || '{}') }; } catch { return { ...VOICE_DEFAULTS }; } };
  // Push to Talk: with it on, your mic only sends while you hold the key (or the Hold to Talk button).
  let pttHeld = false;
  const ptt = () => voiceSettings().inputMode === 'ptt';
  const micLive = () => !(c.muted || c.deafened) && (!ptt() || pttHeld);
  function setPtt(on) {
    if (pttHeld === on) return;
    pttHeld = on;
    if (localAudio) localAudio.enabled = micLive();
    if (c.room && ptt() && !(c.muted || c.deafened)) tick([0], on ? 0.03 : 0.018);
    for (const b of $$('[data-c="ptt"]')) b.classList.toggle('on', on);
    document.body.classList.toggle('ptt-talking', on && !!c.room);
  }
  function applyInputMode() { pttHeld = false; if (localAudio) localAudio.enabled = micLive(); render(); }
  const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const isPttKey = e => {
    const v = voiceSettings();
    if (v.inputMode !== 'ptt' || !c.room || e.code !== v.pttKey) return false;
    // A letter-type key while you're typing is just typing.
    return !(typing(e.target) && e.key.length === 1);
  };
  addEventListener('keydown', e => { if (isPttKey(e)) { e.preventDefault(); if (!e.repeat) setPtt(true); } }, true);
  addEventListener('keyup', e => { if (e.code === voiceSettings().pttKey && pttHeld) { e.preventDefault(); setPtt(false); } }, true);
  addEventListener('blur', () => setPtt(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPtt(false); });
  const micConstraints = () => { const v = voiceSettings(); return { channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 }, echoCancellation: v.echoCancellation, noiseSuppression: v.noiseSuppression, autoGainControl: v.autoGainControl, ...(v.micId ? { deviceId: { ideal: v.micId } } : {}) }; };
  // Swap the microphone mid-call (after changing settings) without anyone noticing a drop.
  async function refreshMic() {
    if (!c.room) return;
    const old = localAudio;
    localAudio = null;
    try { await ensureMic(); } catch { localAudio = old; return toast("Couldn't switch microphones.", true); }
    for (const pc of pcs.values()) { const t = pc.getTransceivers()[0]; if (t) await t.sender.replaceTrack(localAudio).catch(() => {}); }
    old?.stop();
  }
  // ---------- (0.47) voice changer (beta) ----------
  // Your mic goes through a small sound chain before it's sent: a higher or deeper voice, a robot,
  // an old radio, or an echo. Everyone hears the changed voice; "Off" sends your mic as it is.
  const VOICE_FX = { off: 'Off', deep: 'Deep', high: 'High', robot: 'Robot', radio: 'Radio', echo: 'Echo', monster: 'Monster' };
  let fxCtx = null;
  function voiceFx(raw, fx) {
    if (!fx || fx === 'off' || !VOICE_FX[fx]) return raw;
    try {
      fxCtx ||= new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
      if (fxCtx.state === 'suspended') fxCtx.resume();
      const a = fxCtx, src = a.createMediaStreamSource(new MediaStream([raw])), out = a.createMediaStreamDestination();
      const nodes = [src];
      const link = (...list) => { for (let i = 0; i < list.length - 1; i++) list[i].connect(list[i + 1]); nodes.push(...list); };
      // Pitch: two read heads moving through a short delay line, faded into each other.
      const shifter = ratio => {
        const sp = a.createScriptProcessor(1024, 1, 1), N = 8192, buf = new Float32Array(N), W = 1800;
        let w = 0, ph = 0;
        sp.onaudioprocess = e => {
          const inp = e.inputBuffer.getChannelData(0), o = e.outputBuffer.getChannelData(0);
          for (let i = 0; i < inp.length; i++) {
            buf[w] = inp[i];
            const d1 = ph * W, p2 = (ph + 0.5) % 1, d2 = p2 * W;
            const r1 = (w - d1 - 2 + N) % N, r2 = (w - d2 - 2 + N) % N;
            const i1 = Math.floor(r1), f1 = r1 - i1, i2 = Math.floor(r2), f2 = r2 - i2;
            const s1 = buf[i1] * (1 - f1) + buf[(i1 + 1) % N] * f1, s2 = buf[i2] * (1 - f2) + buf[(i2 + 1) % N] * f2;
            o[i] = s1 * Math.sin(Math.PI * ph) + s2 * Math.sin(Math.PI * p2);
            ph += (1 - ratio) / W; ph -= Math.floor(ph);
            w = (w + 1) % N;
          }
        };
        return sp;
      };
      if (fx === 'deep') link(src, shifter(0.72), out);
      else if (fx === 'high') link(src, shifter(1.5), out);
      else if (fx === 'monster') { const lp = a.createBiquadFilter(); lp.type = 'lowshelf'; lp.frequency.value = 300; lp.gain.value = 8; link(src, shifter(0.55), lp, out); }
      else if (fx === 'robot') {
        const ring = a.createGain(); ring.gain.value = 0;
        const osc = a.createOscillator(); osc.frequency.value = 55; osc.connect(ring.gain); osc.start(); nodes.push(osc);
        const dry = a.createGain(); dry.gain.value = 0.25;
        link(src, ring, out); src.connect(dry); dry.connect(out); nodes.push(dry);
      } else if (fx === 'radio') {
        const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
        const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        const ws = a.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3); } ws.curve = curve;
        const g = a.createGain(); g.gain.value = 0.8;
        link(src, hp, lp, ws, g, out);
      } else if (fx === 'echo') {
        const d = a.createDelay(1); d.delayTime.value = 0.22;
        const fb = a.createGain(); fb.gain.value = 0.35;
        const wet = a.createGain(); wet.gain.value = 0.5;
        src.connect(out); src.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(out); nodes.push(d, fb, wet);
      }
      const track = out.stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      // Stopping the changed voice also lets go of the real mic.
      track.stop = () => { stop(); raw.stop(); for (const n of nodes) { try { n.onaudioprocess = null; n.stop?.(); n.disconnect(); } catch {} } };
      track.zunoRaw = raw;
      return track;
    } catch (err) { console.warn('voice changer', err); return raw; }
  }
  async function ensureMic() {
    if (localAudio && localAudio.readyState === 'live') return localAudio;
    const s = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
    localAudio = voiceFx(s.getAudioTracks()[0], voiceSettings().fx);
    localAudio.enabled = micLive();
    // (0.45.1) The meter listens to a copy of the mic, so it still hears you while the voice gate
    // (sensitivity / strong noise suppression) has your sent sound switched off.
    meterTrack?.stop();
    meterTrack = (localAudio.zunoRaw || localAudio).clone(); meterTrack.enabled = true;
    addMeter(state.me.id, meterTrack);
    return localAudio;
  }


  // ---------- (0.46) voice through Zuno when no direct line works ----------
  // When every way of connecting two people fails (and no TURN relay is set up, or it fails too),
  // both apps send their voice to each other through the Zuno server as small Opus packets
  // (WebCodecs). Video and screens still need a direct line. It stops by itself as soon as the
  // direct connection comes up.
  const relayCan = () => typeof AudioEncoder === 'function' && typeof AudioDecoder === 'function' && typeof EncodedAudioChunk === 'function';
  const relayTo = new Set();      // people we send our voice to
  const relayToasted = new Set(), relayErrs = [];
  let rctx = null;
  const relayCtx = () => { if (!rctx || rctx.state === 'closed') { try { rctx = new AudioContext({ sampleRate: 48000 }); } catch { rctx = new AudioContext(); } } if (rctx.state === 'suspended') rctx.resume(); return rctx; };
  const relayFrom = new Map();    // userId -> { dec, dest, at, gain }
  let rEnc = null, rNode = null, rSrc = null, rTrack = null, rBuf = [], rFlush = 0, rTs = 0;
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  function relaySender() {
    if (!relayTo.size || !localAudio) { relaySenderStop(); return; }
    if (rEnc && rTrack === localAudio) return;
    relaySenderStop();
    const a = relayCtx();
    rTrack = localAudio;
    rEnc = new AudioEncoder({
      output: chunk => { const u = new Uint8Array(chunk.byteLength); chunk.copyTo(u); rBuf.push(b64(u)); },
      error: () => { relaySenderStop(); },
    });
    try { rEnc.configure({ codec: 'opus', sampleRate: a.sampleRate, numberOfChannels: 1, bitrate: 32000 }); } catch { rEnc = null; return; }
    rSrc = a.createMediaStreamSource(new MediaStream([localAudio]));
    rNode = a.createScriptProcessor(2048, 1, 1);
    rNode.onaudioprocess = e => {
      const pcm = e.inputBuffer.getChannelData(0);
      e.outputBuffer.getChannelData(0).fill(0);
      if (!rEnc || rEnc.state !== 'configured') return;
      // Nothing is sent while you're muted or silent.
      let peak = 0; for (let i = 0; i < pcm.length; i += 8) peak = Math.max(peak, Math.abs(pcm[i]));
      const live = localAudio?.enabled && peak > 0.004;
      const ts = rTs; rTs += Math.round(pcm.length / a.sampleRate * 1e6);
      if (!live) return;
      try { const d = new AudioData({ format: 'f32-planar', sampleRate: a.sampleRate, numberOfFrames: pcm.length, numberOfChannels: 1, timestamp: ts, data: new Float32Array(pcm) }); rEnc.encode(d); d.close(); } catch {}
    };
    rSrc.connect(rNode); rNode.connect(a.destination);
    rFlush = setInterval(() => {
      if (!rBuf.length || !c.room || !relayTo.size) return;
      const f = rBuf.splice(0, 20);
      api('POST', '/api/rtc/relay', { room: c.room, to: [...relayTo], f, t: Date.now() }).catch(() => {});
    }, 100);
  }
  function relaySenderStop() {
    clearInterval(rFlush); rFlush = 0; rBuf = [];
    try { rNode && (rNode.onaudioprocess = null, rNode.disconnect()); rSrc?.disconnect(); } catch {}
    try { rEnc && rEnc.state !== 'closed' && rEnc.close(); } catch {}
    rEnc = null; rNode = null; rSrc = null; rTrack = null;
  }
  function relayStart(userId, ask) {
    if (!relayCan() || !c.room) return false;
    if (!relayTo.has(userId)) { relayTo.add(userId); if (ask) signal(userId, { zrelay: true }); }
    relaySender();
    if (c.phase !== 'connected') { c.phase = 'connected'; c.startedAt ||= Date.now(); stopTone(); clearTimeout(ringTimer); }
    render();
    return true;
  }
  function relayStop(userId, tell) {
    if (!relayTo.has(userId) && !relayFrom.has(userId)) return;
    if (relayTo.delete(userId) && tell) signal(userId, { zrelay: false });
    const r = relayFrom.get(userId);
    if (r) {
      try { r.dec.state !== 'closed' && r.dec.close(); } catch {}
      relayFrom.delete(userId);
      // Back to the direct line's own sound.
      const t = pcs.get(userId)?.getTransceivers?.()[0]?.receiver?.track;
      if (t && c.room) { const rr = remote.get(userId) || {}; rr.audio = t; remote.set(userId, rr); attachAudio(userId, t); }
    }
    if (!relayTo.size) relaySenderStop();
    render();
  }
  function relayStopAll() { for (const id of new Set([...relayTo, ...relayFrom.keys()])) relayStop(id, false); relaySenderStop(); }
  function relayIn(d) {
    if (!c.room || d.room !== c.room || !relayCan()) return;
    const pc = pcs.get(d.from);
    if (pc?.connectionState === 'connected') return; // the direct line is up
    let r = relayFrom.get(d.from);
    if (!r) {
      const a = relayCtx();
      const dest = a.createMediaStreamDestination();
      r = { dest, at: 0, ts: 0 };
      r.dec = new AudioDecoder({
        output: ad => {
          try {
            const n = ad.numberOfFrames, buf = a.createBuffer(1, n, ad.sampleRate), tmp = new Float32Array(n);
            ad.copyTo(tmp, { planeIndex: 0, format: 'f32-planar' });
            buf.copyToChannel(tmp, 0);
            const src = a.createBufferSource(); src.buffer = buf; src.connect(dest);
            // A small cushion (~120 ms) so packets arriving unevenly still play smoothly.
            const now = a.currentTime;
            if (r.at < now + 0.04 || r.at > now + 0.6) r.at = now + 0.12;
            src.start(r.at); r.at += buf.duration; r.outs = (r.outs || 0) + 1;
          } catch {}
          ad.close();
        },
        error: e => { relayErrs.push(String(e?.message || e)); relayFrom.delete(d.from); },
      });
      try { r.dec.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 }); } catch { return; }
      relayFrom.set(d.from, r);
      const rr = remote.get(d.from) || {};
      rr.audio = dest.stream.getAudioTracks()[0];
      remote.set(d.from, rr);
      attachAudio(d.from, rr.audio);
      // They reached us through the relay, so send them our voice the same way.
      if (!relayTo.has(d.from)) relayStart(d.from, false);
    }
    for (const f of d.f || []) {
      try { r.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: (r.ts += 20000), data: unb64(f) })); } catch {}
    }
  }

  // ---------- peer connections ----------
  // Calls between far-apart people (other countries, strict networks) often need a few tries:
  // 1) a quick "ICE restart" on the same connection, 2) a fresh connection forced through the relay.
  const tries = new Map(); // userId -> how many times we've rebuilt this connection
  const MAX_TRIES = 3;
  function makePC(userId, initiator, opts = {}) {
    const old = pcs.get(userId);
    if (old) { old.zunoDead = true; clearTimeout(old.zunoWatch); clearTimeout(old.zunoDrop); old.close(); }
    // (0.56) With a relay set up, calls always go through it: nobody in a call connects straight to
    // anyone else's computer, so nobody's network address is shared with the others.
    const relayOnly = hasRelay;
    const pc = new RTCPeerConnection({ iceServers: ICE, iceTransportPolicy: relayOnly ? 'relay' : 'all', bundlePolicy: 'max-bundle' });
    pc.zunoInit = initiator; pc.zunoRelay = relayOnly;
    pc.zunoCid = opts.cid || Math.random().toString(36).slice(2, 10); // (0.46) which connection a message belongs to
    pcs.set(userId, pc);
    pc.onicecandidate = e => { if (e.candidate && !pc.zunoDead) signal(userId, { candidate: e.candidate, cid: pc.zunoCid }); };
    pc.ontrack = e => {
      // The third slot is someone's screen sound: it plays on its own, apart from their voice.
      if (pc.getTransceivers().indexOf(e.transceiver) === 2) return attachScreenAudio(userId, e.track);
      const r = remote.get(userId) || {};
      r[e.track.kind] = e.track;
      remote.set(userId, r);
      if (e.track.kind === 'audio') attachAudio(userId, e.track);
      else e.track.onunmute = () => render();
      render();
    };
    // Watchdog: some browsers sit on "connecting" for a very long time instead of failing.
    pc.zunoWatch = setTimeout(() => { if (!pc.zunoDead && pc.connectionState !== 'connected') recover(userId, pc); }, 15000);
    pc.onconnectionstatechange = () => {
      if (pc.zunoDead) return;
      const st = pc.connectionState;
      if (st === 'connected') {
        clearTimeout(pc.zunoWatch); clearTimeout(pc.zunoDrop); tries.delete(userId);
        relayStop(userId, true);
        if (c.phase !== 'connected') { c.phase = 'connected'; c.startedAt ||= Date.now(); stopTone(); clearTimeout(ringTimer); render(); }
        tuneSenders();
      }
      // A short "disconnected" usually fixes itself; if it doesn't within 5s, try to recover.
      if (st === 'disconnected') { clearTimeout(pc.zunoDrop); pc.zunoDrop = setTimeout(() => { if (!pc.zunoDead && pc.connectionState === 'disconnected') recover(userId, pc); }, 5000); }
      if (st === 'failed') recover(userId, pc);
    };
    if (initiator) {
      const a = pc.addTransceiver('audio', { direction: 'sendrecv' });
      const v = pc.addTransceiver('video', { direction: 'sendrecv' });
      const sa = pc.addTransceiver('audio', { direction: 'sendrecv' });
      a.sender.replaceTrack(localAudio);
      v.sender.replaceTrack(currentVideo());
      sa.sender.replaceTrack(screenAudio);
    }
    return pc;
  }
  // Only the person who started the connection rebuilds it; the other side asks them to.
  function recover(userId, pc) {
    if (pc.zunoDead || pcs.get(userId) !== pc || !c.room) return;
    if (!pc.zunoInit) { if (!pc.zunoAsked) { pc.zunoAsked = true; signal(userId, { retry: true }); setTimeout(() => { pc.zunoAsked = false; }, 8000); } return; }
    const n = (tries.get(userId) || 0) + 1;
    tries.set(userId, n);
    // (0.46) Two tries without a line: talk through Zuno's own relay while it keeps trying.
    if (n >= (hasRelay ? 2 : 1) && !relayTo.has(userId) && relayStart(userId, true) && !relayToasted.has(userId)) {
      relayToasted.add(userId);
      toast(`Connected to ${user(userId)?.displayName || 'them'} through Zuno. Their network blocks direct calls, so it's voice only until a direct line works.`);
    }
    if (n > MAX_TRIES) {
      if (relayTo.has(userId)) {}
      else if (!pc.zunoToasted) { pc.zunoToasted = true; toast(`Couldn't connect to ${user(userId)?.displayName || 'them'}${hasRelay ? '' : ' (their network may block direct calls)'}. Still trying…`, true); }
      // (0.45.1) Keep trying quietly every 30 seconds while you're both in the call.
      clearTimeout(pc.zunoLater);
      pc.zunoLater = setTimeout(() => {
        const cur = pcs.get(userId);
        if (!c.room || !cur || cur.connectionState === 'connected') return;
        tries.delete(userId);
        callPeer(userId, { relay: true }).catch(() => {});
      }, 30000);
      return;
    }
    clearTimeout(pc.zunoWatch);
    if (n === 1 && pc.connectionState !== 'new') {
      // Same connection, new network paths.
      pc.zunoWatch = setTimeout(() => { if (!pc.zunoDead && pc.connectionState !== 'connected') recover(userId, pc); }, 12000);
      pc.createOffer({ iceRestart: true }).then(o => pc.setLocalDescription(tuneSdp(o))).then(() => signal(userId, { sdp: pc.localDescription, restart: true })).catch(() => {});
      return;
    }
    // Fresh connection, through the relay when there is one.
    callPeer(userId, { relay: true }).catch(() => {});
  }
  async function callPeer(userId, opts = {}) {
    const pc = makePC(userId, true, opts);
    await pc.setLocalDescription(tuneSdp(await pc.createOffer()));
    signal(userId, { sdp: pc.localDescription, relay: pc.zunoRelay || undefined, cid: pc.zunoCid });
  }
  const pendingCid = new Map(); // connection id -> network paths that arrived before its offer
  async function onSignal({ from, data }) {
    if (!c.room) return;
    let pc = pcs.get(from);
    // (0.45.1) Asked to try again: whoever started rebuilds it. If we only answered, we start a fresh
    // one ourselves (before, both sides could be "answerers" waiting on each other forever).
    if ('zrelay' in data) { data.zrelay ? relayStart(from, false) : relayStop(from, false); return; }
    if (data.retry) {
      if (pc?.zunoInit) recover(from, pc);
      else if (!pc || pc.connectionState !== 'connected') callPeer(from, { relay: true }).catch(() => {});
      return;
    }
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        // Both sides sent an offer at the same moment: the one with the higher id keeps its own offer
        // and ignores theirs; the other answers it. (Before, both answered and nobody connected.)
        const glare = pc && !pc.zunoDead && pc.signalingState === 'have-local-offer' && !data.restart;
        if (glare && String(state.me.id) > String(from)) return;
        // An ICE restart reuses the same connection; any other offer starts a new one.
        const reuse = data.restart && pc && !pc.zunoDead && pc.signalingState === 'stable';
        if (!reuse) pc = makePC(from, false, { relay: data.relay, cid: data.cid });
        await pc.setRemoteDescription(data.sdp);
        if (data.cid) { for (const cand of pendingCid.get(data.cid) || []) await pc.addIceCandidate(cand).catch(() => {}); pendingCid.delete(data.cid); }
        if (!reuse) {
          const ts = pc.getTransceivers();
          for (let i = 0; i < ts.length; i++) {
            ts[i].direction = 'sendrecv';
            await ts[i].sender.replaceTrack(i === 2 ? screenAudio : ts[i].receiver.track?.kind === 'audio' ? localAudio : currentVideo());
          }
        }
        await pc.setLocalDescription(tuneSdp(await pc.createAnswer()));
        signal(from, { sdp: pc.localDescription, cid: pc.zunoCid });
      } else if (pc && pc.signalingState === 'have-local-offer' && (!data.cid || data.cid === pc.zunoCid)) {
        await pc.setRemoteDescription(data.sdp);
      }
      for (const cand of pending.get(from) || []) await pc?.addIceCandidate(cand).catch(() => {});
      pending.delete(from);
    } else if (data.candidate) {
      // A path for a connection that isn't this one: an older one (dropped) or a newer one whose offer
      // hasn't arrived yet (kept for it).
      if (data.cid && pc?.zunoCid && data.cid !== pc.zunoCid) {
        if (!pc.zunoInit) { const l = pendingCid.get(data.cid) || []; if (l.length < 60) l.push(data.candidate); pendingCid.set(data.cid, l); if (pendingCid.size > 20) pendingCid.delete(pendingCid.keys().next().value); }
        return;
      }
      if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else pending.set(from, [...(pending.get(from) || []), data.candidate]);
    }
  }
  function dropPeer(userId) {
    relayStop(userId, false);
    const p = pcs.get(userId);
    if (p) { p.zunoDead = true; clearTimeout(p.zunoWatch); clearTimeout(p.zunoDrop); p.close(); }
    pcs.delete(userId); tries.delete(userId);
    pending.delete(userId); peerStates.delete(userId); remote.delete(userId);
    audioEls.get(userId)?.remove(); audioEls.delete(userId);
    try { gains.get(userId)?.src.disconnect(); } catch {}
    gains.delete(userId);
    audioEls.get(userId + ':screen')?.remove(); audioEls.delete(userId + ':screen');
    try { gains.get(userId + ':screen')?.src.disconnect(); } catch {}
    gains.delete(userId + ':screen'); hiddenStreams.delete(userId);
    meters.delete(userId); speaking.delete(userId);
  }
  // Your own settings for each person (kept on this device): mute them just for you, or turn their
  // voice down or up (0–200%). Their voice goes through a volume knob so it can go above 100%.
  // A stream's sound has its own setting, saved under "<id>:screen".
  const peerAudioAll = () => { try { return JSON.parse(localStorage.getItem('zuno_peer_audio') || '{}'); } catch { return {}; } };
  const peerAudio = uid => ({ vol: 100, muted: false, ...(peerAudioAll()[uid] || {}) });
  function setPeerAudio(uid, change) {
    const all = peerAudioAll();
    const next = { ...peerAudio(uid), ...change };
    next.vol = Math.max(0, Math.min(200, Math.round(Number(next.vol) || 0)));
    if (next.vol === 100 && !next.muted) delete all[uid]; else all[uid] = next;
    try { localStorage.setItem('zuno_peer_audio', JSON.stringify(all)); } catch {}
    applyPeerMutes();
    if ('muted' in change) render(); // dragging the volume doesn't need to redraw the tiles
  }
  // Streams you've stopped watching (for this call): no video, no sound, until you watch again.
  const hiddenStreams = new Set();
  // The tile you've made big (click or tap a video / stream to widen it; again to shrink it).
  let focused = null;
  const focusClass = () => (focused && participants().includes(focused) ? ' has-focus' : '');
  function setFocus(id) { focused = focused === id ? null : id; render(); }
  const watching = uid => !hiddenStreams.has(uid);
  function setWatching(uid, on) {
    if (on) hiddenStreams.delete(uid); else hiddenStreams.add(uid);
    applyPeerMutes(); render();
  }
  const gains = new Map(); // userId -> { src, gain }
  function applyPeerMutes() {
    for (const [key, el] of audioEls) {
      const screen = key.endsWith(':screen'), uid = screen ? key.slice(0, -7) : key;
      const p = peerAudio(key), silent = c.deafened || p.muted || (screen ? !watching(uid) : !!peerStates.get(key)?.muted);
      // (0.44) On phones the sound engine often starts paused (it can only start from a tap), and
      // then everything sent through it was silent. Until it's running, the plain player plays.
      const g = gains.get(key), live = g && actx?.state === 'running';
      if (live) { el.muted = true; g.gain.gain.value = silent ? 0 : p.vol / 100; }
      else { if (g) g.gain.gain.value = 0; el.muted = silent; el.volume = Math.min(1, p.vol / 100); if (!silent && el.paused) el.play().catch(() => {}); }
    }
  }
  // (0.44) The first tap anywhere starts the sound engine (phones won't start it any other way),
  // and the call switches over to it once it runs.
  const wakeAudio = () => {
    if (!c.room) return;
    try { const a = ctx(); if (a.state !== 'running') a.resume().then(applyPeerMutes).catch(() => {}); } catch {}
    for (const el of audioEls.values()) if (el.paused) el.play().catch(() => {});
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, wakeAudio, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { wakeAudio(); applyPeerMutes(); } });
  function routeThroughGain(userId, el) {
    try {
      gains.get(userId)?.src.disconnect();
      const ac = ctx();
      const src = ac.createMediaStreamSource(el.srcObject);
      const gain = ac.createGain();
      src.connect(gain).connect(ac.destination);
      gains.set(userId, { src, gain });
      if (!ac.zunoWatch) { ac.zunoWatch = true; ac.addEventListener('statechange', () => applyPeerMutes()); }
    } catch { gains.delete(userId); } // no Web Audio: the plain player (up to 100%) still works
  }
  function attachAudio(userId, track) {
    let el = audioEls.get(userId);
    if (!el) { el = document.createElement('audio'); el.autoplay = true; el.setAttribute('playsinline', ''); $('#call-audio').appendChild(el); audioEls.set(userId, el); }
    el.srcObject = new MediaStream([track]);
    routeThroughGain(userId, el);
    applyPeerMutes();
    el.play().catch(() => {});
    addMeter(userId, track);
  }

  // ---------- who's speaking ----------
  function addMeter(userId, track) {
    try {
      const a = ctx();
      const src = a.createMediaStreamSource(new MediaStream([track]));
      const analyser = a.createAnalyser(); analyser.fftSize = 512;
      src.connect(analyser);
      meters.set(userId, { analyser, data: new Uint8Array(analyser.fftSize) });
    } catch {}
    if (!meterTimer) meterTimer = setInterval(checkSpeaking, 120);
  }
  function checkSpeaking() {
    let changed = false;
    for (const [id, m] of meters) {
      m.analyser.getByteTimeDomainData(m.data);
      let sum = 0; for (const v of m.data) sum += (v - 128) ** 2;
      const level = Math.sqrt(sum / m.data.length);
      const muted = id === state.me.id ? (c.muted || c.deafened) : peerStates.get(id)?.muted;
      let now = level > 4 && !muted;
      if (id === state.me.id) {
        // Voice gate: below the sensitivity level your mic sends silence (kept open 400 ms after
        // you stop, so word endings aren't cut). "Strong" noise suppression turns it on at a level
        // that cuts keyboards and fans.
        const v = voiceSettings();
        gateLevel = level;
        const gate = v.inputMode !== 'ptt' && (!v.sensAuto || (v.noiseLevel === 'strong' && v.noiseSuppression));
        const threshold = !v.sensAuto ? 1.5 + (Number(v.sens) || 0) * 0.35 : 9;
        if (gate) {
          if (level > threshold) gateOpenAt = Date.now();
          // (0.56) While Zuno is in the background the browser slows this check to about once a second,
          // so the gate would chop your words: it stays open then, like with the gate off.
          const open = document.hidden || Date.now() - gateOpenAt < 400;
          if (localAudio) { const want = micLive() && open; if (localAudio.enabled !== want) localAudio.enabled = want; }
          now = open && !muted;
        } else if (localAudio && localAudio.enabled !== micLive()) localAudio.enabled = micLive();
      }
      if (now !== speaking.has(id)) { now ? speaking.add(id) : speaking.delete(id); changed = true; }
    }
    if (changed) for (const el of $$('[data-speak]')) el.classList.toggle('speaking', speaking.has(el.dataset.speak));
  }

  // ---------- starting & ending ----------
  async function begin(room, info) {
    if (c.room && c.room !== room) await hangup({ quiet: true });
    await loadIce();
    try { await ensureMic(); }
    catch { toast('Zuno needs your microphone for calls. Check that one is plugged in and allowed.', true); return false; }
    Object.assign(c, { room, phase: 'calling', startedAt: 0, ...info });
    let r;
    try { r = await api('POST', '/api/rtc/join', { room, ...myState() }); }
    catch (e) { toast(e.message, true); cleanup(); return false; }
    c.ringtone = r.ringtone || null;
    for (const u of r.users || []) state.users[u.id] = { ...state.users[u.id], ...u };
    for (const p of r.peers) { peerStates.set(p.userId, p); await callPeer(p.userId); }
    if (info.kind === 'voice') { c.phase = 'connected'; c.startedAt = Date.now(); sounds.join(); }
    clearInterval(clockTimer); clockTimer = setInterval(updateClock, 1000);
    render();
    return true;
  }

  async function startDM(peerId, { video = false } = {}) {
    if (c.room === dmRoom(peerId)) return;
    const ok = await begin(dmRoom(peerId), { kind: 'dm', peerId, serverId: null, channelId: null });
    if (!ok) return;
    if (video) await toggleCamera(true);
    startRing('outgoing', c.ringtone);
    ringTimer = setTimeout(() => {
      if (c.phase === 'calling') { toast(`${user(peerId)?.displayName || 'They'} didn't pick up.`); hangup({ quiet: true }); }
    }, RING_TIMEOUT);
  }

  // Group calls ring everyone in the group; people can join and leave while it goes on.
  async function startGroup(groupId, { video = false } = {}) {
    const room = 'gc:' + groupId;
    if (c.room === room) return;
    const live = (state.groups.find(g => g.id === groupId)?.call || []).length > 0;
    const ok = await begin(room, { kind: 'group', groupId, peerId: null, serverId: null, channelId: null });
    if (!ok) return;
    if (video) await toggleCamera(true);
    if (live || peerStates.size) { c.phase = 'connected'; c.startedAt = Date.now(); sounds.join(); render(); return; }
    startRing('outgoing', c.ringtone);
    ringTimer = setTimeout(() => { if (c.phase === 'calling' && !peerStates.size) { stopTone(); c.phase = 'connected'; c.startedAt = Date.now(); toast('Nobody picked up yet. You can wait here, and they can join any time.'); render(); } }, RING_TIMEOUT);
  }

  // Voice channel permissions (the server checks too).
  const vcPerm = (p, channelId = c.channelId) => { const ch = state.servers.find(s => s.id === (c.serverId || state.currentServerId))?.channels.find(x => x.id === channelId) || currentChannel(); return !ch?.perms || ch.perms.includes(p); };
  async function joinVoice(serverId, channelId) {
    const ch = state.servers.find(s => s.id === serverId)?.channels.find(x => x.id === channelId);
    if (ch?.perms && !ch.perms.includes('connect')) return toast("You don't have permission to join this voice channel.", true);
    await begin('vc:' + channelId, { kind: 'voice', serverId, channelId, peerId: null });
    if (ch?.perms && !ch.perms.includes('speak') && !c.muted) { c.muted = true; applyAudio(); toast("You can listen here, but you don't have permission to speak."); }
    renderServerSidebar();
    renderRail();
  }

  async function hangup({ quiet = false } = {}) {
    const room = c.room;
    if (!room) return;
    api('POST', '/api/rtc/leave', { room }).catch(() => {});
    if (!quiet) sounds.leave();
    cleanup();
  }
  function cleanup() {
    // Everyone from the call you're leaving, including people whose connection hadn't finished
    // yet (they used to stay behind and show up in your next call or voice channel).
    for (const id of new Set([...pcs.keys(), ...peerStates.keys(), ...pending.keys(), ...remote.keys()])) dropPeer(id);
    relayStopAll(); sigQ.clear(); pendingCid.clear(); relayToasted.clear();
    localAudio?.stop(); localAudio = null; meterTrack?.stop(); meterTrack = null;
    cameraTrack?.stop(); cameraTrack = null;
    screenStream?.getTracks().forEach(t => t.stop()); screenTrack = null; screenStream = null; screenAudio = null;
    meters.clear(); speaking.clear();
    clearInterval(meterTimer); meterTimer = null;
    clearInterval(clockTimer); clockTimer = null;
    clearTimeout(ringTimer); stopTone();
    Object.assign(c, { room: null, kind: null, peerId: null, groupId: null, serverId: null, channelId: null, phase: 'idle', video: false, screen: false, startedAt: 0 });
    render();
    if (state.currentServerId) { renderServerSidebar(); renderRail(); }
  }

  // ---------- controls ----------
  function toggleMute() {
    if (c.kind === 'voice' && c.muted && !vcPerm('speak')) return toast("You don't have permission to speak in this voice channel.", true);
    if (c.deafened) { c.deafened = false; c.muted = c.kind === 'voice' && !vcPerm('speak'); }
    else c.muted = !c.muted;
    applyAudio(); (c.muted ? sounds.mute : sounds.unmute)();
  }
  function toggleDeafen() {
    c.deafened = !c.deafened;
    if (!c.deafened && c.muted) c.muted = c.kind === 'voice' && !vcPerm('speak');
    applyAudio(); (c.deafened ? sounds.mute : sounds.unmute)();
  }
  function applyAudio() {
    if (localAudio) localAudio.enabled = micLive();
    applyPeerMutes();
    saveVoice(); pushState(); renderUserPanel(); render();
  }
  function attachScreenAudio(userId, track) {
    const key = userId + ':screen';
    let el = audioEls.get(key);
    if (!el) { el = document.createElement('audio'); el.autoplay = true; $('#call-audio').appendChild(el); audioEls.set(key, el); }
    el.srcObject = new MediaStream([track]);
    routeThroughGain(key, el);
    applyPeerMutes();
    el.play().catch(() => {});
  }
  async function setScreenAudio(track) {
    for (const pc of pcs.values()) { const t = pc.getTransceivers()[2]; if (t) await t.sender.replaceTrack(track).catch(() => {}); }
  }
  async function setVideoTrack(track) {
    for (const pc of pcs.values()) {
      const t = pc.getTransceivers().find(x => x.receiver.track?.kind === 'video');
      if (t) await t.sender.replaceTrack(track);
    }
    tuneSenders();
  }
  async function toggleCamera(force) {
    const on = force ?? !c.video;
    if (on && c.kind === 'voice' && !vcPerm('video')) return toast("You don't have permission to share video here.", true);
    if (on) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
        cameraTrack = s.getVideoTracks()[0];
      } catch { return toast("Zuno couldn't turn on your camera. Check that one is connected and allowed.", true); }
      c.video = true;
      if (c.screen) stopScreen(false);
    } else {
      cameraTrack?.stop(); cameraTrack = null; c.video = false;
    }
    await setVideoTrack(currentVideo());
    pushState(); render();
  }
  let shareSoundTipShown = false;
  function shareFailed(err) {
    console.warn('Screen share failed:', err);
    const n = err?.name;
    if (n === 'NotAllowedError') return toast(/mac/i.test(navigator.platform) ? 'Zuno needs permission to record your screen: System Settings › Privacy & Security › Screen Recording.' : "Your browser or computer didn't allow screen sharing. Check its permissions and try again.", true);
    if (n === 'NotFoundError') return toast('Nothing to share was found.', true);
    toast(`Couldn't start sharing your screen${err?.message ? `: ${err.message}` : '.'}`, true);
  }
  async function toggleScreen() {
    if (c.screen) return stopScreen(true);
    if (c.kind === 'voice' && !vcPerm('video')) return toast("You don't have permission to share your screen here.", true);
    try {
      if (window.zunoDesktop?.screenSources) {
        const id = await pickScreenSource();
        if (!id) return;
        await window.zunoDesktop.pickSource(id);
      }
      const q = await pickStreamQuality(hdAllowed());
      if (!q) return;
      streamQ = q;
      // (0.43.1) If sharing the computer's sound fails (no sound device, a driver that refuses,
      // a browser that can't), share without sound instead of failing quietly.
      const share = async withSound => {
        if (window.zunoDesktop?.setStreamSound) await window.zunoDesktop.setStreamSound(withSound);
        return navigator.mediaDevices.getDisplayMedia(withSound
          ? { video: streamConstraints(q), audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true, channelCount: 2, suppressLocalAudioPlayback: false }, systemAudio: 'include' }
          : { video: streamConstraints(q), audio: false });
      };
      const t0 = Date.now();
      try { screenStream = await share(q.sound); }
      catch (err) {
        const cancelled = err?.name === 'NotAllowedError' && !window.zunoDesktop && Date.now() - t0 > 600;
        if (cancelled) return;
        if (q.sound) {
          try { screenStream = await share(false); toast("Sharing without sound: your computer wouldn't share its sound this time."); }
          catch (err2) { return shareFailed(err2); }
        } else return shareFailed(err);
      }
    } catch (err) { return shareFailed(err); }
    screenTrack = screenStream.getVideoTracks()[0];
    screenAudio = screenStream.getAudioTracks()[0] || null;
    if (screenAudio) { try { screenAudio.contentHint = 'music'; } catch {} screenAudio.enabled = true; }
    c.screenSound = !!screenAudio;
    await setScreenAudio(screenAudio);
    if (streamQ.sound && !screenAudio && !shareSoundTipShown) { shareSoundTipShown = true; toast('Tip: to share sound too, tick "Share audio" when you pick what to share.'); }
    screenTrack.onended = () => stopScreen(true);
    if (c.video) { cameraTrack?.stop(); cameraTrack = null; c.video = false; }
    c.screen = true;
    await setVideoTrack(screenTrack);
    await applyStreamEncoding();
    pushState(); render();
  }
  // ---------- stream quality ----------
  // Pick a resolution and frame rate before going live (and change it while live from the
  // screen button's right-click). 1080p and up, and 60 FPS, need Bloom (or a Server Blooming perk).
  let streamQ = null;
  const hdAllowed = () => !!(limits().hdScreen || (c.room?.startsWith('vc:') && state.servers.some(sv => sv.blooming?.perks?.hdStreams && sv.channels.some(x => 'vc:' + x.id === c.room))));
  const STREAM_RES = { 480: [854, 480], 720: [1280, 720], 1080: [1920, 1080], 1440: [2560, 1440], source: null };
  const STREAM_BITRATE = { 480: 1.6e6, 720: 3.5e6, 1080: 6.5e6, 1440: 9e6, source: 10e6 }; // (0.39) higher, for sharper streams
  const streamPref = () => { try { return { res: '720', fps: 30, ...JSON.parse(localStorage.getItem('zuno_stream') || '{}') }; } catch { return { res: '720', fps: 30 }; } };
  function streamConstraints(q) {
    const wh = STREAM_RES[q.res];
    return { frameRate: { ideal: q.fps, max: q.fps }, ...(wh ? { width: { max: wh[0] }, height: { max: wh[1] } } : {}) };
  }
  // (0.28) Smoother streams:
  //  - The browser is told it's sending motion (games, video) at 30+ FPS, so when the connection
  //    is tight it keeps the frame rate up and lowers sharpness, instead of stuttering. At 15 FPS
  //    it keeps text sharp instead (slides, code).
  //  - Every viewer gets their own copy from the streamer, so the streamer's upload is shared: with
  //    more than two viewers each copy gets a smaller slice (never below 700 kbps), instead of
  //    everyone's stream freezing because the upload is full.
  //  - People who join after the stream started get the same settings (they used to get the
  //    browser's defaults).
  async function applyStreamEncoding() {
    if (!streamQ || !screenTrack) return;
    // (0.39) Sharp by default: most streams are screens with text (sites, maps, code), where blur is
    // what people notice. Only 60 FPS streams (games) trade sharpness for smoothness.
    const smooth = streamQ.fps >= 60;
    try { screenTrack.contentHint = smooth ? 'motion' : 'detail'; } catch {}
    const viewers = Math.max(1, pcs.size);
    const rate = Math.max(1.2e6, Math.round(STREAM_BITRATE[streamQ.res] * Math.min(1, 2 / viewers)));
    for (const pc of pcs.values()) {
      const t = pc.getTransceivers().find(x => x.sender.track === screenTrack);
      if (!t) continue;
      try {
        const p = t.sender.getParameters();
        p.encodings = p.encodings?.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = rate; p.encodings[0].maxFramerate = streamQ.fps;
        p.degradationPreference = smooth ? 'maintain-framerate' : 'maintain-resolution';
        await t.sender.setParameters(p);
      } catch {}
    }
  }
  // (0.56) In bigger calls your camera and voice go to everyone separately, so each copy is made
  // lighter as the call grows: a 6-person call no longer needs 5 full-quality uploads.
  async function tuneSenders() {
    const n = pcs.size;
    const cam = n > 6 ? 180e3 : n > 4 ? 260e3 : n > 2 ? 500e3 : 1.2e6;
    for (const pc of pcs.values()) for (const t of pc.getTransceivers()) {
      const tr = t.sender.track;
      if (!tr || tr === screenTrack) continue;
      try {
        const p = t.sender.getParameters();
        p.encodings = p.encodings?.length ? p.encodings : [{}];
        if (tr.kind === 'video') { p.encodings[0].maxBitrate = cam; p.encodings[0].scaleResolutionDownBy = n > 4 ? 2 : 1; }
        else p.encodings[0].maxBitrate = n > 4 ? 32000 : 48000;
        await t.sender.setParameters(p);
      } catch {}
    }
  }
  function pickStreamQuality(hd, live = false) {
    const pref = streamPref();
    if (!hd) { if (+pref.res >= 1080 || pref.res === 'source') pref.res = '720'; if (pref.fps > 30) pref.fps = 30; }
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'overlay call-overlay';
      const lock = need => (need && !hd ? ' locked' : '');
      const res = [['480', '480p'], ['720', '720p'], ['1080', '1080p', true], ['1440', '1440p', true], ['source', 'Source', true]];
      const fps = [[15, '15'], [30, '30'], [60, '60', true]];
      box.innerHTML = `<div class="dialog modal stream-q"><h3>${live ? 'Stream quality' : 'Go live'}</h3>
        <div class="sq-label">Resolution</div><div class="sq-row">${res.map(([v, l, b]) => `<button class="sq-opt${pref.res === v ? ' on' : ''}${lock(b)}" data-res="${v}">${l}${b ? '<i class="sq-bloom" title="Zuno Bloom">Bloom</i>' : ''}</button>`).join('')}</div>
        <div class="sq-label">Frame rate</div><div class="sq-row">${fps.map(([v, l, b]) => `<button class="sq-opt${pref.fps === v ? ' on' : ''}${lock(b)}" data-fps="${v}">${l} FPS${b ? '<i class="sq-bloom" title="Zuno Bloom">Bloom</i>' : ''}</button>`).join('')}</div>
        ${live ? '' : `<label class="sq-sound"><input type="checkbox" id="sq-sound"${pref.sound === false ? '' : ' checked'}><span><b>Share sound</b><span class="muted small">Others hear your stream's audio. You can mute it while you're live too.</span></span></label>`}
        ${hd ? '' : '<p class="muted small sq-note">1080p and up, and 60 FPS, come with Zuno Bloom (or a server with Server Blooming level 2).</p>'}
        <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="go">${live ? 'Apply' : 'Go Live'}</button></div></div>`;
      document.body.appendChild(box);
      const done = v => { box.remove(); resolve(v); };
      box.addEventListener('mousedown', e => { if (e.target === box) done(null); });
      $('[data-a=cancel]', box).addEventListener('click', () => done(null));
      for (const b of $$('.sq-opt', box)) b.addEventListener('click', () => {
        if (b.classList.contains('locked')) { toast('That needs Zuno Bloom.'); if (typeof openSettings === 'function') { done(null); openSettings('bloom'); } return; }
        const key = b.dataset.res ? 'res' : 'fps';
        pref[key] = b.dataset.res || Number(b.dataset.fps);
        for (const x of $$(`[data-${key}]`, box)) x.classList.toggle('on', x === b);
      });
      $('[data-a=go]', box).addEventListener('click', () => { try { localStorage.setItem('zuno_stream', JSON.stringify(pref)); } catch {} const snd = $('#sq-sound', box); if (snd) pref.sound = snd.checked; try { localStorage.setItem('zuno_stream', JSON.stringify(pref)); } catch {} done({ res: String(pref.res), fps: Number(pref.fps), sound: pref.sound !== false }); });
    });
  }
  async function changeStreamQuality() {
    if (!c.screen || !screenTrack) return;
    const q = await pickStreamQuality(hdAllowed(), true);
    if (!q) return;
    streamQ = q;
    try { await screenTrack.applyConstraints(streamConstraints(q)); } catch {}
    await applyStreamEncoding();
    toast(`Streaming at ${q.res === 'source' ? 'source resolution' : q.res + 'p'}, ${q.fps} FPS`);
  }
  // Stream sound on/off while live (the track stays, it just goes quiet).
  function toggleStreamSound() {
    if (!screenAudio) return;
    c.screenSound = !c.screenSound;
    screenAudio.enabled = c.screenSound;
    toast(c.screenSound ? "Your stream's sound is back on." : "Your stream's sound is off.");
    render();
  }
  async function stopScreen(update) {
    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null; screenTrack = null; c.screen = false;
    if (screenAudio) { screenAudio = null; setScreenAudio(null); }
    if (update) { await setVideoTrack(currentVideo()); pushState(); render(); }
  }
  // In the desktop app, choose which screen or window to share.
  async function pickScreenSource() {
    const sources = await window.zunoDesktop.screenSources();
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.className = 'overlay call-overlay';
      box.innerHTML = `<div class="dialog modal screen-picker"><h3>Share your screen</h3>
        <div class="sp-grid">${sources.map(s => `<button class="sp-item" data-id="${esc(s.id)}"><img src="${s.thumb}" alt=""><span>${esc(s.name)}</span></button>`).join('')}</div>
        <div class="actions"><button class="btn btn-link" data-a="cancel">Cancel</button></div></div>`;
      document.body.appendChild(box);
      const done = id => { box.remove(); resolve(id); };
      box.addEventListener('mousedown', e => { if (e.target === box) done(null); });
      $('[data-a=cancel]', box).addEventListener('click', () => done(null));
      $$('[data-id]', box).forEach(b => b.addEventListener('click', () => done(b.dataset.id)));
    });
  }

  // ---------- incoming calls ----------
  function showRing({ room, from, video, ringtone, group }) {
    if (c.room === room) return;
    state.users[from.id] = { ...state.users[from.id], ...from };
    dismissRing();
    ringing = { room, from, video, group };
    const box = document.createElement('div');
    box.className = 'ring-card';
    box.id = 'ring-card';
    box.innerHTML = `<div class="ring-av" data-speak="">${avatar(from, 88)}</div>
      <div class="ring-name">${esc(from.displayName)}</div>
      <div class="ring-sub">${group ? groupRingText(group, from) : `Incoming ${video ? 'video' : 'voice'} call…`}</div>
      <div class="ring-actions">
        <button class="call-btn hang" data-a="decline" title="Decline">${ICON.hangup}</button>
        <button class="call-btn accept" data-a="accept" title="Accept">${ICON.phone}</button>
      </div>`;
    document.body.appendChild(box);
    $('[data-a=accept]', box).addEventListener('click', acceptRing);
    $('[data-a=decline]', box).addEventListener('click', declineRing);
    if (state.me.statusPref !== 'dnd') startRing('incoming', ringtone);
    if (document.hidden || !document.hasFocus()) {
      try { if (prefs().desktopNotifications && Notification.permission === 'granted') new Notification(`${from.displayName} is calling`, { body: 'Open Zuno to answer.', icon: from.avatar || '/logo.png' }).onclick = () => window.zunoDesktop?.focus(); } catch {}
    }
    ringing.timer = setTimeout(() => dismissRing(), RING_TIMEOUT);
  }
  function dismissRing() {
    if (!ringing) return;
    clearTimeout(ringing.timer);
    $('#ring-card')?.remove();
    ringing = null;
    if (c.phase !== 'calling') stopTone();
  }
  async function acceptRing() {
    const r = ringing;
    if (!r) return;
    dismissRing(); stopTone();
    if (r.group) {
      await openGroup(r.group.id);
      const ok = await begin(r.room, { kind: 'group', groupId: r.group.id, peerId: null, serverId: null, channelId: null });
      if (ok) { c.phase = 'connected'; c.startedAt = Date.now(); render(); if (r.video) toggleCamera(true); }
      return;
    }
    await openDM(r.from.id);
    const ok = await begin(r.room, { kind: 'dm', peerId: r.from.id, serverId: null, channelId: null });
    if (ok && r.video) toggleCamera(true);
  }
  function declineRing() {
    const r = ringing;
    if (!r) return;
    api('POST', '/api/rtc/decline', { room: r.room }).catch(() => {});
    dismissRing();
  }

  // ---------- events from the server ----------
  function onEvent(type, d) {
    if (type === 'call-ring') return showRing(d);
    if (type === 'call-ended') {
      if (ringing?.room === d.room) dismissRing();
      if (c.room === d.room) { if (d.removed) toast("You were removed from the call."); else if (c.kind === 'dm') toast('Call ended'); hangup({ quiet: false }); }
      return;
    }
    if (d.room !== c.room) return;
    if (type === 'call-declined') { toast(`${user(d.by)?.displayName || 'They'} declined the call.`); hangup({ quiet: true }); }
    if (type === 'rtc-peer-joined') {
      if (d.user) state.users[d.user.id] = { ...state.users[d.user.id], ...d.user };
      peerStates.set(d.userId, { muted: false, deafened: false, video: false, screen: false, ...(d.state || {}) });
      if (c.kind === 'dm' || (c.kind === 'group' && c.phase === 'calling')) { c.phase = 'connected'; c.startedAt = Date.now(); stopTone(); clearTimeout(ringTimer); }
      sounds.join();
      render();
    }
    if (type === 'rtc-peer-left') { dropPeer(d.userId); if (c.kind !== 'dm') sounds.leave(); render(); if (c.screen) setTimeout(applyStreamEncoding, 500); }
    if (type === 'rtc-peer-joined' && c.screen) setTimeout(applyStreamEncoding, 2500);
    if (type === 'rtc-peer-joined' || type === 'rtc-peer-left') setTimeout(tuneSenders, 3000);
    if (type === 'rtc-signal') onSignal(d).catch(err => console.warn('call signal', err));
    if (type === 'rtc-relay') relayIn(d);
    if (type === 'rtc-state') { if (!d.screen) hiddenStreams.delete(d.userId); peerStates.set(d.userId, { muted: d.muted, deafened: d.deafened, video: d.video, screen: d.screen }); applyPeerMutes(); render(); }
  }

  // ---------- drawing ----------
  function fmtClock() {
    if (!c.startedAt) return '';
    const s = Math.floor((Date.now() - c.startedAt) / 1000);
    return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function updateClock() { for (const el of $$('[data-call-clock]')) el.textContent = c.phase === 'calling' ? 'Calling…' : fmtClock(); }

  function participants() {
    const ids = [state.me.id, ...peerStates.keys()];
    if (c.kind === 'dm' && !peerStates.has(c.peerId)) ids.push(c.peerId); // show who you're calling
    return [...new Set(ids)];
  }
  function tile(id) {
    const u = user(id) || { id, displayName: '…' };
    const me = id === state.me.id;
    const st = me ? myState() : peerStates.get(id);
    const waiting = !me && !peerStates.has(id);
    const hidden = !me && st?.screen && !watching(id);
    const vtrack = me ? currentVideo() : (st?.video || st?.screen) && !hidden ? remote.get(id)?.video : null;
    const label = `${esc(u.displayName)}${st?.screen ? ' <i class="live">LIVE</i>' : ''}`;
    const sa = peerAudio(id + ':screen');
    const streamBar = me || !st?.screen ? ''
      : hidden ? `<button class="btn btn-primary btn-sm tile-watch" data-watch="${esc(id)}">Watch Stream</button>`
      : `<div class="stream-bar"><button class="sb-btn" data-stream-mute="${esc(id)}" title="${sa.muted ? 'Unmute Stream' : 'Mute Stream'}">${sa.muted ? '🔇' : '🔊'}</button>
          <input type="range" class="sb-vol" data-stream-vol="${esc(id)}" min="0" max="200" step="5" value="${sa.vol}" title="Stream volume" aria-label="Stream volume">
          <button class="sb-btn sb-stop" data-unwatch="${esc(id)}" title="Stop Watching">✕ Stop Watching</button></div>`;
    return `<div class="tile${vtrack ? ' has-video' : ''}${waiting ? ' waiting' : ''}${st?.screen ? ' screen' : ''}${hidden ? ' not-watching' : ''}${focused === id ? ' focused' : ''}" data-tile="${esc(id)}" data-speak="${esc(id)}">
      ${vtrack ? `<button class="tile-widen" data-widen="${esc(id)}" title="${focused === id ? 'Make smaller' : 'Make bigger'}" aria-label="${focused === id ? 'Make smaller' : 'Make bigger'}">${focused === id ? '⤡' : '⤢'}</button>` : ''}
      ${vtrack ? `<video autoplay playsinline muted data-vid="${esc(id)}"></video>` : `<div class="tile-av">${avatar(u, 80)}</div>`}${streamBar}
      <div class="tile-name">${label}${!me && peerAudio(id).muted ? '<i class="ti" title="Muted for you">🔇</i>' : st?.muted ? `<i class="ti">${ICON.micOff}</i>` : ''}${st?.deafened ? `<i class="ti">${ICON.deafen}</i>` : ''}</div>
    </div>`;
  }
  function attachVideos(root) {
    for (const v of $$('video[data-vid]', root)) {
      const id = v.dataset.vid;
      const track = id === state.me.id ? currentVideo() : remote.get(id)?.video;
      if (track && v.srcObject?.getVideoTracks()[0] !== track) v.srcObject = new MediaStream([track]);
      v.classList.toggle('mirror', id === state.me.id && !!cameraTrack && !screenTrack);
    }
    for (const t of $$('[data-tile]', root)) t.addEventListener('dblclick', e => { if (!e.target.closest('.stream-bar, .tile-watch')) t.requestFullscreen?.(); });
    for (const b of $$('[data-widen]', root)) b.addEventListener('click', e => { e.stopPropagation(); setFocus(b.dataset.widen); });
    // Clicking the video itself widens it too (not the buttons on it).
    for (const t of $$('.tile.has-video', root)) t.addEventListener('click', e => { if (!e.target.closest('button, input, .stream-bar')) setFocus(t.dataset.tile); });
    for (const b of $$('[data-watch]', root)) b.addEventListener('click', () => setWatching(b.dataset.watch, true));
    for (const b of $$('[data-unwatch]', root)) b.addEventListener('click', () => setWatching(b.dataset.unwatch, false));
    for (const b of $$('[data-stream-mute]', root)) b.addEventListener('click', () => { const k = b.dataset.streamMute + ':screen'; setPeerAudio(k, { muted: !peerAudio(k).muted }); });
    for (const r of $$('[data-stream-vol]', root)) {
      r.addEventListener('input', () => setPeerAudio(r.dataset.streamVol + ':screen', { vol: Number(r.value) }));
      r.addEventListener('dblclick', e => e.stopPropagation());
    }
    for (const el of $$('[data-speak]', root)) el.classList.toggle('speaking', speaking.has(el.dataset.speak));
  }
  function controls() {
    return `<div class="call-controls">
      <button class="call-btn${c.video ? ' on' : ''}" data-c="camera" title="${c.video ? 'Turn Off Camera' : 'Turn On Camera'}">${ICON.video}</button>
      <button class="call-btn${c.screen ? ' on' : ''}" data-c="screen" title="${c.screen ? 'Stop Sharing' : 'Share Your Screen'}">${ICON.screen}</button>
      ${c.screen && screenAudio ? `<button class="call-btn${c.screenSound ? ' on' : ''}" data-c="streamsound" title="${c.screenSound ? 'Stream sound is on (click to mute it)' : 'Stream sound is off (click to share it)'}">${c.screenSound ? '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7l-1.2-1.2a3.3 3.3 0 0 0 0-4.6zm2.4-2.4a8.4 8.4 0 0 1 0 11.8l-1.2-1.2a6.7 6.7 0 0 0 0-9.4z"/></svg>' : '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4zm12.3.3 1.4-1.4 2 2 2-2 1.4 1.4-2 2 2 2-1.4 1.4-2-2-2 2-1.4-1.4 2-2z"/></svg>'}</button>` : ''}
      ${c.screen ? `<button class="call-btn" data-c="quality" title="Stream quality (${streamQ ? (streamQ.res === 'source' ? 'Source' : streamQ.res + 'p') + ' · ' + streamQ.fps + ' FPS' : ''})">${streamQ ? (streamQ.res === 'source' ? 'SRC' : streamQ.res + 'p') : 'HD'}</button>` : ''}
      ${window.zunoClips?.on() ? `<button class="call-btn clip-btn" data-c="clip" title="Clip the last ${window.zunoClips.seconds()} seconds (${esc(window.zunoClips.keyName())})">${window.zunoClips.icon}</button>` : ''}
      ${ptt() ? `<button class="call-btn ptt-btn${pttHeld ? ' on' : ''}" data-c="ptt" title="Hold to talk (or hold ${esc(voiceSettings().pttName || voiceSettings().pttKey)})">🎙 Hold to Talk</button>` : ''}
      <button class="call-btn${c.muted || c.deafened ? ' off' : ''}" data-c="mute" title="${c.muted ? 'Unmute' : 'Mute'}">${c.muted || c.deafened ? ICON.micOff : ICON.mic}</button>
      <button class="call-btn${c.deafened ? ' off' : ''}" data-c="deafen" title="${c.deafened ? 'Undeafen' : 'Deafen'}">${c.deafened ? ICON.deafen : ICON.headphones}</button>
      <button class="call-btn" data-c="sounds" title="Soundboard">🎵</button>
      <button class="call-btn" data-c="activity" title="Listen Together / Watch Together">▶</button>
      <button class="call-btn hang" data-c="leave" title="${c.kind === 'voice' ? 'Disconnect' : 'Leave Call'}">${ICON.hangup}</button>
    </div>`;
  }
  function wireControls(root) {
    $$('[data-c="ptt"]', root).forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); setPtt(true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => setPtt(false));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    $$('[data-c="screen"]', root).forEach(b => b.addEventListener('contextmenu', e => { if (c.screen) { e.preventDefault(); changeStreamQuality(); } }));
    $$('[data-c]:not([data-c="ptt"])', root).forEach(b => b.addEventListener('click', () => ({
      camera: () => toggleCamera(), screen: () => toggleScreen(), quality: () => changeStreamQuality(), streamsound: () => toggleStreamSound(), clip: () => window.zunoClips?.clip(), mute: toggleMute, deafen: toggleDeafen, leave: () => hangup(), sounds: () => openSoundboard(b), activity: () => window.openActivities?.(b),
    })[b.dataset.c]()));
  }

  // The call area at the top of a DM.
  // Redraws keep the video players that are already showing someone (0.28). Rebuilding them on
  // every change (someone muting, joining, talking) restarted each stream, which made streams
  // stutter and flash black.
  function keepVideos(root, draw) {
    const old = new Map([...root.querySelectorAll('video[data-vid]')].map(v => [v.dataset.vid, v]));
    draw();
    for (const v of root.querySelectorAll('video[data-vid]')) {
      const o = old.get(v.dataset.vid);
      if (!o || !o.srcObject) continue;
      for (const a of v.attributes) if (a.name !== 'src') o.setAttribute(a.name, a.value);
      o.className = v.className;
      v.replaceWith(o);
      if (o.paused) o.play().catch(() => {});
    }
  }
  function renderSlot() {
    const slot = $('#call-slot');
    if (!slot) return;
    const here = (c.kind === 'dm' && state.view.type === 'dm' && state.view.peerId === c.peerId) || (c.kind === 'group' && state.view.type === 'group' && state.view.groupId === c.groupId) || (c.kind === 'voice' && state.view.type === 'channel' && state.view.voice && state.view.channelId === c.channelId);
    if (!here) { slot.innerHTML = ''; slot.className = ''; return; }
    slot.className = 'call-panel' + (participants().some(id => id === state.me.id ? currentVideo() : peerStates.get(id)?.video || peerStates.get(id)?.screen) ? ' tall' : '');
    keepVideos(slot, () => { slot.innerHTML = `<div class="call-tiles${focusClass()}">${participants().map(tile).join('')}</div>
      <div class="call-status" data-call-clock>${c.phase === 'calling' ? 'Calling…' : fmtClock()}</div>${controls()}`; });
    attachVideos(slot); wireControls(slot);
  }

  // The "Voice Connected" bar above your name in the sidebar.
  function renderBar() {
    const bar = $('#voice-bar');
    if (!bar) return;
    if (!c.room) { bar.innerHTML = ''; return; }
    let where = '';
    if (c.kind === 'dm') where = user(c.peerId)?.displayName || 'Call';
    else if (c.kind === 'group') where = groupTitle(state.groups.find(g => g.id === c.groupId));
    else {
      const sv = state.servers.find(s => s.id === c.serverId);
      const ch = sv?.channels.find(x => x.id === c.channelId);
      where = `${ch?.name || 'Voice'} / ${sv?.name || ''}`;
    }
    bar.innerHTML = `<div class="vbar">
      <div class="vbar-info" id="vbar-go"><b class="${c.phase === 'connected' ? 'ok' : ''}">${c.phase === 'connected' ? 'Voice Connected' : 'Calling…'}</b><span>${esc(where)}</span></div>
      <button class="icon-btn${c.video ? ' on' : ''}" data-c="camera" title="Camera">${ICON.video}</button>
      <button class="icon-btn${c.screen ? ' on' : ''}" data-c="screen" title="Share Screen">${ICON.screen}</button>
      <button class="icon-btn vbar-sb" data-vbar-sb title="Soundboard"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg></button>
      <button class="icon-btn hang" data-c="leave" title="Disconnect">${ICON.hangup}</button></div>`;
    $('[data-vbar-sb]', bar)?.addEventListener('click', e => window.openSoundboard?.(e.currentTarget)); // (0.39)
    wireControls(bar);
    $('#vbar-go').addEventListener('click', () => (c.kind === 'dm' ? openDM(c.peerId) : c.kind === 'group' ? openGroup(c.groupId) : openVoice(c.serverId, c.channelId)));
  }

  function render() {
    renderSlot();
    renderBar();
    if (state.view.type === 'voice') renderVoiceStage();
    if (state.currentServerId && c.kind === 'voice') renderServerSidebar();
  }

  return {
    get room() { return c.room; },
    get muted() { return c.muted || c.deafened; },
    get deafened() { return c.deafened; },
    get state() { return c; },
    synth: { bell, pluck, tick, tone, ctx }, voiceSettings, applyInputMode, get pttHeld() { return pttHeld; }, get micLevel() { return gateLevel; },
    voiceFxList: VOICE_FX, keepVideos, remoteVideo: id => remote.get(id)?.video || null, relayInfo: () => ({ to: [...relayTo], from: [...relayFrom.keys()], outs: [...relayFrom.values()].map(r => r.outs || 0), errs: relayErrs }), previewRing, refreshMic, startGroup, startDM, joinVoice, hangup, toggleMute, toggleDeafen, toggleCamera, toggleScreen, onEvent, renderSlot, changeStreamQuality,
    participants: () => (c.room ? participants() : []),
    // What a clip records: every voice (yours too) and stream sound, plus the video you're looking at.
    clipSources: () => ({
      audio: [localAudio, ...[...audioEls.values()].map(el => el.srcObject?.getAudioTracks()[0])].filter(t => t && t.readyState === 'live'),
      video: (focused && (focused === state.me?.id ? currentVideo() : remote.get(focused)?.video)) || screenTrack || [...remote.entries()].find(([id, r]) => r.video && peerStates.get(id)?.screen)?.[1].video || [...remote.values()].find(r => r.video?.readyState === 'live')?.video || cameraTrack || null,
    }),
    peerState: id => (id === state.me?.id && c.room ? myState() : peerStates.get(id)),
    peerAudio, setPeerAudio, watching, setWatching, inCallWith: id => !!c.room && id !== state.me?.id && peerStates.has(id),
    isSpeaking: id => speaking.has(id),
    // (0.38) The connection to someone in the call, for the signal bars.
    stats: id => pcs.get(id)?.getStats() || Promise.resolve(null),
    peerIds: () => [...pcs.keys()],
    stageHtml: () => `<div class="call-tiles stage${focusClass()}">${participants().map(tile).join('')}</div>${controls()}`,
    wireStage: root => { attachVideos(root); wireControls(root); },
  };
})();

// The main area of a voice channel: everyone in it, or a button to join.
function renderVoiceStage() {
  const el = $('#voice-stage');
  if (!el || state.view.type !== 'voice') return;
  const room = 'vc:' + state.view.channelId;
  const ch = currentChannel();
  if (Calls.room === room) {
    Calls.keepVideos(el, () => { el.innerHTML = Calls.stageHtml(); });
    Calls.wireStage(el);
    return;
  }
  const sv = currentServer();
  const inside = sv?.voice?.[state.view.channelId] || [];
  el.innerHTML = `<div class="voice-empty">
    ${mascot(inside.length ? 'happy' : 'sleepy')}
    <h2>${esc(ch?.name || 'Voice')}</h2>
    <p class="muted">${inside.length ? `${inside.map(id => esc(user(id)?.displayName || 'Someone')).join(', ')} ${inside.length === 1 ? 'is' : 'are'} hanging out here.` : 'No one is here yet. Jump in and others can join you.'}</p>
    <button class="btn btn-green" id="join-voice">Join Voice</button></div>`;
  $('#join-voice').addEventListener('click', () => Calls.joinVoice(state.view.serverId, state.view.channelId));
}
