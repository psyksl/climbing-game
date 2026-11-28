// 가설 확인(사용자 지적, 2026-11-28): "팔·손목·다리·무릎·발목이 비정상으로 돌아가는 것은 턱에 막혀 못 가는 곳으로 가려 했거나 가는 길에 턱에 부딪힐 때다."
// **스크립트 입력이다(사람 손 아님).** 상태 = preview_check와 같다(코스의 시작 두 홀드 + 다음 홀드 DEPTH개). 표본 = 그 상태에서 둘레 안의 모든 홀드 × 두 손, 모든 상자 윗면 × 두 발.
// 재는 것(보낸 뒤 2초, 걸음마다): 보낸 팔다리의 뼈가 도는 빠르기(°/s)의 최댓값, 한 걸음 회전량이 앞 걸음과 12° 넘게 달라진 횟수(튐), 보낸 팔다리가 지형에 막힌 걸음 수.
// 갈래: 떠나지 않음(명령에서 거부) / 깨끗이 감 / 가는 길에 지형에 막힘(손: armBlock·blockT, 발: 정강이·발이 상자 안) / 도착에서 거부.
//   "막힘" = 손·발이 떠난 자리에서 10cm 넘게 간 뒤 0.05초(6걸음) 넘게: 손은 팔뚝·손목이 지형에 걸림(armBlock·blockT), 손·발 모두 그려진 뼈의 가운데 점이 상자 안.
//   "이상"의 잣대(개발 쪽이 정한 진단값. 사람의 한계를 잰 것이 아니다): 관절 범위(anat.js)를 30° 넘게 넘음 · 팔꿈치/무릎이 가는 방향이 3번 넘게 뒤집힘 · 한 걸음 회전 튐(12°).
// 설정 = 게임 기본에 맞춤(전신 연결·뻗기 전 검사·자동 이동 보호 켬, 쉬운 조작은 끔 — EASY=1로 켬). 발은 상태를 세우느라 발 보조 켬.
// 사용: [MODE=clip] [DEPTH=3] [COURSES=green,pink] [FEET=0] [OUT=파일.jsonl] node test/limb_twist.mjs
import { prov, provLine, provOptLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { legExcess, armExcess } = await imp('anat.js'), THREE = await import('three');
const E = process.env, CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter();
const world = makeGym(), DEPTH = +(E.DEPTH || 3), R = +(E.R || 1.15);
console.log(provLine(prov()), `· 깊이 ${DEPTH} · 둘레 ${R}m`);
const IDS = (E.COURSES || world.courses.map(c => c.id).join(',')).split(',');
const front = (b, n) => { const c = b.min.clone().add(b.max).multiplyScalar(0.5), half = Math.abs(n.x) * (b.max.x - b.min.x) / 2 + Math.abs(n.z) * (b.max.z - b.min.z) / 2; return c.addScaledVector(n, half).setY(b.max.y); };
function state(C, d) { const sim = makeSim(rig, world, CLIPS), n = new THREE.Vector3(...C.frame.n), holds = world.boxes.filter(b => b.course === C.id && b.role !== 'foot').sort((a, b) => a.seq - b.seq);
  sim.reset({ pos: C.startPos, yaw: C.startYaw }); Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: E.EASY === '1', press: true, footAssist: true, wallRest: false, linkPose: true, planReach: true, autoGuard: true });
  if (!globalThis.__optLine) console.log(globalThis.__optLine = provOptLine(sim));
  let look = null; const step = (k, cmd = []) => { for (let i = 0; i < k; i++) sim.step({ mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), cmd: i ? [] : cmd }); }, setLook = p => { look = p.toArray(); };
  step(12); for (let j = 0; j < 2 + d; j++) { if (j >= holds.length) return null; const p = front(holds[j], n), i = j % 2; setLook(p); if (j >= 2) step(30); step(j < 2 ? 90 : 150, [{ type: 'hand', i, p: p.toArray() }]); const h = sim.climb.hands[i]; if (!(h.st === 'hold' && h.edge && h.edge.box === holds[j])) return null; }
  step(60); return { sim, step, setLook, n }; }
