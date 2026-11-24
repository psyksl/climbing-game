// 옮긴 동작 점검: ① 원본에서 멈춘 손발(닿음 후보)이 옮긴 뒤 얼마나 미끄러지는가 ② 사람 관절 범위(anat.js)를 넘는 장면
const R = new URL('../../', import.meta.url).pathname;
const THREE = await import(R + 'node_modules/three/build/three.module.js');
const fs = await import('fs'), { buildCharacter, DIM } = await import(R + 'src/rig.js'), AN = await import(R + 'src/anat.js');
const [gal] = process.argv.slice(2), G = JSON.parse(fs.readFileSync(gal, 'utf8')), V = () => new THREE.Vector3(), deg = 180 / Math.PI;
const rig = buildCharacter(), B = rig.bones, PALM = new THREE.Vector3(0, -0.08, 0), BALL = new THREE.Vector3(0, -(DIM.ankleY - 0.02), DIM.ballZ);
const vA = v => [v.x, v.y, v.z], qA = q => [q.x, q.y, q.z, q.w];
for (const [name, c] of Object.entries(G.clips)) {
  const eff = [[], [], [], []], ex = { sho: [], tw: [], leg: [], knee: [] };
  for (let f = 0; f < c.n; f++) {
    B.hips.position.set(c.hip[3*f], c.hip[3*f+1], c.hip[3*f+2]); G.bones.forEach((nm, j) => B[nm].quaternion.set(...c.q.slice(4*(f*21+j), 4*(f*21+j)+4))); rig.root.updateMatrixWorld(true);
    eff[0].push(B['hand.L'].localToWorld(PALM.clone())); eff[1].push(B['hand.R'].localToWorld(PALM.clone())); eff[2].push(B['foot.L'].localToWorld(BALL.clone())); eff[3].push(B['foot.R'].localToWorld(BALL.clone()));
    const qC = B.chest.getWorldQuaternion(new THREE.Quaternion()), qH = B.hips.getWorldQuaternion(new THREE.Quaternion()), P = n => B[n].getWorldPosition(V());
    for (const [s, sx] of [['L', 1], ['R', -1]]) {
      ex.sho.push(AN.shoulderExcess(qA(qC), vA(P(`upperArm.${s}`)), vA(P(`foreArm.${s}`)), sx) * deg);
      const tw = AN.humerusTwist(qA(qC), vA(P(`upperArm.${s}`)), vA(P(`foreArm.${s}`)), vA(P(`hand.${s}`))); if (tw !== null) ex.tw.push(tw * deg);
      ex.leg.push(AN.legExcess(qA(qH), vA(P(`upLeg.${s}`)), vA(P(`leg.${s}`)), vA(P(`foot.${s}`)), sx) * deg);
      if (AN.kneeExcess) ex.knee.push(AN.kneeExcess(qA(qH), vA(P(`upLeg.${s}`)), vA(P(`leg.${s}`)), vA(P(`foot.${s}`)), sx) * deg);
    }
  }
  // ① 원본에서 멈춘 구간(0.15초 넘게)마다 옮긴 손발의 가장 큰 벗어남
  const nm = ['왼손', '오른손', '왼발', '오른발'], slip = [];
  c.eff.forEach((str, e) => { let i = 0; while (i < c.n) { if (str[i] === '1') { let j = i; while (j < c.n && str[j] === '1') j++; if (j - i >= Math.ceil(0.15 * c.fps)) { const p0 = eff[e][i]; let m = 0; for (let k = i; k < j; k++) m = Math.max(m, eff[e][k].distanceTo(p0)); slip.push([nm[e], (i / c.fps).toFixed(2), ((j - i) / c.fps).toFixed(2), m]); } i = j; } else i++; } });
  const big = slip.filter(s => s[3] > 0.03).sort((a, b) => b[3] - a[3]);
  const cnt = (a, th) => a.filter(x => x > th).length, mx = a => a.length ? Math.max(...a) : 0;
  console.log(`■ ${name} (${c.n}장)`);
  console.log(`  ① 멈춘 손발 구간 ${slip.length}개 · 3cm 넘게 미끄러짐 ${big.length}개 · 가장 큰 ${big.length ? big.slice(0, 4).map(s => `${s[0]} ${s[1]}초(${s[2]}초 동안) ${(s[3]*100).toFixed(1)}cm`).join(' / ') : '없음'}`);
  console.log(`  ② 어깨 범위 10° 넘음 ${cnt(ex.sho, 10)}/${ex.sho.length}(최대 ${mx(ex.sho).toFixed(1)}°) · 위팔 비틀림 110° 넘음 ${cnt(ex.tw, 110)}/${ex.tw.length}(최대 ${mx(ex.tw).toFixed(0)}°) · 다리 범위 10° 넘음 ${cnt(ex.leg, 10)}/${ex.leg.length}(최대 ${mx(ex.leg).toFixed(1)}°)` + (ex.knee.length ? ` · 무릎 10° 넘음 ${cnt(ex.knee, 10)}(최대 ${mx(ex.knee).toFixed(1)}°)` : ''));
}
