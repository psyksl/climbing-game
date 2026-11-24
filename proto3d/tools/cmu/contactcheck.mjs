// 옮긴 동작의 손목·발볼이 원본에서 닿은 자리(같은 옮김으로 줄인 자리)에 얼마나 가까운가 — 지형(사다리·막대)을 원본에서 만들면 손발이 거기 닿는지를 미리 잰다
// 사용: node contactcheck.mjs <동작 보기 자료 json> <이름> <원본 닿음 json(rungs.py 출력)>
const R = new URL('../../', import.meta.url).pathname;
const THREE = await import(R + 'node_modules/three/build/three.module.js');
const fs = await import('fs'), { buildCharacter, DIM } = await import(R + 'src/rig.js');
const [gal, name, holdsF] = process.argv.slice(2), G = JSON.parse(fs.readFileSync(gal, 'utf8')), c = G.clips[name], H = JSON.parse(fs.readFileSync(holdsF, 'utf8')).holds, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rig = buildCharacter(), B = rig.bones, BONES = G.bones, BALL = V(0, -(DIM.ankleY - 0.02), DIM.ballZ), LIMB = ['hand.L', 'hand.R', 'foot.L', 'foot.R'], NM = ['왼손', '오른손', '왼발', '오른발'];
const pose = f => { B.hips.position.set(c.hip[3 * f], c.hip[3 * f + 1], c.hip[3 * f + 2]); BONES.forEach((nm, j) => B[nm].quaternion.set(...c.q.slice(4 * (f * 21 + j), 4 * (f * 21 + j) + 4))); rig.root.updateMatrixWorld(true); };
const pt = e => (e < 2 ? B[LIMB[e]].getWorldPosition(V()) : B[LIMB[e]].localToWorld(BALL.clone()));
const rows = [];
for (const h of H) { if (h.e >= 2 && h.base[1] < 0.15) continue; // 바닥에 선 발은 뺀다
  const f0 = Math.round(h.t0 * c.fps), f1 = Math.min(c.n - 1, Math.round(h.t1 * c.fps)), tgt = V(...h.base); let s = 0, mx = 0, n = 0; const d3 = V();
  for (let f = f0; f <= f1; f++) { pose(f); const d = pt(h.e).sub(tgt); d3.add(d); const L = d.length(); s += L; mx = Math.max(mx, L); n++; }
  d3.multiplyScalar(1 / n); rows.push({ e: h.e, t0: h.t0, t1: h.t1, y: h.base[1], mean: s / n, max: mx, off: [d3.x, d3.y, d3.z] });
}
const cm = x => (x * 100).toFixed(1);
console.log(`■ ${name}: 원본에서 닿은 자리(바닥 위) ${rows.length}곳 — 옮긴 손목(손)·발볼(발)과의 거리, 평균 어긋남 방향(옆 x / 위 y / 앞 z, cm)`);
for (const r of rows.sort((a, b) => a.t0 - b.t0)) console.log(`  ${NM[r.e]} ${r.t0.toFixed(2)}~${r.t1.toFixed(2)}초 높이 ${r.y.toFixed(2)}m · 평균 ${cm(r.mean)} / 가장 큼 ${cm(r.max)}cm · 방향 ${r.off.map(cm).join(' / ')}`);
for (const k of [[0, 1, '손'], [2, 3, '발']]) { const a = rows.filter(r => r.e === k[0] || r.e === k[1]); if (a.length) console.log(`  ${k[2]}: ${a.length}곳 · 평균 ${cm(a.reduce((s, r) => s + r.mean, 0) / a.length)}cm · 3cm 넘음 ${a.filter(r => r.mean > 0.03).length} · 10cm 넘음 ${a.filter(r => r.mean > 0.10).length} · 가장 큼 ${cm(Math.max(...a.map(r => r.max)))}cm`); }