const BONES = { hand: s => [`upperArm.${s}`, `foreArm.${s}`, `hand.${s}`], foot: s => [`upLeg.${s}`, `leg.${s}`, `foot.${s}`] };
const inBox = (p, m = 0.01) => world.boxes.find(x => !x.hidden && p.x > x.min.x + m && p.x < x.max.x - m && p.y > x.min.y + m && p.y < x.max.y - m && p.z > x.min.z + m && p.z < x.max.z - m);
const wp = b => b.getWorldPosition(new THREE.Vector3()), qA = q => [q.x, q.y, q.z, q.w], vA = v => [v.x, v.y, v.z], DEG = 180 / Math.PI;
// 그려진 뼈로 잰 관절: 팔 = 어깨·위팔 비틀림의 범위 넘침(°, 음수 = 범위 안)·손목 꺾임(팔뚝 방향과 손바닥 방향의 각), 다리 = 고관절·넓적다리 비틀림의 범위 넘침·발목(정강이와 발의 각이 90°에서 벗어난 정도)
function joint(B, limb, s) { const sx = s === 'R' ? -1 : 1;
  if (limb === 'hand') { const sh = wp(B[`upperArm.${s}`]), el = wp(B[`foreArm.${s}`]), wr = wp(B[`hand.${s}`]), qC = B.chest.getWorldQuaternion(new THREE.Quaternion()), palm = B[`hand.${s}`].localToWorld(new THREE.Vector3(0, -0.08, 0)).sub(wr).normalize();
    return { ex: armExcess(qA(qC), vA(sh), vA(el), vA(wr), sx) * DEG, end: wr.clone().sub(el).normalize().angleTo(palm) * DEG, mid: el, tip: wr }; }
  const hj = wp(B[`upLeg.${s}`]), kn = wp(B[`leg.${s}`]), an = wp(B[`foot.${s}`]), toe = wp(B[`toe.${s}`]), qH = B.hips.getWorldQuaternion(new THREE.Quaternion());
  return { ex: legExcess(qA(qH), vA(hj), vA(kn), vA(an), sx) * DEG, end: Math.abs(an.clone().sub(kn).normalize().angleTo(toe.clone().sub(an).normalize()) * DEG - 90), mid: kn, tip: an }; }
const rows = [], out = E.OUT ? fs.createWriteStream(E.OUT) : null;
function sample(C, d, id, limb, i, b) { const S = state(C, d), sim = S.sim, K = sim.climb, s = i ? 'R' : 'L', p = front(b, S.n), L = limb === 'hand' ? K.hands[i] : K.feet[i], B = sim.rig.bones;
  if (limb === 'hand' && L.st === 'hold' && L.edge && L.edge.box === b) return; if (limb === 'foot' && L.st === 'plant' && L.box === b) return;
  S.setLook(p); S.step(30); const log0 = K.log.length, st0 = L.st, names = BONES[limb](s), other = [...BONES.hand(i ? 'L' : 'R'), ...BONES.foot('L'), ...BONES.foot('R'), ...BONES.hand(s)].filter(n => !names.includes(n));
  const prev = new Map(), lastD = new Map(); let wMax = 0, wBone = '', wAt = 0, jerk = 0, oMax = 0, oJerk = 0, blk = 0, pen = 0, left = false, moveN = 0, exMax = -99, exN = 0, endMax = 0, path = 0, turn = 0, midP = null, midV = null, tip0 = null, far = 0;
  rig.root.updateMatrixWorld(true); for (const n of [...names, ...other]) prev.set(n, B[n].getWorldQuaternion(new THREE.Quaternion()));
  for (let k = 0; k < 240; k++) { S.step(1, k ? [] : [{ type: limb, i, p: p.toArray() }]); rig.root.updateMatrixWorld(true);
    const moving = limb === 'hand' ? (L.st === 'reach' || L.st === 'try') : L.st === 'move'; if (moving) { left = true; moveN++; }
    const J = joint(B, limb, s), root = wp(B.chest); if (!tip0) tip0 = J.tip.clone(); const away = J.tip.distanceTo(tip0) > 0.10; far = Math.max(far, J.tip.distanceTo(tip0));
    if (moving) { if (J.ex > exMax) exMax = J.ex; if (J.ex > 10) exN++; if (J.end > endMax) endMax = J.end;
      // 팔꿈치·무릎이 가슴 기준으로 지나간 길이와 방향이 뒤집힌 횟수(앞 걸음의 움직임과 반대 쪽으로 5mm/걸음 넘게)
      const m = J.mid.clone().sub(root); if (midP) { const v = m.clone().sub(midP); path += v.length(); if (midV && v.length() > 0.005 && midV.length() > 0.005 && v.dot(midV) < 0) turn++; midV = v; } midP = m; }
    if (limb === 'hand' && moving && away && (L.armBlock || (L.blockT || 0) > 0)) blk++;
    // 그려진 뼈가 상자 안에 있는 걸음(보낸 팔다리의 가운데 점들): 손 = 팔뚝 가운데·손목, 발 = 정강이 가운데·발목·발끝
    if (moving) { const pts = limb === 'hand' ? [wp(B[`foreArm.${s}`]).lerp(wp(B[`hand.${s}`]), 0.5), wp(B[`hand.${s}`])] : [wp(B[`leg.${s}`]).lerp(wp(B[`foot.${s}`]), 0.5), wp(B[`foot.${s}`]), wp(B[`toe.${s}`])]; if (away && pts.some(q => inBox(q))) pen++; }
    for (const n of [...names, ...other]) { const q = B[n].getWorldQuaternion(new THREE.Quaternion()), dd = prev.get(n).angleTo(q) * 180 / Math.PI, w = dd * 120, ld = lastD.get(n); prev.set(n, q); lastD.set(n, dd); const mine = names.includes(n), jk = ld !== undefined && Math.abs(dd - ld) > 12;
      if (mine) { if (w > wMax) { wMax = w; wBone = n; wAt = k; } if (jk) jerk++; } else { if (w > oMax) oMax = w; if (jk) oJerk++; } } }
  const evs = K.log.slice(log0), mine = evs.filter(e => e.limb === limb && e.i === i), den = mine.find(e => e.type === 'deny'), rej = mine.find(e => e.type === 'reject' || e.type === 'slip'), got = limb === 'hand' ? (L.st === 'hold' && !!L.edge && L.edge.box === b) : (L.st === 'plant' && L.box === b);
  const why = ((den || rej || {}).why || '').replace(/\(.*\)/, ''), kind = !left ? '떠나지 않음' : (blk >= 6 || pen >= 6) ? (got ? '막힘 → 닿음' : '막힘 → 못 감') : got ? '깨끗이 닿음' : '안 막힘 → 못 감';
  const lostOther = evs.filter(e => !(e.limb === limb && e.i === i) && (e.type === 'release' || e.type === 'slip' || e.type === 'reject' || e.type === 'lift') && e.cause && e.cause !== 'command').length;
  const row = { course: id, d, limb, i, box: b.name, st0, kind, got, why, blk, pen, moveN, wMax: Math.round(wMax), wBone, wAt, jerk, exMax: Math.round(exMax), exN, endMax: Math.round(endMax), path: +path.toFixed(3), turn, far: +far.toFixed(3), oMax: Math.round(oMax), oJerk, lostOther };
  rows.push(row); if (out) out.write(JSON.stringify(row) + '\n'); }
