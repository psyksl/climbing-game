// 연습 공용 부품: 어떤 연습(연습 과제, 자유 연습, 앞으로 만들 연습장)에서든 같은 방법으로 쓴다. 게임 화면(game.js)은 이 부품들을 이어 붙이기만 한다.
//   track  : 시도하는 동안 몸의 모습을 걸음마다 적어 두는 자취 → 리플레이는 이것을 그대로 다시 보인다(다시 계산하지 않으므로 어느 시각으로든 바로 간다).
//            정해 둔 시간(기본 2분)까지만 연속으로 적고, 리플레이는 그 연속 구간만 재생한다
//   clock  : 리플레이의 재생 시계(재생·멈춤, 시각 옮기기, 조금씩 넘기기, 속도)
//   view   : 입력 비교 차트의 시야(보이는 시작 시각과 폭, 따라가기, 확대·축소, 옮기기, 전체 보기)
//   dockZones·dockTarget·splitSize·fitView·laneHeight : 화면을 차트 구역과 플레이 구역으로 나누는 계산(붙는 쪽, 경계선으로 크기 조절, 플레이 화면 맞춰 넣기, 줄 높이)
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
    v.follow = (now, end, maxSpan) => { // 손으로 옮기지 않았다면: 기록이 길어질수록 시간축을 줄여 전체를 보이고(maxSpan까지), 그보다 길면 지금 시각을 따라간다
      if (!v.manual && maxSpan) { const e = Math.max(end, now || 0); v.span = lim(e * 1.08 + 0.3, v.span0, Math.max(v.span0, maxSpan)); if (v.span >= e + 0.05) { v.start = 0; return; } } // 전체가 들어가는 동안에는 0초부터 보인다
      if (now !== null && !v.manual) { if (now - v.start > v.span * 0.88) v.start = now - v.span * 0.88; if (now < v.start) v.start = Math.max(0, now - v.span * 0.1); }
      v.start = lim(v.start, 0, maxStart(Math.max(end, now || 0))); };
    v.pan = (d, end) => { v.start = lim(v.start + d, 0, maxStart(end)); v.manual = true; };
    v.zoom = (f, pivot, end) => { const span = lim(v.span * f, 0.5, Math.max(8, end * 1.5 + 1)), r = (pivot - v.start) / v.span; v.span = span; v.start = lim(pivot - r * span, 0, maxStart(end)); v.manual = true; }; // pivot 시각이 화면의 같은 자리에 머문다
    v.fit = end => { v.start = 0; v.span = Math.max(1, end + 0.3); v.manual = true; };  // 전체 보기
    return v;
  }
  // ---- 화면 나누기: 차트 구역과 플레이 구역. dock = 차트 구역이 붙는 쪽(bottom·top·left·right), size = 그 구역의 높이(위·아래) 또는 너비(왼·오른쪽)
  // line = 두 구역의 경계선(끌어서 구역 크기를 바꾸는 곳)
  function dockZones(dock, size, W, H) {
    if (dock === 'top') return { chart: { x: 0, y: 0, w: W, h: size }, play: { x: 0, y: size, w: W, h: H - size }, line: { x: 0, y: size, w: W, h: 0 }, vertical: false };
    if (dock === 'left') return { chart: { x: 0, y: 0, w: size, h: H }, play: { x: size, y: 0, w: W - size, h: H }, line: { x: size, y: 0, w: 0, h: H }, vertical: true };
    if (dock === 'right') return { chart: { x: W - size, y: 0, w: size, h: H }, play: { x: 0, y: 0, w: W - size, h: H }, line: { x: W - size, y: 0, w: 0, h: H }, vertical: true };
    return { chart: { x: 0, y: H - size, w: W, h: size }, play: { x: 0, y: 0, w: W, h: H - size }, line: { x: 0, y: H - size, w: W, h: 0 }, vertical: false };
  }
  // 차트 구역을 끌어다 놓을 때: 마우스가 화면의 어느 변에 가장 가까운가(화면 크기에 견준 거리)
  function dockTarget(x, y, W, H) { const d = { left: x / W, right: 1 - x / W, top: y / H, bottom: 1 - y / H }; return Object.keys(d).sort((a, b) => d[a] - d[b])[0]; }
  // 경계선을 끌 때: 마우스 자리에 맞는 구역 크기(최소·최대를 지킨다)
  function splitSize(dock, x, y, W, H, min, max) { return lim(dock === 'bottom' ? H - y : dock === 'top' ? y : dock === 'left' ? x : W - x, min, max); }
  // 플레이 구역 안에 게임 화면(W×H)을 비율을 지켜 넣는다. s = 배율, (x0, y0) = 화면에서의 왼쪽 위.
  // ay = 세로로 남는 자리를 위아래로 나누는 비율(0.5 = 가운데, 1 = 게임 화면을 아래에 붙이고 위를 비운다)
  function fitView(play, W, H, ay = 0.5) { const s = Math.min(play.w / W, play.h / H); return { s, x0: play.x + (play.w - W * s) / 2, y0: play.y + (play.h - H * s) * ay }; }
  // 차트 구역의 크기는 그대로 두고, 줄이 늘수록 줄 높이를 줄인다(가장 작게는 min, 줄이 적어도 max보다 크게 하지는 않는다)
  function laneHeight(avail, n, min = 11, max = 50) { return lim(avail / Math.max(1, n), min, max); }
  return { HZ, MAX_S, clone, track, clock, view, dockZones, dockTarget, splitSize, fitView, laneHeight };
})();
if (typeof module !== 'undefined') module.exports = PRACTICE;
