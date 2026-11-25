'use strict';
// Zuno 0.41 Editor (loaded only when someone opens it, since 0.45).
// ======================= the Editor =======================
// "Make your own" › Open the Editor: draw, add shapes, text, symbols, emoji and pictures over the
// kit, make things move, and see it on you as you go. Saving only keeps your art, never the kit.
{
  const KITS = {
    decoration: { w: 512, h: 512, tpl: '/templates/zuno-frame-kit-512.png', label: 'Decoration' },
    effect: { w: 600, h: 900, tpl: '/templates/zuno-effect-kit-600x900.png', label: 'Profile effect' },
    banner: { w: 600, h: 100, tpl: '/templates/zuno-banner-kit-600x100.png', label: 'Name banner' },
  };
  const MAX_BYTES = { decoration: 2.4e6, effect: 4.8e6, banner: 1.9e6 };
  // Symbols are drawn in a 100×100 box. [path, fill rule]
  const petals = (n, d, r) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2, x = 50 + d * Math.cos(a), y = 50 + d * Math.sin(a); return `M${x + r} ${y}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0z`; }).join('');
  const poly = pts => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'z';
  const circ = (cx, cy, r) => `M${cx + r} ${cy}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0z`;
  const ell = (cx, cy, rx, ry) => `M${cx + rx} ${cy}a${rx} ${ry} 0 1 0 ${-2 * rx} 0a${rx} ${ry} 0 1 0 ${2 * rx} 0z`;
  const SYMBOLS = {
    star: ['M50 5l13.2 28.4 31 3.6-23 21 6.2 30.7L50 73.5 22.6 88.7l6.2-30.7-23-21 31-3.6z'],
    heart: ['M50 90C20 68 5 52 5 33 5 18 16 8 30 8c9 0 16 5 20 12 4-7 11-12 20-12 14 0 25 10 25 25 0 19-15 35-45 57z'],
    sparkle: ['M50 2c3 26 22 45 48 48-26 3-45 22-48 48-3-26-22-45-48-48C28 47 47 28 50 2z'],
    moon: ['M64 6a44 44 0 1 0 30 70A37 37 0 0 1 64 6z'],
    crown: ['M8 80h84l6-54-27 21L50 10 29 47 2 26z'],
    ears: ['M6 64 20 6l32 40zM94 64 80 6 48 46z'],
    halo: ['M50 34c26 0 46 6 46 15S76 64 50 64 4 58 4 49s20-15 46-15zm0 8c-21 0-36 3-36 7s15 7 36 7 36-3 36-7-15-7-36-7z', 'evenodd'],
    bow: ['M50 40c-6 0-9 4-9 10s3 10 9 10 9-4 9-10-3-10-9-10zM43 44 8 22c-6 14-6 42 0 56l35-22zM57 44l35-22c6 14 6 42 0 56L57 56z'],
    flower: [petals(5, 24, 19) + 'M62 50a12 12 0 1 0-24 0 12 12 0 1 0 24 0z'],
    bolt: ['M58 2 14 56h28l-8 42 46-58H52z'],
    flame: ['M50 2c6 22 30 30 30 58a30 30 0 0 1-60 0c0-16 10-24 14-36 4 12 8 16 12 18C48 32 44 18 50 2z'],
    cloud: ['M26 82a21 21 0 0 1-3-42 27 27 0 0 1 52-7 23 23 0 0 1 4 49z'],
    drop: ['M50 4C34 30 20 46 20 64a30 30 0 0 0 60 0C80 46 66 30 50 4z'],
    note: ['M36 14 90 2v64a14 12 0 1 1-8-11V20L44 28v48a14 12 0 1 1-8-11z'],
    leaf: ['M92 8C44 6 8 36 10 80c0 6 3 12 7 12 1-30 30-56 60-62-26 12-46 32-52 58 52 4 78-32 67-80z'],
    paw: [[[20, 42], [37, 22], [63, 22], [80, 42]].map(([x, y]) => `M${x + 10} ${y}a10 11 0 1 0-20 0a10 11 0 1 0 20 0z`).join('') + 'M50 44c-16 0-28 16-28 30 0 10 8 14 14 14 6 0 9-4 14-4s8 4 14 4c6 0 14-4 14-14 0-14-12-30-28-30z'],
    diamond: ['M50 4 94 50 50 96 6 50z'],
    ring: ['M50 6a44 44 0 1 1 0 88 44 44 0 1 1 0-88zm0 12a32 32 0 1 0 0 64 32 32 0 1 0 0-64z', 'evenodd'],
    dots: [petals(8, 38, 7)],
    wing: ['M4 70C10 30 40 10 96 8c-10 10-22 14-34 16 10 2 18 0 26-2-8 12-20 18-34 20 8 2 16 2 22 0-12 14-30 22-52 22-8 0-14 2-20 6z'],
    // 0.44: more symbols
    star4: ['M50 4 61 39 96 50 61 61 50 96 39 61 4 50 39 39z'],
    burst: [poly(Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 30 : 47; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; }))],
    sun: [circ(50, 50, 21) + Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2, p = (d, o) => [50 + d * Math.cos(a + o), 50 + d * Math.sin(a + o)]; return poly([p(28, -0.2), p(47, 0), p(28, 0.2)]); }).join('')],
    snow: [Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), pt = (x, y) => [50 + x * c - y * sn, 50 + x * sn + y * c]; return poly([pt(0, -3.5), pt(44, -3.5), pt(44, 3.5), pt(0, 3.5)]) + poly([pt(26, 0), pt(36, -11), pt(39, -8), pt(30, 3)]) + poly([pt(26, 0), pt(36, 11), pt(39, 8), pt(30, -3)]); }).join('')],
    triangle: ['M50 8 94 88H6z'],
    hexagon: [poly(Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 - Math.PI / 2; return [50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)]; }))],
    plus: ['M38 6h24v32h32v24H62v32H38V62H6V38h32z'],
    arrow: ['M6 38h52V14l36 36-36 36V62H6z'],
    shield: ['M50 4 90 18v28c0 26-18 42-40 50C28 88 10 72 10 46V18z'],
    bubble: ['M14 10h72a10 10 0 0 1 10 10v44a10 10 0 0 1-10 10H40L20 92V74h-6A10 10 0 0 1 4 64V20a10 10 0 0 1 10-10z'],
    ghost: ['M50 6C28 6 14 22 14 44v50l12-10 12 10 12-10 12 10 12-10 12 10V44C86 22 72 6 50 6zM44 40a6 7 0 1 1-12 0 6 7 0 1 1 12 0zM68 40a6 7 0 1 1-12 0 6 7 0 1 1 12 0z', 'evenodd'],
    cat: ['M18 34 24 6l20 18a36 30 0 0 1 12 0L76 6l6 28a34 30 0 1 1-64 0z'],
    butterfly: [ell(30, 34, 22, 26) + ell(70, 34, 22, 26) + ell(33, 70, 16, 18) + ell(67, 70, 16, 18) + ell(50, 52, 5, 32)],
    mushroom: ['M8 54C8 28 28 10 50 10s42 18 42 44zM38 54h24l4 38H34z'],
    petal: ['M50 94C20 72 12 42 26 20c8-12 18-12 24-4 6-8 16-8 24 4 14 22 6 52-24 74z'],
    cherry: [circ(30, 74, 17) + circ(70, 70, 17) + poly([[29, 58], [33, 58], [56, 10], [52, 8]]) + poly([[68, 54], [72, 55], [58, 9], [54, 10]]) + 'M54 10c10-6 24-4 32 4-10 4-22 4-32-4z'],
    lips: ['M6 48c12-14 28-22 44-12 16-10 32-2 44 12-14 22-30 32-44 32S20 70 6 48z'],
    eye: ['M4 50C18 26 34 16 50 16s32 10 46 34C82 74 66 84 50 84S18 74 4 50zM50 30a20 20 0 1 0 0 40 20 20 0 1 0 0-40z', 'evenodd'],
    music2: ['M30 24 86 10v60a13 11 0 1 1-8-10V28L38 37v43a13 11 0 1 1-8-10z'],
    swirl: ['M50 6a44 44 0 1 1-44 44h12a32 32 0 1 0 32-32 20 20 0 1 0 20 20h-10a10 10 0 1 1-10-10z'],
  };
  const EMOJI = ['✨', '💖', '⭐', '🌸', '🔥', '🎀', '👑', '🌙', '☁️', '⚡', '🍀', '🦋', '🎵', '💎', '🌈', '🐾', '❄️', '🍓', '🌟', '💫', '🍄', '🌻', '🐱', '👻', '💜', '🖤', '💙', '💚', '🧡', '🤍', '🌊', '🍒', '🍉', '🧸', '🎃', '🕸️', '🦇', '🐉', '🦄', '🐰', '🐸', '🌷', '🪐', '☄️', '🫧', '🎶', '🎮', '🗡️'];
  const SWATCHES = ['#ffffff', '#1b1f22', '#04c5ae', '#5865f2', '#b06cff', '#ff7eb6', '#ff5f5f', '#ff9f43', '#ffd166', '#7bd88f', '#4cc9f0', '#8d6e63'];
  // Google fonts the Editor loads when it opens (0.44: many more).
  const GFONTS = ['Fredoka', 'Figtree', 'Nunito', 'Bungee', 'Caveat', 'Comfortaa', 'Creepster', 'Lobster', 'Monoton', 'Orbitron', 'Pacifico', 'Permanent Marker', 'Press Start 2P', 'Righteous', 'Bangers', 'Baloo 2', 'Dancing Script', 'Indie Flower', 'Shadows Into Light', 'Silkscreen', 'VT323', 'Rubik Mono One', 'Satisfy', 'Abril Fatface', 'Bebas Neue', 'Cinzel', 'Kalam', 'Luckiest Guy', 'Audiowide', 'Special Elite', 'Great Vibes', 'Sacramento', 'Chewy', 'Gloria Hallelujah', 'Rubik Glitch', 'Nosifer', 'Black Ops One', 'Lilita One'];
  const FONTS = [['Rounded', "'Nunito', 'Segoe UI', sans-serif"], ['Bold', "'Segoe UI', Arial, sans-serif"], ['Serif', "Georgia, 'Times New Roman', serif"], ['Mono', "'Consolas', 'Courier New', monospace"], ['Script', "'Brush Script MT', 'Segoe Script', cursive"],
    ...GFONTS.filter(f => f !== 'Nunito').map(f => [f, `'${f}', 'Segoe UI', sans-serif`])];
  let fontsAsked = false;
  const loadFonts = () => {
    if (fontsAsked) return; fontsAsked = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + GFONTS.map(f => 'family=' + f.replace(/ /g, '+') + (['Nunito', 'Figtree', 'Fredoka', 'Baloo 2'].includes(f) ? ':wght@500;800' : '')).join('&') + '&display=swap';
    document.head.appendChild(l);
  };
  const ANIMS = [['', 'Still'], ['spin', 'Spin'], ['spinback', 'Spin back'], ['bob', 'Float'], ['bounce', 'Bounce'], ['pulse', 'Pulse'], ['heartbeat', 'Heartbeat'], ['zoom', 'Zoom'], ['jelly', 'Jelly'],
    ['sway', 'Sway'], ['swing', 'Swing'], ['shake', 'Shake'], ['orbit', 'Orbit'], ['figure8', 'Figure 8'], ['slide', 'Slide across'], ['drift', 'Drift down'], ['rise', 'Rise up'],
    ['twinkle', 'Twinkle'], ['fade', 'Fade'], ['blink', 'Blink'], ['flicker', 'Flicker'], ['rainbow', 'Rainbow']];
  const TOOLS = [
    ['select', 'Move and resize (V)', '<path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor"/>'],
    ['brush', 'Brush (B)', '<path d="M20 4c-3 1-9 6-11 9l2 2c3-2 8-8 9-11zM8 14c-2 0-4 2-4 4 0 1-1 2-2 2 2 1 6 1 7-1 1-1 1-3 1-3z" fill="currentColor"/>'],
    ['eraser', 'Eraser (E)', '<path d="M15 4l6 6-9 9H6l-3-3zM9 19h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'],
    ['line', 'Line (L)', '<path d="M5 19 19 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'],
    ['rect', 'Rectangle (R)', '<rect x="4" y="6" width="16" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/>'],
    ['ellipse', 'Circle (O)', '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/>'],
    ['text', 'Text (T)', '<path d="M5 5h14v3h-2V7h-4v11h2v2H9v-2h2V7H7v1H5z" fill="currentColor"/>'],
  ];
  // The loop length can be changed in the timeline (1 to 4 seconds).
  let LOOP = 2000;
  const AREA = { w: 512, h: 512 }; // the size of what's being made (moving things wrap around it)
  const FPS = 12, frameCount = () => Math.round(LOOP / 1000 * FPS);
  let uid = 0;
  const imgCache = new Map();
  const imgFor = src => { let im = imgCache.get(src); if (!im) { im = new Image(); im.src = src; imgCache.set(src, im); } return im; };

  function drawObj(ctx, o, t = 0) {
    if (o.hidden) return;
    // Timeline: each thing can start later in the loop (ph, 0 to 1) and play 1 to 4 times per loop (sp).
    const u = ((t % LOOP) / LOOP * (o.sp || 1) + (o.ph || 0)) % 1, ph = u * Math.PI * 2, amp = o.amp ?? 1;
    const H = AREA.h, W = AREA.w, oh = (o.h || 40) * (o.s || 1);
    let x = o.x, y = o.y, r = o.r || 0, s = o.s || 1, sx = 1, sy = 1, alpha = o.alpha ?? 1, hue = 0;
    const a = o.anim;
    if (a === 'spin') r += ph;
    if (a === 'spinback') r -= ph;
    if (a === 'bob') y += Math.sin(ph) * Math.max(4, (o.h || 40) * 0.08) * amp;
    if (a === 'bounce') y -= Math.abs(Math.sin(ph)) * Math.max(8, oh * 0.25) * amp;
    if (a === 'pulse') s *= 1 + 0.1 * amp * Math.sin(ph);
    if (a === 'heartbeat') { const k = u < 0.12 ? Math.sin(u / 0.12 * Math.PI) : u > 0.2 && u < 0.32 ? Math.sin((u - 0.2) / 0.12 * Math.PI) * 0.7 : 0; s *= 1 + 0.16 * amp * k; }
    if (a === 'zoom') s *= Math.max(0.05, 1 + 0.45 * amp * Math.sin(ph));
    if (a === 'jelly') { sx = 1 + 0.12 * amp * Math.sin(ph * 2); sy = 1 - 0.12 * amp * Math.sin(ph * 2); }
    if (a === 'sway') r += 0.22 * amp * Math.sin(ph);
    if (a === 'swing') { const ang = 0.45 * amp * Math.sin(ph), L = oh / 2; r += ang; x += Math.sin(ang) * L; y += L - Math.cos(ang) * L; }
    if (a === 'shake') { x += Math.sin(ph * 9) * 3 * amp; y += Math.cos(ph * 7) * 1.5 * amp; }
    if (a === 'orbit') { const R = Math.max(10, oh * 0.35) * amp; x += Math.cos(ph) * R; y += Math.sin(ph) * R; }
    if (a === 'figure8') { const R = Math.max(10, oh * 0.35) * amp; x += Math.sin(ph) * R; y += Math.sin(ph * 2) * R / 2; }
    if (a === 'slide') { const span = W + oh; x = ((o.x + u * span) % span + span) % span - oh / 2; }
    if (a === 'drift') { const span = H + oh; y = ((o.y + u * span) % span + span) % span - oh / 2; }
    if (a === 'rise') { const span = H + oh; y = ((o.y - u * span) % span + span) % span - oh / 2; }
    if (a === 'twinkle') alpha *= 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ph));
    if (a === 'fade') alpha *= 0.5 + 0.5 * Math.cos(ph);
    if (a === 'blink') alpha *= u < 0.5 ? 1 : 0;
    if (a === 'flicker') alpha *= Math.sin(ph * 13) + Math.sin(ph * 7) > -0.4 ? 1 : 0.25;
    if (a === 'rainbow') hue = u * 360;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (hue) ctx.filter = `hue-rotate(${Math.round(hue)}deg)`;
    ctx.translate(x, y); ctx.rotate(r); ctx.scale(s * sx * (o.flip ? -1 : 1), s * sy);
    if (o.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 14; }
    ctx.fillStyle = ctx.strokeStyle = o.color || '#fff';
    if (o.grad && o.t !== 'erase' && o.t !== 'emoji' && o.t !== 'image') {
      const [gx0, gy0, gx1, gy1] = box(o), g = ctx.createLinearGradient(0, gy0, 0, gy1);
      g.addColorStop(0, o.color || '#fff'); g.addColorStop(1, o.grad);
      ctx.fillStyle = ctx.strokeStyle = g;
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (o.t) {
      case 'stroke': case 'erase': case 'line': {
        if (o.t === 'erase') { ctx.globalCompositeOperation = 'destination-out'; ctx.shadowBlur = 0; ctx.strokeStyle = ctx.fillStyle = '#000'; }
        ctx.lineWidth = o.lw;
        const p = o.pts;
        if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], o.lw / 2, 0, Math.PI * 2); ctx.fill(); break; }
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
        ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
        ctx.stroke();
        break;
      }
      case 'rect': case 'ellipse': {
        ctx.beginPath();
        if (o.t === 'rect') { if (ctx.roundRect) ctx.roundRect(-o.w / 2, -o.h / 2, o.w, o.h, o.rad || 0); else ctx.rect(-o.w / 2, -o.h / 2, o.w, o.h); }
        else ctx.ellipse(0, 0, Math.max(0.5, o.w / 2), Math.max(0.5, o.h / 2), 0, 0, Math.PI * 2);
        if (o.fill) ctx.fill(); else { ctx.lineWidth = o.lw; ctx.stroke(); }
        break;
      }
      case 'text': {
        ctx.font = fontOf(o);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if ('letterSpacing' in ctx) ctx.letterSpacing = (o.ls || 0) + 'px';
        if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = o.size / 6; ctx.shadowOffsetY = o.size / 14; }
        const lw = o.outline ? Math.max(1, o.size / 8 * (o.ow ?? 1)) : 0;
        const each = (fn, txt, px, py) => { if (o.outline) { ctx.lineWidth = lw; const st = ctx.strokeStyle; ctx.strokeStyle = o.outline; ctx.strokeText(txt, px, py); ctx.strokeStyle = st; } fn(txt, px, py); };
        const lines = textLines(o);
        if (o.arc && lines.length === 1) {
          // Curved text: the letters sit on a circle (up for a smile, down for a frown).
          const txt = lines[0], R = arcRadius(o), sign = o.arc > 0 ? 1 : -1;
          const widths = [...txt].map(ch => ctx.measureText(ch).width + (o.ls || 0)), total = widths.reduce((q, w) => q + w, 0);
          let ang = -total / R / 2;
          ctx.translate(0, -sign * R * (1 - Math.cos(Math.min(Math.PI, total / R / 2))) / 2);
          for (const [i, ch] of [...txt].entries()) {
            const w = widths[i], aa = ang + w / R / 2;
            ctx.save(); ctx.translate(0, sign * R); ctx.rotate(sign * aa); ctx.translate(0, -sign * R);
            each((q, px, py) => ctx.fillText(q, px, py), ch, 0, 0);
            ctx.restore();
            ang += w / R;
          }
        } else {
          const lh = o.size * 1.15, top = -(lines.length - 1) * lh / 2;
          lines.forEach((ln, i) => each((q, px, py) => ctx.fillText(q, px, py), ln, 0, top + i * lh));
        }
        break;
      }
      case 'symbol': {
        const [d, rule] = SYMBOLS[o.key] || SYMBOLS.star;
        ctx.scale(o.w / 100, o.h / 100); ctx.translate(-50, -50);
        if (o.grad) { const g = ctx.createLinearGradient(0, 0, 0, 100); g.addColorStop(0, o.color || '#fff'); g.addColorStop(1, o.grad); ctx.fillStyle = ctx.strokeStyle = g; }
        if (o.hollow) { ctx.lineWidth = (o.lw || 6) * 100 / Math.max(1, Math.min(o.w, o.h)); ctx.stroke(new Path2D(d)); }
        else ctx.fill(new Path2D(d), rule || 'nonzero');
        if (o.edge) { ctx.lineWidth = 4 * 100 / Math.max(1, Math.min(o.w, o.h)); ctx.strokeStyle = o.edge; ctx.shadowBlur = 0; ctx.stroke(new Path2D(d)); }
        break;
      }
      case 'emoji': {
        ctx.font = `${Math.round(o.h * 0.86)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(o.text, 0, o.h * 0.04);
        break;
      }
      case 'image': {
        const im = imgFor(o.src);
        if (im.complete && im.naturalWidth) ctx.drawImage(im, -o.w / 2, -o.h / 2, o.w, o.h);
        break;
      }
    }
    ctx.restore();
  }
  // The object's own box (before moving, turning and resizing).
  function box(o) {
    if (o.pts) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of o.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const p = (o.lw || 2) / 2;
      return [x0 - p, y0 - p, x1 + p, y1 + p];
    }
    return [-o.w / 2, -o.h / 2, o.w / 2, o.h / 2];
  }
  const toLocal = (o, px, py) => {
    const dx = px - o.x, dy = py - o.y, c = Math.cos(-(o.r || 0)), s = Math.sin(-(o.r || 0));
    return [(dx * c - dy * s) / (o.s || 1) * (o.flip ? -1 : 1), (dx * s + dy * c) / (o.s || 1)];
  };
  const toWorld = (o, lx, ly) => {
    const c = Math.cos(o.r || 0), s = Math.sin(o.r || 0), X = lx * (o.s || 1) * (o.flip ? -1 : 1), Y = ly * (o.s || 1);
    return [o.x + X * c - Y * s, o.y + X * s + Y * c];
  };
  const fontOf = o => `${o.ital ? 'italic ' : ''}${o.bold ? 800 : 500} ${o.size}px ${o.font}`;
  const textLines = o => { const t = o.caps ? o.text.toUpperCase() : o.text; return t.split('\n').slice(0, 6); };
  const arcRadius = o => Math.max(o.size * 0.8, 3000 / Math.max(1, Math.abs(o.arc)) * o.size / 40);
  const measureText = o => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = fontOf(o);
    if ('letterSpacing' in c) c.letterSpacing = (o.ls || 0) + 'px';
    const lines = textLines(o), pad = o.outline ? o.size / 4 * (o.ow ?? 1) : 0;
    o.w = Math.max(10, ...lines.map(l => c.measureText(l).width)) + pad;
    o.h = o.size * 1.15 * lines.length + o.size * 0.1;
    if (o.arc && lines.length === 1) { const R = arcRadius(o), half = Math.min(Math.PI, o.w / R / 2); o.h += R * (1 - Math.cos(half)) * 1.1; o.w = Math.min(o.w, 2 * R * Math.sin(Math.min(half, Math.PI / 2)) + o.size); }
  };
  const LABEL = o => o.t === 'stroke' ? 'Drawing' : o.t === 'erase' ? 'Eraser' : o.t === 'line' ? 'Line' : o.t === 'rect' ? 'Rectangle' : o.t === 'ellipse' ? 'Circle' : o.t === 'text' ? `“${o.text.slice(0, 14)}”` : o.t === 'symbol' ? o.key[0].toUpperCase() + o.key.slice(1) : o.t === 'emoji' ? o.text : 'Picture';

  // ---- building an animated WebP from still frames (keeps soft, see-through edges) ----
  function riffChunks(buf) {
    const d = new DataView(buf), out = [];
    for (let p = 12; p + 8 <= buf.byteLength;) {
      const id = String.fromCharCode(...new Uint8Array(buf, p, 4)), len = d.getUint32(p + 4, true);
      out.push({ id, data: new Uint8Array(buf, p + 8, len) });
      p += 8 + len + (len & 1);
    }
    return out;
  }
  const chunk = (id, data) => {
    const b = new Uint8Array(8 + data.length + (data.length & 1));
    for (let i = 0; i < 4; i++) b[i] = id.charCodeAt(i);
    new DataView(b.buffer).setUint32(4, data.length, true);
    b.set(data, 8);
    return b;
  };
  const join = arrs => { const n = arrs.reduce((a, x) => a + x.length, 0), out = new Uint8Array(n); let p = 0; for (const a of arrs) { out.set(a, p); p += a.length; } return out; };
  const u24 = (a, o, v) => { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; };
  async function animatedWebp(frames, w, h, ms) {
    const parts = [];
    for (const f of frames) {
      if (f.type !== 'image/webp') return null;
      const cs = riffChunks(await f.arrayBuffer()).filter(c => ['ALPH', 'VP8 ', 'VP8L'].includes(c.id));
      if (!cs.length) return null;
      const hd = new Uint8Array(16);
      u24(hd, 6, w - 1); u24(hd, 9, h - 1); u24(hd, 12, ms); hd[15] = 0x02; // replace the whole frame
      parts.push(chunk('ANMF', join([hd, ...cs.map(c => chunk(c.id, c.data))])));
    }
    const vp8x = new Uint8Array(10); vp8x[0] = 0x02 | 0x10; u24(vp8x, 4, w - 1); u24(vp8x, 7, h - 1);
    const anim = new Uint8Array(6); // see-through background, loops forever
    const body = join([chunk('VP8X', vp8x), chunk('ANIM', anim), ...parts]);
    const head = new Uint8Array(12);
    head.set([82, 73, 70, 70], 0); new DataView(head.buffer).setUint32(4, body.length + 4, true); head.set([87, 69, 66, 80], 8);
    return new Blob([head, body], { type: 'image/webp' });
  }

  function openEditor(kind = 'decoration', onUse = null) {
    loadFonts();
    let K = KITS[kind];
    // A bit of room around the edges to work in (0.44): things can hang over the edge, and only
    // the part inside is saved.
    let M = 0;
    let playing = true, scrubT = 0;
    let objs = [], sel = null, tool = 'brush', drag = null, temp = null, dirty = false, closed = false;
    const opt = { color: '#ffffff', size: 10, alpha: 1, mirror: false, fill: true, guide: true, font: FONTS[0][1], loop: 2000 };
    try { Object.assign(opt, JSON.parse(localStorage.getItem('zuno_editor_opt') || '{}')); } catch {}
    LOOP = [1000, 2000, 3000, 4000].includes(opt.loop) ? opt.loop : 2000;
    const hist = [], fut = [];
    const loadDraft = () => { try { const d = JSON.parse(localStorage.getItem('zuno_editor_' + kind) || 'null'); objs = Array.isArray(d) ? d : []; } catch { objs = []; } uid = objs.reduce((m, o) => Math.max(m, o.id || 0), uid); };
    loadDraft();
    const me = state.me;
    const ov = document.createElement('div');
    ov.className = 'overlay ed41-ov';
    ov.innerHTML = `<div class="ed41" role="dialog" aria-label="Editor">
      <header class="ed41-top">
        <b class="ed41-title"><span class="ed41-logo">✏️</span>Editor</b>
        <div class="ed41-kinds">${Object.entries(KITS).map(([k, v]) => `<button type="button" data-kind="${k}">${v.label}</button>`).join('')}</div>
        <span class="ed41-sp"></span>
        <button type="button" class="ed41-ib" data-a="undo" title="Undo (Ctrl+Z)"><svg viewBox="0 0 24 24"><path d="M9 7H4V2M4 7a9 9 0 1 1-1 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <button type="button" class="ed41-ib" data-a="redo" title="Redo (Ctrl+Y)"><svg viewBox="0 0 24 24"><path d="M15 7h5V2M20 7a9 9 0 1 0 1 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <button type="button" class="ed41-btn" data-a="guide" title="Show or hide the kit (it's never saved)">Kit</button>
        <button type="button" class="ed41-btn" data-a="clear">Clear</button>
        <button type="button" class="ed41-btn" data-a="download">Download</button>
        ${onUse ? '<button type="button" class="ed41-btn primary" data-a="use">Use it</button>' : ''}
        <button type="button" class="ed41-ib" data-a="close" title="Close (Esc)"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button>
      </header>
      <div class="ed41-main">
        <nav class="ed41-tools">${TOOLS.map(([k, t, svg]) => `<button type="button" data-tool="${k}" title="${esc(t)}" aria-label="${esc(t)}"><svg viewBox="0 0 24 24">${svg}</svg></button>`).join('')}
          <button type="button" data-a="picture" title="Add a picture" aria-label="Add a picture"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 17l5-5 3 3 2-2 4 4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="9" r="1.6" fill="currentColor"/></svg></button>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-file></nav>
        <section class="ed41-stagewrap">
          <div class="ed41-opts"></div>
          <div class="ed41-stage"><div class="ed41-board"><div class="ed41-guide"></div><canvas class="ed41-art"></canvas><canvas class="ed41-ui"></canvas></div></div>
          <div class="ed41-hint muted small"></div>
          <div class="ed41-tl"></div>
        </section>
        <aside class="ed41-side">
          <div class="ed41-card"><div class="ed41-h">Live preview</div><div class="ed41-prev"></div></div>
          <div class="ed41-card"><div class="ed41-h">Add a symbol</div><div class="ed41-syms">${Object.keys(SYMBOLS).map(k => `<button type="button" data-sym="${k}" title="${k}"><svg viewBox="0 0 100 100"><path d="${SYMBOLS[k][0]}" fill-rule="${SYMBOLS[k][1] || 'nonzero'}"/></svg></button>`).join('')}</div>
            <div class="ed41-h sm">Emoji</div><div class="ed41-emo">${EMOJI.map(e => `<button type="button" data-emo="${e}">${e}</button>`).join('')}</div></div>
          <div class="ed41-card ed41-props"></div>
          <div class="ed41-card"><div class="ed41-h">Layers <span class="muted small">drag to reorder · top first</span></div><div class="ed41-layers"></div></div>
        </aside>
      </div></div>`;
    $('#layer').appendChild(ov);
    const art = $('.ed41-art', ov), ui = $('.ed41-ui', ov), ctx = art.getContext('2d'), uctx = ui.getContext('2d');
    const board = $('.ed41-board', ov), stage = $('.ed41-stage', ov);

    function setKind(k) {
      kind = k; K = KITS[k];
      AREA.w = K.w; AREA.h = K.h;
      M = Math.round(Math.max(K.w, K.h) * (k === 'banner' ? 0.1 : 0.12));
      art.width = ui.width = K.w + 2 * M; art.height = ui.height = K.h + 2 * M;
      board.style.setProperty('--m-x', (M / (K.w + 2 * M) * 100) + '%');
      board.style.setProperty('--m-y', (M / (K.h + 2 * M) * 100) + '%');
      $$('[data-kind]', ov).forEach(b => b.classList.toggle('on', b.dataset.kind === k));
      const guide = $('.ed41-guide', ov);
      guide.innerHTML = `<img src="${K.tpl}" alt="">${k === 'decoration' && me?.avatar ? `<img class="ed41-me" src="${esc(me.avatar)}" alt="">` : ''}`;
      board.dataset.kind = k;
      sel = null; hist.length = 0; fut.length = 0;
      loadDraft(); last = snap();
      fit(); redraw(); panels(); preview();
      $('.ed41-hint', ov).textContent = k === 'decoration' ? 'The circle is where the profile picture sits. Draw around it (or over it): see-through parts show the picture.'
        : k === 'effect' ? 'This plays over the whole profile. Keep the middle light so the name and About Me stay readable.'
          : 'The left side sits behind the picture and name, so keep it calm there and put detail on the right.';
    }
    function fit() {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const BW = K.w + 2 * M, BH = K.h + 2 * M;
      const sc = Math.min((r.width - 12) / BW, (r.height - 12) / BH, kind === 'banner' ? 1.6 : 1.2);
      const w = Math.round(BW * sc) + 'px', h = Math.round(BH * sc) + 'px';
      if (board.style.width !== w) board.style.width = w;
      if (board.style.height !== h) board.style.height = h;
    }
    const ro = new ResizeObserver(fit); ro.observe(stage);
    const scaleNow = () => (K.w + 2 * M) / (board.getBoundingClientRect().width || K.w);
    const pt = e => { const r = art.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * (K.w + 2 * M) - M, (e.clientY - r.top) / r.height * (K.h + 2 * M) - M]; };

    // ---- drawing ----
    const animated = () => objs.some(o => o.anim && !o.hidden);
    let raf = 0, t0 = performance.now();
    const nowT = () => (playing ? performance.now() - t0 : scrubT);
    function redraw() {
      const t = animated() ? nowT() : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, art.width, art.height);
      ctx.translate(M, M);
      for (const o of objs) drawObj(ctx, o, t);
      if (temp) { drawObj(ctx, temp, 0); if (temp.mirrorOf) drawObj(ctx, temp.mirrorOf, 0); }
      uctx.setTransform(1, 0, 0, 1, 0, 0);
      uctx.clearRect(0, 0, ui.width, ui.height);
      // The working room around the edge is shaded: it isn't saved.
      uctx.fillStyle = 'rgba(8,12,12,.55)';
      uctx.fillRect(0, 0, ui.width, M); uctx.fillRect(0, M + K.h, ui.width, M); uctx.fillRect(0, M, M, K.h); uctx.fillRect(M + K.w, M, M, K.h);
      uctx.strokeStyle = 'rgba(4,197,174,.6)'; uctx.lineWidth = 1.5 * scaleNow(); uctx.strokeRect(M, M, K.w, K.h);
      uctx.translate(M, M);
      tlPlayhead(t);
      const o = objs.find(x => x.id === sel);
      if (o && !o.hidden && tool === 'select') {
        const [x0, y0, x1, y1] = box(o), k = scaleNow();
        const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => toWorld(o, x, y));
        uctx.save();
        uctx.lineWidth = 1.5 * k; uctx.strokeStyle = '#04c5ae'; uctx.setLineDash([6 * k, 4 * k]);
        uctx.beginPath(); c.forEach(([x, y], i) => (i ? uctx.lineTo(x, y) : uctx.moveTo(x, y))); uctx.closePath(); uctx.stroke();
        uctx.setLineDash([]);
        const top = toWorld(o, (x0 + x1) / 2, y0), rot = toWorld(o, (x0 + x1) / 2, y0 - 26 * k / (o.s || 1));
        uctx.beginPath(); uctx.moveTo(...top); uctx.lineTo(...rot); uctx.stroke();
        uctx.fillStyle = '#fff';
        uctx.beginPath(); uctx.arc(rot[0], rot[1], 6 * k, 0, Math.PI * 2); uctx.fill(); uctx.stroke();
        uctx.fillRect(c[2][0] - 6 * k, c[2][1] - 6 * k, 12 * k, 12 * k); uctx.strokeRect(c[2][0] - 6 * k, c[2][1] - 6 * k, 12 * k, 12 * k);
        uctx.restore();
      }
      if (animated() && playing && !closed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(redraw); }
    }
    function handles(o) {
      const [x0, y0, x1, y1] = box(o), k = scaleNow();
      return { scale: toWorld(o, x1, y1), rotate: toWorld(o, (x0 + x1) / 2, y0 - 26 * k / (o.s || 1)), r: 11 * k };
    }
    function hit(px, py) {
      for (let i = objs.length - 1; i >= 0; i--) {
        const o = objs[i];
        if (o.hidden || o.lock || o.t === 'erase') continue;
        const [lx, ly] = toLocal(o, px, py), [x0, y0, x1, y1] = box(o), pad = 6 * scaleNow() / (o.s || 1);
        if (lx >= x0 - pad && lx <= x1 + pad && ly >= y0 - pad && ly <= y1 + pad) return o;
      }
      return null;
    }

    // ---- history and saving ----
    const snap = () => JSON.stringify(objs);
    let last = snap();
    function commit() {
      const now = snap();
      if (now === last) return;
      hist.push(last); if (hist.length > 80) hist.shift();
      fut.length = 0; last = now; dirty = true;
      try { localStorage.setItem('zuno_editor_' + kind, now); } catch {}
      panels(); preview();
    }
    function undoRedo(back) {
      const from = back ? hist : fut, to = back ? fut : hist;
      if (!from.length) return;
      to.push(last); last = from.pop(); objs = JSON.parse(last);
      if (!objs.some(o => o.id === sel)) sel = null;
      try { localStorage.setItem('zuno_editor_' + kind, last); } catch {}
      redraw(); panels(); preview();
    }
    const add = o => { o.id = ++uid; objs.push(o); sel = o.id; commit(); redraw(); };
    const selected = () => objs.find(o => o.id === sel) || null;
    const saveOpt = () => { try { localStorage.setItem('zuno_editor_opt', JSON.stringify(opt)); } catch {} };

    // ---- pointer ----
    art.style.touchAction = 'none'; ui.style.touchAction = 'none';
    ui.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      ui.setPointerCapture(e.pointerId);
      const [px, py] = pt(e);
      if (tool === 'select') {
        const o = selected();
        if (o) {
          const h = handles(o);
          if (Math.hypot(px - h.scale[0], py - h.scale[1]) < h.r) { drag = { mode: 'scale', o, s0: o.s || 1, d0: Math.hypot(px - o.x, py - o.y) || 1 }; return; }
          if (Math.hypot(px - h.rotate[0], py - h.rotate[1]) < h.r) { drag = { mode: 'rotate', o }; return; }
        }
        const t = hit(px, py);
        sel = t?.id || null;
        if (t) drag = { mode: 'move', o: t, dx: px - t.x, dy: py - t.y };
        redraw(); panels();
        return;
      }
      if (tool === 'text') { placeText(px, py); return; }
      if (tool === 'brush' || tool === 'eraser') {
        temp = { t: tool === 'eraser' ? 'erase' : 'stroke', x: 0, y: 0, s: 1, r: 0, pts: [[px, py]], lw: tool === 'eraser' ? opt.size * 2 : opt.size, color: opt.color, alpha: tool === 'eraser' ? 1 : opt.alpha };
        if (opt.mirror) temp.mirrorOf = { ...temp, pts: [[K.w - px, py]] };
      } else {
        temp = { t: tool, x: px, y: py, s: 1, r: 0, w: 0, h: 0, lw: opt.size, color: opt.color, alpha: opt.alpha, fill: opt.fill, rad: tool === 'rect' ? 10 : 0, start: [px, py] };
        if (tool === 'line') Object.assign(temp, { x: 0, y: 0, pts: [[px, py], [px, py]] });
      }
      drag = { mode: 'make' };
      redraw();
    });
    ui.addEventListener('pointermove', e => {
      const [px, py] = pt(e);
      if (!drag) {
        if (tool === 'select') {
          const o = selected(), h = o && handles(o);
          ui.style.cursor = h && Math.hypot(px - h.scale[0], py - h.scale[1]) < h.r ? 'nwse-resize' : h && Math.hypot(px - h.rotate[0], py - h.rotate[1]) < h.r ? 'grab' : hit(px, py) ? 'move' : 'default';
        }
        return;
      }
      if (drag.mode === 'move') { drag.o.x = px - drag.dx; drag.o.y = py - drag.dy; }
      else if (drag.mode === 'scale') drag.o.s = Math.max(0.05, Math.min(20, drag.s0 * Math.hypot(px - drag.o.x, py - drag.o.y) / drag.d0));
      else if (drag.mode === 'rotate') { let a = Math.atan2(py - drag.o.y, px - drag.o.x) + Math.PI / 2; if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); drag.o.r = a; }
      else if (drag.mode === 'make' && temp) {
        if (temp.t === 'stroke' || temp.t === 'erase') {
          const lp = temp.pts[temp.pts.length - 1];
          if (Math.hypot(px - lp[0], py - lp[1]) >= 1.5) { temp.pts.push([px, py]); temp.mirrorOf?.pts.push([K.w - px, py]); }
        } else if (temp.t === 'line') temp.pts[1] = [px, py];
        else {
          let w = px - temp.start[0], h = py - temp.start[1];
          if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
          Object.assign(temp, { x: temp.start[0] + w / 2, y: temp.start[1] + h / 2, w: Math.abs(w), h: Math.abs(h) });
        }
      }
      redraw();
    });
    const settle = o => {
      // Strokes keep their points around their own middle, so they can be moved and turned later.
      if (!o.pts) return o;
      const [x0, y0, x1, y1] = box(o), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      o.pts = o.pts.map(([x, y]) => [Math.round((x - cx) * 10) / 10, Math.round((y - cy) * 10) / 10]);
      o.x = cx; o.y = cy;
      return o;
    };
    const endDrag = () => {
      if (!drag) return;
      const was = drag; drag = null;
      if (was.mode === 'make' && temp) {
        const t = temp; temp = null;
        delete t.start;
        const m = t.mirrorOf; delete t.mirrorOf;
        const tiny = (t.t === 'rect' || t.t === 'ellipse') && (t.w < 3 || t.h < 3);
        if (!tiny) {
          for (const o of [t, m].filter(Boolean)) { o.id = ++uid; delete o.mirrorOf; objs.push(settle(o)); }
          commit();
        }
      } else commit();
      redraw();
    };
    ui.addEventListener('pointerup', endDrag);
    ui.addEventListener('pointercancel', endDrag);
    ui.addEventListener('dblclick', e => { const o = hit(...pt(e)); if (o?.t === 'text') editText(o); });

    async function placeText(px, py) {
      const text = await askText('Add text', { placeholder: 'Type something (\\n for a new line)', ok: 'Add', required: true, max: 120 });
      if (!text?.trim()) return;
      const o = { t: 'text', text: text.trim().replace(/\\n/g, '\n'), x: px, y: py, s: 1, r: 0, size: Math.round(Math.min(K.w, K.h) * (kind === 'banner' ? 0.36 : 0.12)), font: opt.font, bold: true, color: opt.color, alpha: opt.alpha };
      await document.fonts?.load?.(fontOf(o)).catch(() => {});
      measureText(o); add(o); setTool('select');
    }
    async function editText(o) {
      const text = await askText('Edit text', { value: o.text.replace(/\n/g, '\\n'), ok: 'Save', required: true, max: 120 });
      if (!text?.trim()) return;
      o.text = text.trim().replace(/\\n/g, '\n'); measureText(o); commit(); redraw();
    }
    const startSize = () => Math.round(kind === 'banner' ? K.h * 0.6 : Math.min(K.w, K.h) * 0.24);
    $$('[data-sym]', ov).forEach(b => b.addEventListener('click', () => { const n = startSize(); add({ t: 'symbol', key: b.dataset.sym, x: K.w / 2, y: K.h / 2, s: 1, r: 0, w: n, h: n, color: opt.color, alpha: opt.alpha }); setTool('select'); }));
    $$('[data-emo]', ov).forEach(b => b.addEventListener('click', () => { const n = startSize(); add({ t: 'emoji', text: b.dataset.emo, x: K.w / 2, y: K.h / 2, s: 1, r: 0, w: n, h: n, alpha: 1 }); setTool('select'); }));
    $('[data-a=picture]', ov).addEventListener('click', () => $('[data-file]', ov).click());
    $('[data-file]', ov).addEventListener('change', e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (f.size > 3e6) return toast('Pictures for the Editor can be up to 3 MB.', true);
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => {
          // Kept small so drafts fit in the browser's storage.
          const sc = Math.min(1, 700 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          const src = c.toDataURL('image/png');
          const fitTo = Math.min(K.w * 0.6 / c.width, K.h * 0.6 / c.height);
          add({ t: 'image', src, x: K.w / 2, y: K.h / 2, s: 1, r: 0, w: Math.round(c.width * fitTo), h: Math.round(c.height * fitTo), alpha: 1 });
          setTool('select');
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });

    // ---- panels ----
    function setTool(t) {
      tool = t;
      $$('[data-tool]', ov).forEach(b => b.classList.toggle('on', b.dataset.tool === t));
      ui.style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair';
      options(); redraw();
    }
    function options() {
      const o = $('.ed41-opts', ov);
      const sizeLbl = tool === 'eraser' ? 'Eraser size' : tool === 'text' ? '' : 'Size';
      o.innerHTML = `<div class="ed41-sw">${SWATCHES.map(c => `<button type="button" data-c="${c}" style="--c:${c}" class="${opt.color === c ? 'on' : ''}" title="${c}"></button>`).join('')}<label class="ed41-pick" title="Any color"><input type="color" value="${esc(opt.color)}"></label></div>
        ${sizeLbl && tool !== 'select' ? `<label class="ed41-rng">${sizeLbl}<input type="range" min="1" max="80" value="${opt.size}" data-o="size"><b>${opt.size}</b></label>` : ''}
        ${tool !== 'eraser' && tool !== 'select' ? `<label class="ed41-rng">Opacity<input type="range" min="10" max="100" value="${Math.round(opt.alpha * 100)}" data-o="alpha"><b>${Math.round(opt.alpha * 100)}%</b></label>` : ''}
        ${tool === 'rect' || tool === 'ellipse' ? `<label class="ed41-chk"><input type="checkbox" data-o="fill"${opt.fill ? ' checked' : ''}> Filled</label>` : ''}
        ${tool === 'brush' || tool === 'eraser' ? `<label class="ed41-chk" title="Draws both sides at once"><input type="checkbox" data-o="mirror"${opt.mirror ? ' checked' : ''}> Mirror</label>` : ''}
        ${tool === 'text' ? '<span class="muted small">Click where the text should go.</span>' : ''}
        ${tool === 'select' ? '<span class="muted small">Drag to move · corner to resize · circle to turn (Shift snaps) · double-click text to edit</span>' : ''}`;
      const setColor = c => {
        opt.color = c; saveOpt(); options();
        const s = selected();
        if (s && s.t !== 'emoji' && s.t !== 'image' && s.t !== 'erase') { s.color = c; commit(); redraw(); }
      };
      $$('[data-c]', o).forEach(b => b.addEventListener('click', () => setColor(b.dataset.c)));
      $('input[type=color]', o).addEventListener('change', e => setColor(e.target.value));
      $$('[data-o]', o).forEach(inp => inp.addEventListener('input', () => {
        const k = inp.dataset.o;
        opt[k] = inp.type === 'checkbox' ? inp.checked : k === 'alpha' ? inp.value / 100 : Number(inp.value);
        const b = inp.parentElement.querySelector('b'); if (b) b.textContent = k === 'alpha' ? inp.value + '%' : inp.value;
        saveOpt();
      }));
    }
    function panels() {
      const o = selected(), p = $('.ed41-props', ov);
      if (!o) { p.innerHTML = '<div class="ed41-h">Selected</div><p class="muted small">Pick something with the arrow tool (or in Layers) to change it.</p>'; }
      else {
        const rng = (key, label, min, max, val, step = 1, unit = '') => `<label class="ed41-rng">${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-r="${key}"><b>${val}${unit}</b></label>`;
        const colorable = o.t !== 'erase' && o.t !== 'image' && o.t !== 'emoji';
        p.innerHTML = `<div class="ed41-h">${esc(LABEL(o))}</div>
          ${o.t === 'text' ? `<div class="ed41-row"><select data-p="font" class="ed41-font">${FONTS.map(([n, f]) => `<option value="${esc(f)}" style="font-family:${esc(f)}"${o.font === f ? ' selected' : ''}>${n}</option>`).join('')}</select><button type="button" class="ed41-btn sm" data-p="edit">Edit text</button></div>
            ${rng('size', 'Size', 8, 220, Math.round(o.size))}
            ${rng('ls', 'Spacing', -10, 40, o.ls || 0)}
            ${rng('arc', 'Curve', -100, 100, o.arc || 0)}
            <div class="ed41-row wrap"><label class="ed41-chk"><input type="checkbox" data-p="bold"${o.bold ? ' checked' : ''}> Bold</label><label class="ed41-chk"><input type="checkbox" data-p="ital"${o.ital ? ' checked' : ''}> Italic</label>
              <label class="ed41-chk"><input type="checkbox" data-p="caps"${o.caps ? ' checked' : ''}> CAPS</label><label class="ed41-chk"><input type="checkbox" data-p="shadow"${o.shadow ? ' checked' : ''}> Shadow</label></div>
            <div class="ed41-row wrap"><label class="ed41-chk"><input type="checkbox" data-p="outline"${o.outline ? ' checked' : ''}> Outline</label>${o.outline ? `<label class="ed41-pick sm" title="Outline color"><input type="color" data-p="outlineColor" value="${esc(o.outline)}"></label>` : ''}</div>
            ${o.outline ? rng('ow', 'Outline width', 0.3, 3, o.ow ?? 1, 0.1) : ''}` : ''}
          ${o.t === 'rect' || o.t === 'ellipse' ? `<div class="ed41-row"><label class="ed41-chk"><input type="checkbox" data-p="fill"${o.fill ? ' checked' : ''}> Filled</label></div>${o.t === 'rect' ? rng('rad', 'Corners', 0, 120, o.rad || 0) : ''}` : ''}
          ${o.t === 'symbol' ? `<div class="ed41-row wrap"><label class="ed41-chk"><input type="checkbox" data-p="hollow"${o.hollow ? ' checked' : ''}> Outline only</label><label class="ed41-chk"><input type="checkbox" data-p="edge"${o.edge ? ' checked' : ''}> Border</label>${o.edge ? `<label class="ed41-pick sm" title="Border color"><input type="color" data-p="edgeColor" value="${esc(o.edge)}"></label>` : ''}</div>${o.hollow ? rng('lw', 'Line', 1, 30, o.lw || 6) : ''}` : ''}
          ${o.lw && (o.t === 'stroke' || o.t === 'line' || ((o.t === 'rect' || o.t === 'ellipse') && !o.fill)) ? rng('lw', 'Thickness', 1, 80, o.lw) : ''}
          ${colorable ? `<div class="ed41-row wrap"><label class="ed41-chk"><input type="checkbox" data-p="grad"${o.grad ? ' checked' : ''}> Gradient</label>${o.grad ? `<label class="ed41-pick sm" title="Second color"><input type="color" data-p="gradColor" value="${esc(o.grad)}"></label>` : ''}<label class="ed41-chk"><input type="checkbox" data-p="glow"${o.glow ? ' checked' : ''}> Glow</label></div>` : ''}
          ${o.t !== 'erase' ? rng('alpha', 'Opacity', 10, 100, Math.round((o.alpha ?? 1) * 100), 1, '%') : ''}
          <div class="ed41-h sm">Movement <span class="muted small">(saves as a moving picture)</span></div>
          <div class="ed41-anims">${ANIMS.map(([k, l]) => `<button type="button" data-anim="${k}" class="${(o.anim || '') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${o.anim ? `${rng('amp', 'Strength', 0.25, 3, o.amp ?? 1, 0.05, '×')}<div class="ed41-row wrap"><span class="muted small">Speed</span>${[1, 2, 3, 4].map(n => `<button type="button" class="ed41-btn sm${(o.sp || 1) === n ? ' on' : ''}" data-sp="${n}">${n}×</button>`).join('')}</div>` : ''}
          <div class="ed41-row wrap"><button type="button" class="ed41-btn sm" data-p="flip">⇋ Flip</button><button type="button" class="ed41-btn sm" data-p="center">Center</button><button type="button" class="ed41-btn sm" data-p="dup">Duplicate</button><button type="button" class="ed41-btn sm danger" data-p="del">Delete</button></div>`;
        const ch = () => { commit(); redraw(); };
        const remeasure = () => { if (o.t === 'text') measureText(o); };
        $('[data-p=font]', p)?.addEventListener('change', async e => { o.font = e.target.value; await document.fonts?.load?.(fontOf(o)).catch(() => {}); remeasure(); ch(); });
        $('[data-p=edit]', p)?.addEventListener('click', () => editText(o));
        for (const k of ['bold', 'ital', 'caps', 'shadow', 'fill', 'glow', 'hollow']) $(`[data-p=${k}]`, p)?.addEventListener('change', e => { o[k] = e.target.checked || undefined; remeasure(); ch(); panels(); });
        $('[data-p=outline]', p)?.addEventListener('change', e => { o.outline = e.target.checked ? (o.color === '#1b1f22' ? '#ffffff' : '#1b1f22') : null; remeasure(); ch(); panels(); });
        $('[data-p=edge]', p)?.addEventListener('change', e => { o.edge = e.target.checked ? (o.color === '#1b1f22' ? '#ffffff' : '#1b1f22') : undefined; ch(); panels(); });
        $('[data-p=grad]', p)?.addEventListener('change', e => { o.grad = e.target.checked ? (o.color === '#ff7eb6' ? '#5865f2' : '#ff7eb6') : undefined; ch(); panels(); });
        for (const [k, f] of [['outlineColor', 'outline'], ['edgeColor', 'edge'], ['gradColor', 'grad']]) $(`[data-p=${k}]`, p)?.addEventListener('input', e => { o[f] = e.target.value; redraw(); });
        for (const k of ['outlineColor', 'edgeColor', 'gradColor']) $(`[data-p=${k}]`, p)?.addEventListener('change', () => commit());
        $$('[data-r]', p).forEach(inp => {
          const k = inp.dataset.r, b = inp.parentElement.querySelector('b');
          inp.addEventListener('input', () => {
            const v = Number(inp.value);
            o[k] = k === 'alpha' ? v / 100 : v;
            if (b) b.textContent = inp.value + (k === 'alpha' ? '%' : k === 'amp' ? '×' : '');
            remeasure(); redraw();
          });
          inp.addEventListener('change', () => commit());
        });
        $$('[data-anim]', p).forEach(b => b.addEventListener('click', () => { o.anim = b.dataset.anim || undefined; if (!o.anim) { delete o.sp; delete o.ph; delete o.amp; } t0 = performance.now(); ch(); }));
        $$('[data-sp]', p).forEach(b => b.addEventListener('click', () => { o.sp = Number(b.dataset.sp); ch(); }));
        $('[data-p=flip]', p).addEventListener('click', () => { o.flip = !o.flip; ch(); });
        $('[data-p=center]', p).addEventListener('click', () => { o.x = K.w / 2; o.y = K.h / 2; ch(); });
        $('[data-p=dup]', p).addEventListener('click', () => duplicate(o));
        $('[data-p=del]', p).addEventListener('click', () => remove(o));
      }
      // Layers: drag a row up or down to move it in front of or behind the others.
      const L = $('.ed41-layers', ov);
      const ICO = { stroke: '✎', erase: '⌫', line: '╱', rect: '▭', ellipse: '◯', text: 'T', symbol: '★', emoji: '☺', image: '▣' };
      L.innerHTML = objs.length ? [...objs].reverse().map(x => `<div class="ed41-layer${x.id === sel ? ' on' : ''}${x.hidden ? ' off' : ''}" data-l="${x.id}">
          <span class="ed41-grip" title="Drag to reorder">⋮⋮</span><i class="ed41-lt" style="color:${esc(x.color || 'inherit')}">${ICO[x.t] || '•'}</i><span class="ed41-ln">${esc(LABEL(x))}</span>${x.anim ? '<i class="ed41-mv" title="Moves">≈</i>' : ''}
          <button type="button" class="ed41-eye" data-lock="${x.id}" title="${x.lock ? 'Unlock' : 'Lock (can\'t be picked on the canvas)'}">${x.lock ? '🔒' : '🔓'}</button>
          <button type="button" class="ed41-eye" data-eye="${x.id}" title="${x.hidden ? 'Show' : 'Hide'}">${x.hidden ? '◌' : '●'}</button></div>`).join('')
        : '<p class="muted small">Nothing yet. Draw, or add a symbol.</p>';
      $$('[data-l]', L).forEach(r => {
        r.addEventListener('click', e => {
          if (r.dataset.dragged) { delete r.dataset.dragged; return; }
          const x = objs.find(o2 => o2.id === Number(r.dataset.l));
          if (!x) return;
          if (e.target.closest('[data-eye]')) { x.hidden = !x.hidden; commit(); redraw(); return; }
          if (e.target.closest('[data-lock]')) { x.lock = !x.lock || undefined; commit(); redraw(); return; }
          sel = x.id; if (tool !== 'select') setTool('select'); else { redraw(); panels(); }
        });
        r.addEventListener('pointerdown', e => {
          if (e.button !== 0 || e.target.closest('button')) return;
          const y0 = e.clientY, rows = $$('[data-l]', L), h = r.getBoundingClientRect().height + 2;
          let moved = false, to = rows.indexOf(r);
          const from = to;
          const mv = ev => {
            const dy = ev.clientY - y0;
            if (!moved && Math.abs(dy) < 4) return;
            moved = true; r.classList.add('drag'); r.style.transform = `translateY(${dy}px)`;
            to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / h)));
            rows.forEach((x, i) => { if (x !== r) x.style.transform = i > from && i <= to ? `translateY(${-h}px)` : i < from && i >= to ? `translateY(${h}px)` : ''; });
          };
          const up = () => {
            removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
            if (!moved) return;
            r.dataset.dragged = '1';
            // The list shows the top first; objs keeps the bottom first.
            const n = objs.length, x = objs.find(o2 => o2.id === Number(r.dataset.l));
            objs.splice(n - 1 - from, 1); objs.splice(n - 1 - to, 0, x);
            commit(); redraw(); panels();
          };
          addEventListener('pointermove', mv); addEventListener('pointerup', up);
        });
      });
      $('[data-a=undo]', ov).disabled = !hist.length;
      $('[data-a=redo]', ov).disabled = !fut.length;
      timeline();
    }
    // ---- the timeline: play/pause, scrub through the loop, loop length, and when each moving thing starts ----
    function timeline() {
      const T = $('.ed41-tl', ov), movers = objs.filter(o => o.anim && !o.hidden);
      if (!movers.length) { T.innerHTML = `<div class="ed41-tl-empty muted small">Give something a Movement and it shows up here on the timeline.</div>`; return; }
      T.innerHTML = `<div class="ed41-tl-bar"><button type="button" class="ed41-ib" data-tl="play" title="${playing ? 'Pause' : 'Play'} (Space)">${playing ? '❚❚' : '▶'}</button>
          <div class="ed41-tl-ruler" data-tl="ruler">${Array.from({ length: LOOP / 250 + 1 }, (_, i) => `<i style="left:${i / (LOOP / 250) * 100}%"${i % 4 ? '' : ' class="big"'}>${i % 4 ? '' : `<b>${i / 4}s</b>`}</i>`).join('')}<span class="ed41-tl-head"></span></div>
          <select data-tl="loop" title="Loop length">${[1000, 2000, 3000, 4000].map(v => `<option value="${v}"${LOOP === v ? ' selected' : ''}>${v / 1000}s loop</option>`).join('')}</select></div>
        <div class="ed41-tl-rows">${[...movers].reverse().map(o => `<div class="ed41-tl-row${o.id === sel ? ' on' : ''}" data-tr="${o.id}"><span class="ed41-tl-name">${esc(LABEL(o))}</span>
          <div class="ed41-tl-track"><span class="ed41-tl-clip" style="left:${(o.ph || 0) * 100}%" title="Drag to start it later in the loop">${esc((ANIMS.find(a => a[0] === o.anim) || ['', ''])[1])}${(o.sp || 1) > 1 ? ` ×${o.sp}` : ''}</span></div></div>`).join('')}</div>`;
      $('[data-tl=play]', T).addEventListener('click', () => togglePlay());
      $('[data-tl=loop]', T).addEventListener('change', e => { LOOP = Number(e.target.value); opt.loop = LOOP; saveOpt(); t0 = performance.now(); scrubT = Math.min(scrubT, LOOP); timeline(); redraw(); });
      const ruler = $('[data-tl=ruler]', T);
      ruler.addEventListener('pointerdown', e => {
        const go = ev => { const r = ruler.getBoundingClientRect(); scrubT = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * LOOP; if (playing) togglePlay(); else redraw(); };
        go(e);
        const up = () => { removeEventListener('pointermove', go); removeEventListener('pointerup', up); };
        addEventListener('pointermove', go); addEventListener('pointerup', up);
      });
      $$('[data-tr]', T).forEach(row => {
        const o = objs.find(x => x.id === Number(row.dataset.tr)), clip = $('.ed41-tl-clip', row), track = $('.ed41-tl-track', row);
        row.addEventListener('click', e => { if (e.target === clip) return; sel = o.id; if (tool !== 'select') setTool('select'); else { redraw(); panels(); } });
        clip.addEventListener('pointerdown', e => {
          e.preventDefault();
          const r = track.getBoundingClientRect(), x0 = e.clientX, ph0 = o.ph || 0;
          const mv = ev => { let v = ph0 + (ev.clientX - x0) / r.width; v = ((v % 1) + 1) % 1; if (!ev.shiftKey) v = Math.round(v * 16) / 16; o.ph = v || undefined; clip.style.left = (v * 100) + '%'; redraw(); };
          const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); commit(); };
          addEventListener('pointermove', mv); addEventListener('pointerup', up);
        });
      });
    }
    function togglePlay() {
      if (playing) { scrubT = (performance.now() - t0) % LOOP; playing = false; }
      else { t0 = performance.now() - scrubT; playing = true; }
      timeline(); redraw();
    }
    function tlPlayhead(t) {
      const h = $('.ed41-tl-head', ov);
      if (h) h.style.left = ((t % LOOP) / LOOP * 100) + '%';
    }
    function duplicate(o) { const c = JSON.parse(JSON.stringify(o)); c.x += 16; c.y += 16; add(c); }
    function remove(o) { objs = objs.filter(x => x !== o); sel = null; commit(); redraw(); }

    // ---- preview and saving ----
    let prevUrl = null, prevT = 0;
    function render(t, scale = 1) {
      const c = document.createElement('canvas');
      c.width = K.w * scale; c.height = K.h * scale;
      const x = c.getContext('2d');
      x.scale(scale, scale);
      for (const o of objs) drawObj(x, o, t);
      return c;
    }
    function preview() {
      clearTimeout(prevT);
      prevT = setTimeout(() => {
        if (closed) return;
        render(0).toBlob(b => {
          if (!b || closed) return;
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          prevUrl = URL.createObjectURL(b);
          const P = $('.ed41-prev', ov), u = { ...me };
          if (kind === 'decoration') P.innerHTML = `<div class="ed41-pv-deco">${avatar({ ...u, decoration: null, communityDeco: { url: prevUrl, animated: false } }, 96)}</div>
            <div class="ed41-pv-msg">${avatar({ ...u, decoration: null, communityDeco: { url: prevUrl, animated: false } }, 34)}<div><b>${esc(u.displayName || 'You')}</b><span>Look at my new decoration!</span></div></div>`;
          else if (kind === 'effect') P.innerHTML = `<div class="ed41-pv-fx"><div class="ed41-pv-card"><div class="ed41-pv-ban" style="background:${esc(u.bannerColor || '#0aa896')}"></div>${avatar(u, 44)}<b>${esc(u.displayName || 'You')}</b><i></i><i></i><i></i></div><img src="${prevUrl}" alt=""></div>`;
          else P.innerHTML = `<div class="ed41-pv-nb">${typeof nbHtml === 'function' ? nbHtml({ ...u, nameBanner: { url: prevUrl } }, u.displayName) : `<img src="${prevUrl}" alt="">`}</div>`;
        }, 'image/png');
      }, 250);
    }
    async function exportFile() {
      if (!objs.some(o => !o.hidden && o.t !== 'erase')) { toast('Draw something first.', true); return null; }
      if (!animated()) {
        const b = await new Promise(r => render(0).toBlob(r, 'image/png'));
        return b && new File([b], `zuno-${kind}.png`, { type: 'image/png' });
      }
      toast('Making your moving picture…');
      for (const q of [0.92, 0.8, 0.65, 0.5]) {
        const frames = [];
        const FRAMES = frameCount();
        for (let i = 0; i < FRAMES; i++) frames.push(await new Promise(r => render(i / FRAMES * LOOP).toBlob(r, 'image/webp', q)));
        const b = await animatedWebp(frames, K.w, K.h, Math.round(1000 / FPS));
        if (!b) {
          toast("This browser can't save moving pictures, so it was saved still.", true);
          const s = await new Promise(r => render(0).toBlob(r, 'image/png'));
          return s && new File([s], `zuno-${kind}.png`, { type: 'image/png' });
        }
        if (b.size <= MAX_BYTES[kind]) return new File([b], `zuno-${kind}.webp`, { type: 'image/webp' });
      }
      toast("It's too detailed to move at this size. Try fewer moving parts.", true);
      return null;
    }

    // ---- top buttons ----
    $$('[data-kind]', ov).forEach(b => b.addEventListener('click', () => { if (b.dataset.kind !== kind) setKind(b.dataset.kind); }));
    $$('[data-tool]', ov).forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('[data-a=undo]', ov).addEventListener('click', () => undoRedo(true));
    $('[data-a=redo]', ov).addEventListener('click', () => undoRedo(false));
    const guideSync = () => { board.classList.toggle('noguide', !opt.guide); $('[data-a=guide]', ov).classList.toggle('on', opt.guide); };
    $('[data-a=guide]', ov).addEventListener('click', () => { opt.guide = !opt.guide; saveOpt(); guideSync(); });
    $('[data-a=clear]', ov).addEventListener('click', async () => {
      if (!objs.length || !(await confirmOver('Clear everything?', 'This removes everything you drew on this one. You can still undo it.', 'Clear'))) return;
      objs = []; sel = null; commit(); redraw();
    });
    $('[data-a=download]', ov).addEventListener('click', async () => {
      const f = await exportFile();
      if (!f) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Saved! Only your art is in it, not the kit.');
    });
    $('[data-a=use]', ov)?.addEventListener('click', async () => {
      const f = await exportFile();
      if (!f) return;
      close(true);
      onUse(f, kind);
    });
    function close(force) {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener('keydown', keys, true);
      if (prevUrl) setTimeout(() => URL.revokeObjectURL(prevUrl), 5000);
      ov.remove();
      if (!force && dirty) toast('Your drawing is kept here for next time.');
    }
    $('[data-a=close]', ov).addEventListener('click', () => close());
    const keys = e => {
      if (!ov.isConnected) { removeEventListener('keydown', keys, true); return; }
      if ($('.ask33', document)) return; // a text box is open over the Editor
      if (e.target.matches?.('input:not([type=range]):not([type=checkbox]):not([type=color]), textarea, select')) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      const o = selected();
      if (k === 'escape') { e.preventDefault(); e.stopImmediatePropagation(); if (sel) { sel = null; redraw(); panels(); } else close(); return; }
      if (mod && k === 'z') { e.preventDefault(); undoRedo(!e.shiftKey); }
      else if (mod && k === 'y') { e.preventDefault(); undoRedo(false); }
      else if (mod && k === 'd' && o) { e.preventDefault(); duplicate(o); }
      else if (k === ' ' && animated()) { e.preventDefault(); togglePlay(); }
      else if ((k === 'delete' || k === 'backspace') && o) { e.preventDefault(); remove(o); }
      else if (o && k.startsWith('arrow')) { e.preventDefault(); const d = e.shiftKey ? 10 : 1; o.x += k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0; o.y += k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0; redraw(); clearTimeout(keys.t); keys.t = setTimeout(commit, 400); }
      else if (!mod && !e.altKey) { const t = { v: 'select', b: 'brush', e: 'eraser', l: 'line', r: 'rect', o: 'ellipse', t: 'text' }[k]; if (t) setTool(t); else return; }
      else return;
      e.stopImmediatePropagation();
    };
    addEventListener('keydown', keys, true);

    // Fonts load a moment after the Editor opens: measure and draw text again once they're in.
    const fontsIn = () => { if (closed) return document.fonts?.removeEventListener?.('loadingdone', fontsIn); objs.forEach(o => o.t === 'text' && measureText(o)); redraw(); };
    document.fonts?.addEventListener?.('loadingdone', fontsIn);
    setKind(kind); setTool(objs.length ? 'select' : 'brush'); guideSync();
    requestAnimationFrame(fit);
    return { close };
  }
  window.openEditor41Real = openEditor;
}
