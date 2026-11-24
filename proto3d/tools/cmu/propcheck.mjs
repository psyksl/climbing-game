// 동작 보기의 CMU 지형(clip.props, 원본 닿은 자리로 만든 것)과 옮긴 동작: ① 닿아야 할 때 손바닥·발볼이 지형 겉면에서 얼마나 떨어졌나 ② 팔다리가 지형을 지나가는 장면
// 사용: node propcheck.mjs <동작 보기 자료 json> <이름> <원본 닿음 json(rungs.py)>
const R = new URL('../../', import.meta.url).pathname;
const THREE = await import(R + 'node_modules/three/build/three.module.js');
const fs = await import('fs'), { buildCharacter, DIM } = await import(R + 'src/rig.js');
const [gal, name, holdsF] = process.argv.slice(2), G = JSON.parse(fs.readFileSync(gal, 'utf8')), c = G.clips[name], H = JSON.parse(fs.readFileSync(holdsF, 'utf8')).holds, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rig = buildCharacter(), B = rig.bones, BONES = G.bones, BALL = V(0, -(DIM.ankleY - 0.02), DIM.ballZ), PALM = V(0, -0.08, 0), NM = ['왼손', '오른손', '왼발', '오른발'];
const pose = f => { B.hips.position.set(c.hip[3 * f], c.hip[3 * f + 1], c.hip[3 * f + 2]); BONES.forEach((nm, j) => B[nm].quaternion.set(...c.q.slice(4 * (f * 21 + j), 4 * (f * 21 + j) + 4))); rig.root.updateMatrixWorld(true); };
// 지형 겉면까지의 부호 있는 거리(안 = 음수)
const P = c.props.list.map(q => q.t === 'box' ? { t: 'box', a: V(...q.a), b: V(...q.b) } : { t: 'cyl', a: V(...q.a), b: V(...q.b), r: q.r });
const sd = p => { let best = 1e9; for (const q of P) { let d;
  if (q.t === 'box') { const cpt = p.clone().clamp(q.a, q.b), out = p.distanceTo(cpt); if (out > 0) d = out; else d = -Math.min(p.x - q.a.x, q.b.x - p.x, p.y - q.a.y, q.b.y - p.y, p.z - q.a.z, q.b.z - p.z); }
  else { const ab = q.b.clone().sub(q.a), t = THREE.MathUtils.clamp(p.clone().sub(q.a).dot(ab) / ab.lengthSq(), 0, 1); d = p.distanceTo(q.a.clone().addScaledVector(ab, t)) - q.r; }
  best = Math.min(best, d); } return best; };
const endP = e => (e < 2 ? B[e ? 'hand.R' : 'hand.L'].localToWorld(PALM.clone()) : B[e === 2 ? 'foot.L' : 'foot.R'].localToWorld(BALL.clone()));
const cm = x => (x * 100).toFixed(1);
// ①
const rows = []; for (const h of H) { if (h.e >= 2 && h.base[1] < 0.15) continue; if (h.e < 2 && name.includes('매달리기') && h.base[1] < 1.5) continue;
  const f0 = Math.round(h.t0 * c.fps), f1 = Math.min(c.n - 1, Math.round(h.t1 * c.fps)); let s = 0, mx = -1e9, mn = 1e9, n = 0;
  for (let f = f0; f <= f1; f++) { pose(f); const d = sd(endP(h.e)); s += d; mx = Math.max(mx, d); mn = Math.min(mn, d); n++; } rows.push({ e: h.e, t0: h.t0, t1: h.t1, mean: s / n, mx, mn }); }
console.log(`■ ${name} · 지형 ${c.props.kind} 조각 ${P.length}개 (원본에서 손발이 멈춘 자리로 만듦)`);
console.log('  ① 닿는 구간: 손바닥(손목에서 8cm)·발볼(발바닥 2cm 위)이 지형 겉면에서 떨어진 거리(음수 = 안으로 들어감). 쥔 손의 손바닥은 막대 겉면에서 1~3cm, 발볼은 디딤판 위 2cm가 닿은 모양이다');
for (const r of rows) console.log(`    ${NM[r.e]} ${r.t0.toFixed(2)}~${r.t1.toFixed(2)}초 평균 ${cm(r.mean)} (${cm(r.mn)}~${cm(r.mx)})cm`);
// ② 팔다리·몸통이 지형을 지나감: 뼈를 따라 점을 찍고 굵기(팔 4cm, 다리 6cm, 몸통 12cm)보다 깊이 들어간 장면
const SEG = [['upperArm.L', 'foreArm.L', 0.045], ['foreArm.L', 'hand.L', 0.04], ['upperArm.R', 'foreArm.R', 0.045], ['foreArm.R', 'hand.R', 0.04], ['upLeg.L', 'leg.L', 0.065], ['leg.L', 'foot.L', 0.05], ['upLeg.R', 'leg.R', 0.065], ['leg.R', 'foot.R', 0.05], ['hips', 'neck', 0.12], ['neck', 'head', 0.09]];
let bad = 0, worst = 0, wf = -1, wseg = ''; const segF = {};
for (let f = 0; f < c.n; f++) { pose(f); let fb = false; for (const [a, b, r] of SEG) { const A = B[a].getWorldPosition(V()), Bp = B[b].getWorldPosition(V()); let sb = false; for (let i = 0; i <= 6; i++) { const d = sd(A.clone().lerp(Bp, i / 6)) - r; if (d < -0.02) { fb = sb = true; if (-d > worst) { worst = -d; wf = f; wseg = `${a}→${b}`; } } } if (sb) segF[`${a}→${b}`] = (segF[`${a}→${b}`] || 0) + 1; } if (fb) bad++; }
console.log(`  ② 팔다리·몸통이 지형에 2cm 넘게 들어간 장면 ${bad}/${c.n}` + (bad ? ` · 가장 깊음 ${cm(worst)}cm (${(wf / c.fps).toFixed(2)}초, ${wseg}) · 부위별 장면 수 ${JSON.stringify(segF)}` : ''));
