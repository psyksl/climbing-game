// 공통 엔진: 960x540 논리 해상도, 고정 스텝 120Hz, 키·마우스·터치, 효과음, 자동 시연 훅
'use strict';
const G = (() => {
  const W = 960, H = 540, STEP = 1 / 120;
  const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Noto Sans CJK KR","WenQuanYi Zen Hei",sans-serif';
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let scale = 1, offX = 0, offY = 0, dpr = 1;
  function resize() {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    scale = Math.min(w / W, h / H);
    offX = (w - W * scale) / 2; offY = (h - H * scale) / 2;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  window.addEventListener('resize', resize); resize();

  const params = new URLSearchParams(location.search);
  const auto = params.get('auto');

  // ---- 입력
  const real = { keys: {}, action: false };
  const virt = { keys: {}, action: false };
  const edge = { pressed: {}, released: {}, aPress: false, aRelease: false, clicks: [] };
  const mouse = { x: W / 2, y: H / 2, down: [false, false, false] };
  let oneButton = false;
  const actionKeys = ['Space'];
  function keyDown(code) { edge.pressed[code] = true; if (actionKeys.includes(code)) edge.aPress = true; }
  function keyUp(code) { edge.released[code] = true; if (actionKeys.includes(code)) edge.aRelease = true; }
  window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    unlockAudio();
    if (e.repeat || auto) return;
    real.keys[e.code] = true; keyDown(e.code);
  });
  window.addEventListener('keyup', e => { if (auto) return; real.keys[e.code] = false; keyUp(e.code); });
  window.addEventListener('blur', () => { for (const k in real.keys) if (real.keys[k]) { real.keys[k] = false; keyUp(k); } if (real.action) { real.action = false; edge.aRelease = true; } });
  function toLogical(cx, cy) { return { x: (cx - offX) / scale, y: (cy - offY) / scale }; }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  const activePointers = new Set();
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault(); unlockAudio(); if (auto) return;
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
    if (e.pointerType === 'mouse') {
      mouse.down[e.button] = true; edge.clicks.push({ x: p.x, y: p.y, button: e.button });
      if (oneButton && e.button === 0) { real.action = true; edge.aPress = true; }
    } else {
      activePointers.add(e.pointerId);
      edge.clicks.push({ x: p.x, y: p.y, button: 0, touch: true });
      if (oneButton && !real.action) { real.action = true; edge.aPress = true; }
    }
  });
  function pointerEnd(e) {
    if (auto) return;
    if (e.pointerType === 'mouse') {
      mouse.down[e.button] = false;
      if (oneButton && e.button === 0 && real.action) { real.action = false; edge.aRelease = true; }
    } else {
      activePointers.delete(e.pointerId);
      if (oneButton && activePointers.size === 0 && real.action) { real.action = false; edge.aRelease = true; }
    }
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointermove', e => { if (auto) return; const p = toLogical(e.clientX, e.clientY); mouse.x = p.x; mouse.y = p.y; });
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  const input = {
    key: c => !!(real.keys[c] || virt.keys[c]),
    pressed: c => !!edge.pressed[c],
    released: c => !!edge.released[c],
    get action() { return real.action || virt.action || !!real.keys.Space || !!virt.keys.Space; },
    get actionPressed() { return edge.aPress; },
    get actionReleased() { return edge.aRelease; },
    get clicks() { return edge.clicks; },
    mouse,
    any() { return edge.aPress || Object.keys(edge.pressed).length > 0 || edge.clicks.length > 0; },
  };
  // 자동 시연용 가상 입력
  const bot = {
    key(code, on) { if (!!virt.keys[code] === on) return; virt.keys[code] = on; on ? keyDown(code) : keyUp(code); },
    action(on) { if (virt.action === on) return; virt.action = on; on ? edge.aPress = true : edge.aRelease = true; },
    tap(code) { keyDown(code); keyUp(code); },
    move(x, y) { mouse.x = x; mouse.y = y; },
    click(x, y, button = 0) { mouse.x = x; mouse.y = y; edge.clicks.push({ x, y, button }); },
  };

  // ---- 소리
  let ac = null;
  function unlockAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
  }
  function tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.15, hp = 800) {
    if (!ac) return;
    const t = ac.currentTime, n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  }
  const sfx = {
    snap() { tone(1800, 0.05, 'square', 0.15); tone(900, 0.06, 'triangle', 0.12); },
    grab() { tone(660, 0.07, 'triangle', 0.18); },
    thud() { tone(120, 0.18, 'sine', 0.3, -60); },
    whoosh() { noise(0.35, 0.10, 1200); },
    fail() { tone(220, 0.25, 'sawtooth', 0.12, -120); },
    win() { tone(523, 0.1, 'triangle', 0.15); setTimeout(() => tone(784, 0.18, 'triangle', 0.15), 110); },
    beep() { tone(1200, 0.06, 'square', 0.08); },
    warn() { tone(880, 0.08, 'square', 0.1); },
    miss() { tone(300, 0.08, 'triangle', 0.12, -100); },
  };

  // ---- 그리기 도구
  function text(s, x, y, o = {}) {
    ctx.font = `${o.weight || 600} ${o.size || 16}px ${FONT}`;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    if (o.stroke) { ctx.lineWidth = o.strokeW || 4; ctx.strokeStyle = o.stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = o.color || '#f2f2ee'; ctx.fillText(s, x, y);
  }
  function textW(s, size = 16, weight = 600) { ctx.font = `${weight} ${size}px ${FONT}`; return ctx.measureText(s).width; }
  function panel(x, y, w, h, fill = 'rgba(10,12,16,0.82)', stroke = null) {
    ctx.fillStyle = fill; roundRect(x, y, w, h, 8); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function circle(x, y, r, fill, stroke, lw = 2) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function line(x1, y1, x2, y2, color, lw = 2, dash = null) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = lw;
    if (dash) ctx.setLineDash(dash); ctx.stroke(); if (dash) ctx.setLineDash([]);
  }
  // 상단 안내(최대 두 줄)와 제목, 하단 버전
  function header(title, l1, l2) {
    text(title, 16, 28, { size: 18, weight: 800 });
    if (l1) text(l1, 16, 50, { size: 13, color: 'rgba(240,240,235,0.78)', weight: 500 });
    if (l2) text(l2, 16, 68, { size: 13, color: 'rgba(240,240,235,0.78)', weight: 500 });
    text('v0.1 · R 다시', W - 12, H - 10, { size: 11, align: 'right', color: 'rgba(255,255,255,0.4)', weight: 500 });
  }
  // 결과 띠: 실패 원인 / 성공
  function banner(main, sub, kind = 'fail', y = 86) {
    const col = kind === 'fail' ? 'rgba(150,28,28,0.92)' : kind === 'win' ? 'rgba(24,110,60,0.92)' : 'rgba(30,40,70,0.92)';
    const w = Math.max(textW(main, 24, 800), textW(sub || '', 15, 500)) + 60;
    panel(W / 2 - w / 2, y, w, sub ? 74 : 48, col);
    text(main, W / 2, y + 34, { size: 24, weight: 800, align: 'center' });
    if (sub) text(sub, W / 2, y + 60, { size: 15, weight: 500, align: 'center', color: 'rgba(255,255,255,0.9)' });
  }

  let shakeT = 0, shakeA = 0, flashT = 0, flashCol = '#fff';
  function shake(a = 6, t = 0.25) { shakeA = a; shakeT = t; }
  function flash(col = 'rgba(255,60,60,0.35)', t = 0.25) { flashCol = col; flashT = t; }

  // ---- 루프
  let game = null, acc = 0, last = 0, simTime = 0;
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts; acc += dt;
    while (acc >= STEP) {
      if (game.bot && auto) game.bot(STEP, bot, auto);
      game.update(STEP, input);
      simTime += STEP; acc -= STEP;
      edge.pressed = {}; edge.released = {}; edge.aPress = false; edge.aRelease = false; edge.clicks = [];
      if (shakeT > 0) shakeT -= STEP; if (flashT > 0) flashT -= STEP;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let sx = 0, sy = 0;
    if (shakeT > 0) { sx = (Math.random() - 0.5) * shakeA * 2; sy = (Math.random() - 0.5) * shakeA * 2; }
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, (offX + sx * scale) * dpr, (offY + sy * scale) * dpr);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    game.draw(ctx);
    if (flashT > 0) { ctx.globalAlpha = Math.min(1, flashT * 4); ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.restore();
    requestAnimationFrame(frame);
  }
  function run(g, opts = {}) {
    game = g; oneButton = !!opts.oneButton;
    document.title = opts.title || document.title;
    g.init && g.init();
    requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  return { W, H, ctx, input, bot, sfx, text, textW, panel, roundRect, circle, line, header, banner, shake, flash, run, auto, params, clamp, lerp, dist, get time() { return simTime; } };
})();
