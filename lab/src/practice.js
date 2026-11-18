// 연습 공용 부품: 어떤 연습(연습 과제, 자유 연습, 앞으로 만들 연습장)에서든 같은 방법으로 쓴다. 게임 화면(game.js)은 이 부품들을 이어 붙이기만 한다.
//   track  : 시도하는 동안 몸의 모습을 걸음마다 적어 두는 자취 → 리플레이는 이것을 그대로 다시 보인다(다시 계산하지 않으므로 어느 시각으로든 바로 간다).
//            정해 둔 시간(기본 2분)까지만 연속으로 적고, 리플레이는 그 연속 구간만 재생한다
//   clock  : 리플레이의 재생 시계(재생·멈춤, 시각 옮기기, 조금씩 넘기기, 속도)
//   view   : 입력 비교 차트의 시야(보이는 시작 시각과 폭, 따라가기, 확대·축소, 옮기기, 전체 보기)
//   zone·drag·fitRect : 창처럼 옮기고 가장자리로 크기를 바꾸는 사각형
// 연습 하나가 정해 주는 것은 벽·시작 자세·(있다면) 성공 조건뿐이다. 기록·끝난 뒤 화면(다시하기/리플레이)·차트는 모두 여기 부품으로 돌아간다
'use strict';
const PRACTICE = (() => {
  const HZ = 60, MAX_S = 120; // 자취는 1초에 60장, 2분까지(그 뒤는 적지 않는다)
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  // 몸 상태를 통째로 베낀다(벽은 바뀌지 않으므로 같이 쓴다)
  function clone(s) { const w = s.world; s.world = null; let c; try { c = structuredClone(s); } finally { s.world = w; } c.world = w; c.events = []; return c; }
  // maxS초까지 연속으로 적는다. 그 뒤로는 적지 않는다(tr.full). 리플레이는 연속으로 적힌 데(tr.end())까지만 재생한다 — 빠진 구간을 건너뛰어 재생하지 않는다.
  // 시도가 끝난 순간의 모습은 finish가 따로 들고 있는다(tr.final). 연속 기록 안에서 끝났다면 마지막 장으로도 넣는다
  function track(maxS = MAX_S) {
    const tr = { frames: [], full: false, final: null, maxS };
    const frame = (s, extra) => ({ t: s.t, s: clone(s), ...(extra || {}) });
    tr.hold = (s, extra) => { tr.frames = [frame(s, extra)]; };                        // 첫 입력 전: 마지막 모습 하나만 들고 있는다
    tr.push = (s, extra) => { const fr = tr.frames, last = fr[fr.length - 1];           // 첫 입력 뒤: 1/60초마다 한 장
      if (tr.full || (last && s.t - last.t < 1 / HZ - 1e-9)) return false;
      if (fr.length >= Math.round(HZ * maxS) + 1) { tr.full = true; return false; }
      fr.push(frame(s, extra)); return true; };
    tr.finish = (s, extra) => { const fr = tr.frames, last = fr[fr.length - 1]; tr.final = frame(s, extra);
      if (!tr.full && last && s.t > last.t + 1e-9 && fr.length < Math.round(HZ * maxS) + 2) fr.push(tr.final); return tr.final; };
    tr.at = t => { const fr = tr.frames; if (!fr.length) return null; let a = 0, b = fr.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (fr[m].t <= t + 1e-9) a = m; else b = m - 1; } return fr[a]; }; // 그 시각까지의 마지막 모습
    tr.t0 = () => tr.frames.length ? tr.frames[0].t : 0;
    tr.end = () => tr.frames.length ? tr.frames[tr.frames.length - 1].t : 0;             // 연속으로 적힌 끝(리플레이할 수 있는 끝)
    tr.t1 = tr.end;
    return tr;
  }
  function clock(from, to) {
    const ck = { t: from, from, to: Math.max(from, to), playing: false, speed: 1 };
    ck.update = dt => { if (!ck.playing) return; ck.t += dt * ck.speed; if (ck.t >= ck.to) { ck.t = ck.to; ck.playing = false; } };
    ck.seek = t => { ck.t = lim(t, ck.from, ck.to); };
    ck.toggle = () => { if (!ck.playing && ck.t >= ck.to - 1e-6) ck.t = ck.from; ck.playing = !ck.playing; }; // 끝에서 재생을 누르면 처음부터
    ck.nudge = d => { ck.playing = false; ck.seek(ck.t + d); };
    ck.cycleSpeed = () => { ck.speed = ck.speed === 1 ? 0.5 : ck.speed === 0.5 ? 0.25 : 1; };
    return ck;
  }
  function view(span0) {
    const v = { start: 0, span: span0, span0, manual: false };
    const maxStart = end => Math.max(0, end - v.span * 0.25);
    v.reset = () => { v.start = 0; v.span = v.span0; v.manual = false; };
    v.follow = (now, end) => { // 손으로 옮기지 않았다면 지금 시각을 따라간다
      if (now !== null && !v.manual) { if (now - v.start > v.span * 0.88) v.start = now - v.span * 0.88; if (now < v.start) v.start = Math.max(0, now - v.span * 0.1); }
      v.start = lim(v.start, 0, maxStart(Math.max(end, now || 0))); };
    v.pan = (d, end) => { v.start = lim(v.start + d, 0, maxStart(end)); v.manual = true; };
    v.zoom = (f, pivot, end) => { const span = lim(v.span * f, 0.5, Math.max(8, end * 1.5 + 1)), r = (pivot - v.start) / v.span; v.span = span; v.start = lim(pivot - r * span, 0, maxStart(end)); v.manual = true; }; // pivot 시각이 화면의 같은 자리에 머문다
    v.fit = end => { v.start = 0; v.span = Math.max(1, end + 0.3); v.manual = true; };  // 전체 보기
    return v;
  }
  // 사각형의 어느 곳을 잡았나: 가장자리(m px 안)는 크기 바꾸기, 안쪽은 옮기기, 밖은 null
  function zone(r, x, y, m = 7) {
    if (x < r.x - m || x > r.x + r.w + m || y < r.y - m || y > r.y + r.h + m) return null;
    const z = { l: x < r.x + m, r: x > r.x + r.w - m, t: y < r.y + m, b: y > r.y + r.h - m }; z.edge = z.l || z.r || z.t || z.b; return z;
  }
  const cursorOf = z => !z ? null : (z.l && z.t) || (z.r && z.b) ? 'nwse-resize' : (z.r && z.t) || (z.l && z.b) ? 'nesw-resize' : z.l || z.r ? 'ew-resize' : z.t || z.b ? 'ns-resize' : 'move';
  // 잡은 곳(z)과 움직인 만큼(dx, dy)으로 새 사각형을 만든다. 최소 크기와 화면 안쪽을 지킨다
  function drag(r0, z, dx, dy, min, box) {
    let { x, y, w, h } = r0;
    if (!z.edge) { x = lim(x + dx, box.x, box.x + box.w - w); y = lim(y + dy, box.y, box.y + box.h - h); return { x, y, w, h }; }
    if (z.l) { const nx = lim(x + dx, box.x, x + w - min.w); w += x - nx; x = nx; }
    if (z.r) w = lim(w + dx, min.w, box.x + box.w - x);
    if (z.t) { const ny = lim(y + dy, box.y, y + h - min.h); h += y - ny; y = ny; }
    if (z.b) h = lim(h + dy, min.h, box.y + box.h - y);
    return { x, y, w, h };
  }
  function fitRect(r, min, box) { const w = lim(r.w, min.w, box.w), h = lim(r.h, min.h, box.h); return { x: lim(r.x, box.x, box.x + box.w - w), y: lim(r.y, box.y, box.y + box.h - h), w, h }; }
  return { HZ, MAX_S, clone, track, clock, view, zone, cursorOf, drag, fitRect };
})();
if (typeof module !== 'undefined') module.exports = PRACTICE;
