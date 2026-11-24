// 원본 CMU 등반 동작(사람 촬영)과 우리 게임의 같은 종류 장면(스크립트 입력)을 같은 잣대로 잰다: 골반·어깨의 기울기·돌림, 윗몸 기울기, 손발이 움직이는 시간·빠르기, 동시에 움직이는 손발, 엉덩이가 오르는 빠르기
// 사용: node tools/cmu/rhythm_compare.mjs <CMU 폴더(…/out)> [JSON]   (게임 장면은 POSTURE=fb|rule — 화면 기본은 fb)
// 주의: 원본은 사람 한 명(피험자 13·14·1)의 몇 동작이고, 게임 쪽은 스크립트 입력의 결과다(사람 손 아님). 지형도 다르다(원본 = 기울어진 사다리·구름사다리, 게임 = 수직 벽의 턱·발판)
import { prov, provLine } from '../../test/provenance.mjs';
const __P = prov(); console.log(provLine(__P));
const R = new URL('../../', import.meta.url).pathname, THREE = await import('three'), fs = await import('fs');
const { loadAsf, loadAmc, fk } = await import(R + 'tools/cmu_convert.mjs'), { buildCharacter, DIM } = await import(R + 'src/rig.js'), { makeWorld } = await import(R + 'src/world.js'), { makeSim } = await import(R + 'src/sim.js');
const { SCENES_FOOT, SCENES_H, START } = await import(R + 'test/scenes_foot.mjs');
const [cmuDir, jsonOut] = process.argv.slice(2), V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), deg = 180 / Math.PI;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// 같은 잣대: 프레임마다 {hL, hR(고관절), sL, sR(어깨), hand[2](손목), ball[2](발볼)}, dt
function metrics(F, dt) {
  const roll = (a, b) => Math.asin((a.y - b.y) / a.distanceTo(b)) * deg, yaw = (a, b) => Math.atan2(a.z - b.z, a.x - b.x);
  const pr = [], sr = [], py = [], tw = [], latL = [], fwdL = [];
  const handMean = V(); F.forEach(f => handMean.add(f.hand[0]).add(f.hand[1])); handMean.multiplyScalar(1 / (2 * F.length));
  const py0 = Math.atan2(F.reduce((s, f) => s + Math.sin(yaw(f.hL, f.hR)), 0), F.reduce((s, f) => s + Math.cos(yaw(f.hL, f.hR)), 0));
  for (const f of F) { pr.push(roll(f.hL, f.hR)); sr.push(roll(f.sL, f.sR)); const a = wrap(yaw(f.hL, f.hR) - py0); py.push(a * deg); tw.push(wrap(yaw(f.sL, f.sR) - yaw(f.hL, f.hR)) * deg);
    const hm = f.hL.clone().add(f.hR).multiplyScalar(0.5), sm = f.sL.clone().add(f.sR).multiplyScalar(0.5), d = sm.sub(hm), side = f.hL.clone().sub(f.hR).setY(0).normalize(), fw = V(-side.z, 0, side.x); if (fw.dot(handMean.clone().sub(hm).setY(0)) < 0) fw.negate();
    latL.push(Math.atan2(d.dot(side), d.y) * deg); fwdL.push(Math.atan2(d.dot(fw), d.y) * deg); }
  const rng = a => ({ p5: +pct(a, 0.05).toFixed(1), p50: +pct(a, 0.5).toFixed(1), p95: +pct(a, 0.95).toFixed(1) });
  // 손발이 움직이는 구간: 0.1초 평균 빠르기 초속 0.25m 넘게, 0.1초 이상
  const P = f => [f.hand[0], f.hand[1], f.ball[0], f.ball[1]], W = Math.max(1, Math.round(0.05 / dt)), n = F.length, mov = [0, 1, 2, 3].map(() => new Array(n).fill(false)), segs = [[], [], [], []];
  for (let e = 0; e < 4; e++) { for (let i = 0; i < n; i++) { const a = P(F[Math.max(0, i - W)])[e], b = P(F[Math.min(n - 1, i + W)])[e]; mov[e][i] = a.distanceTo(b) / ((Math.min(n - 1, i + W) - Math.max(0, i - W)) * dt) > 0.25; }
    let i = 0; while (i < n) { if (mov[e][i]) { let j = i; while (j < n && mov[e][j]) j++; if ((j - i) * dt >= 0.1) { let pk = 0; for (let k = i + 1; k < j; k++) pk = Math.max(pk, P(F[k])[e].distanceTo(P(F[k - 1])[e]) / dt); segs[e].push({ t0: +(i * dt).toFixed(2), dur: +((j - i) * dt).toFixed(2), dist: +P(F[j - 1])[e].distanceTo(P(F[i])[e]).toFixed(3), peak: +pk.toFixed(2) }); } else for (let k = i; k < j; k++) mov[e][k] = false; i = j; } else i++; } }
  let any = 0, two = 0, hf = 0; for (let i = 0; i < n; i++) { const c = mov.reduce((s, m) => s + (m[i] ? 1 : 0), 0); if (c) any++; if (c >= 2) two++; if ((mov[0][i] || mov[1][i]) && (mov[2][i] || mov[3][i])) hf++; }
  const hipY = F.map(f => (f.hL.y + f.hR.y) / 2), vy = hipY.map((y, i) => (hipY[Math.min(n - 1, i + W)] - hipY[Math.max(0, i - W)]) / ((Math.min(n - 1, i + W) - Math.max(0, i - W)) * dt));
  const hs = segs.slice(0, 2).flat(), fs_ = segs.slice(2).flat(), sm = (a, k) => (a.length ? +(a.reduce((s, x) => s + x[k], 0) / a.length).toFixed(2) : null);
  return { 길이_초: +(n * dt).toFixed(2), 골반_옆기울기: rng(pr), 어깨_옆기울기: rng(sr), 골반_돌림: rng(py), 가슴_골반_비틀림: rng(tw), 윗몸_옆기울기: rng(latL), 윗몸_앞뒤기울기: rng(fwdL),
    손_옮김: { 횟수: hs.length, 평균_시간: sm(hs, 'dur'), 평균_거리: sm(hs, 'dist'), 평균_최고빠르기: sm(hs, 'peak') }, 발_옮김: { 횟수: fs_.length, 평균_시간: sm(fs_, 'dur'), 평균_거리: sm(fs_, 'dist'), 평균_최고빠르기: sm(fs_, 'peak') },
    움직이는_시간_중_둘_이상: any ? +(two / any).toFixed(2) : null, 움직이는_시간_중_손발_함께: any ? +(hf / any).toFixed(2) : null, 엉덩이_오르는_빠르기_p95: +pct(vy, 0.95).toFixed(2), 엉덩이_높이_변화: +(Math.max(...hipY) - Math.min(...hipY)).toFixed(2), segs };
}
const out = { 원본: {}, 게임: {} };
// 원본: 120장/초 → 60장/초로 솎아 잰다
for (const [sub, take, t0, t1, nm] of [['13', '13_34', 0, 11.8, '13_34 기운 사다리 오르내림'], ['14', '14_34', 0, 11.9, '14_34 기운 사다리 오르내림'], ['01', '01_06', 5, 11, '01_06 구름사다리 매달림']]) {
  const S = loadAsf(`${cmuDir}/${sub}/${sub}.asf`), all = loadAmc(`${cmuDir}/${sub}/${take}.amc`), F = [];
  for (let i = Math.round(t0 * 120); i <= Math.min(all.length - 1, Math.round(t1 * 120)); i += 2) { const { pos } = fk(S, all[i]); F.push({ hL: pos.lhipjoint, hR: pos.rhipjoint, sL: pos.lclavicle, sR: pos.rclavicle, hand: [pos.lwrist, pos.rwrist], ball: [pos.lfoot, pos.rfoot] }); }
  out.원본[nm] = metrics(F, 2 / 120);
}
// 게임: 발 올리기 → 몸 올리기 장면(스크립트 입력, 120걸음/초 → 60장/초로 솎음)
const BALL = V(0, -(DIM.ankleY - 0.02), DIM.ballZ);
for (const [title, fn, assist, , st0] of [SCENES_FOOT[0], SCENES_FOOT[1], SCENES_H[0]]) {
  const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: st0 || START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; if (process.env.VARIANT) sim.opt.posture = process.env.VARIANT;
  const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(sim, put, rep);
  const F = [], B = rig.bones, wp = n => B[n].getWorldPosition(V());
  for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); if (k % 2) continue; rig.root.updateMatrixWorld(true); if (!sim.climb.on) continue;
    F.push({ hL: wp('upLeg.L'), hR: wp('upLeg.R'), sL: wp('upperArm.L'), sR: wp('upperArm.R'), hand: [wp('hand.L'), wp('hand.R')], ball: [B['foot.L'].localToWorld(BALL.clone()), B['foot.R'].localToWorld(BALL.clone())] }); }
  out.게임[title.split(':')[0].slice(0, 40)] = metrics(F, 2 / 120);
}
const show = (g, nm, m) => console.log(`\n■ ${g} ${nm} (${m.길이_초}초)\n  골반 옆기울기 ${m.골반_옆기울기.p5}~${m.골반_옆기울기.p95}° · 어깨 옆기울기 ${m.어깨_옆기울기.p5}~${m.어깨_옆기울기.p95}° · 골반 돌림 ${m.골반_돌림.p5}~${m.골반_돌림.p95}° · 가슴−골반 비틀림 ${m.가슴_골반_비틀림.p5}~${m.가슴_골반_비틀림.p95}°\n  윗몸 옆기울기 ${m.윗몸_옆기울기.p5}~${m.윗몸_옆기울기.p95}° · 윗몸 앞뒤(+ = 손 쪽으로) ${m.윗몸_앞뒤기울기.p5}~${m.윗몸_앞뒤기울기.p95}° (가운데 ${m.윗몸_앞뒤기울기.p50}°)\n  손 옮김 ${m.손_옮김.횟수}번 평균 ${m.손_옮김.평균_시간}초·${m.손_옮김.평균_거리}m·최고 초속 ${m.손_옮김.평균_최고빠르기}m · 발 옮김 ${m.발_옮김.횟수}번 평균 ${m.발_옮김.평균_시간}초·${m.발_옮김.평균_거리}m·최고 초속 ${m.발_옮김.평균_최고빠르기}m\n  움직이는 동안 둘 이상이 함께 ${m.움직이는_시간_중_둘_이상} · 손과 발이 함께 ${m.움직이는_시간_중_손발_함께} · 엉덩이 오르는 빠르기(95%) 초속 ${m.엉덩이_오르는_빠르기_p95}m · 엉덩이 높이 변화 ${m.엉덩이_높이_변화}m`);
for (const [nm, m] of Object.entries(out.원본)) show('원본(사람)', nm, m);
for (const [nm, m] of Object.entries(out.게임)) show('게임(스크립트)', nm, m);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ prov: __P, ...out }, null, 1));