for (const id of IDS) { const C = world.courses.find(c => c.id === id); if (!C) continue;
  for (let d = 0; d <= DEPTH; d++) { const S0 = state(C, d); if (!S0) break; const b0 = S0.sim.body.pos, chest = b0.clone().add(new THREE.Vector3(0, 1.3, 0)), hip = b0.clone().add(new THREE.Vector3(0, 0.9, 0));
    const cand = world.boxes.filter(b => !b.stair && !b.hidden && b.kind !== 'floor' && b.kind !== 'wall' && b.max.y - b.min.y < 0.3);
    for (const b of cand.filter(b => front(b, S0.n).distanceTo(chest) < R)) for (const i of [0, 1]) sample(C, d, id, 'hand', i, b);
    if (E.FEET !== '0') for (const b of cand.filter(b => front(b, S0.n).distanceTo(hip) < 1.05 && b.max.y < chest.y)) for (const i of [0, 1]) sample(C, d, id, 'foot', i, b); } }
if (out) out.end();
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }, pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
for (const limb of ['hand', 'foot']) { const rs = rows.filter(r => r.limb === limb); console.log(`\n[${limb === 'hand' ? '손' : '발'}] 표본 ${rs.length}`);
  for (const k of ['떠나지 않음', '깨끗이 닿음', '안 막힘 → 못 감', '막힘 → 닿음', '막힘 → 못 감']) { const g = rs.filter(r => r.kind === k); if (!g.length) continue; const ex = g.map(r => r.exMax), en = g.map(r => r.endMax), tn = g.map(r => r.turn);
    console.log(`  ${k.padEnd(10)} ${String(g.length).padStart(4)} · 범위 넘침(최대) 중앙 ${med(ex)}° · 90% ${pct(ex, 0.9)}° · 10° 넘게 넘은 표본 ${g.filter(r => r.exMax > 10).length} · 30° 넘게 ${g.filter(r => r.exMax > 30).length} ‖ ${limb === 'hand' ? '손목 꺾임' : '발목 벗어남'} 중앙 ${med(en)}° · 90% ${pct(en, 0.9)}° ‖ ${limb === 'hand' ? '팔꿈치' : '무릎'} 방향 뒤집힘 중앙 ${med(tn)} · 90% ${pct(tn, 0.9)} · 3번 넘는 표본 ${g.filter(r => r.turn > 3).length} ‖ 튐 ${g.filter(r => r.jerk > 0).length} · 다른 손발 풀림 ${g.filter(r => r.lostOther > 0).length}`); }
  const by = {}; for (const r of rs.filter(r => r.why)) by[r.kind + ' / ' + r.why] = (by[r.kind + ' / ' + r.why] || 0) + 1; console.log('  까닭: ' + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
  const left = rs.filter(r => r.kind !== '떠나지 않음'), ab = r => r.exMax > 30 || r.turn > 3 || r.jerk > 0, Bk = left.filter(r => r.kind.startsWith('막힘')), Nk = left.filter(r => !r.kind.startsWith('막힘'));
  console.log(`  떠난 표본 ${left.length}: 막힘 ${Bk.length} 가운데 이상 ${Bk.filter(ab).length} · 안 막힘 ${Nk.length} 가운데 이상 ${Nk.filter(ab).length} ‖ 이상 ${left.filter(ab).length} 가운데 막힘이었던 것 ${Bk.filter(ab).length}`); }
