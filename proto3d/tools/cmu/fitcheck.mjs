// 옮긴 동작의 맞음: 뼈 방향 각도 차(우리 뼈 ↔ CMU 뼈), 손목–어깨·발목–고관절 벡터의 차(우리 길이로 맞춘 원본과)
const THREE = await import(new URL('../../node_modules/three/build/three.module.js', import.meta.url).pathname);
import fs from 'fs';
const R = new URL('../../', import.meta.url).pathname;
const { loadAsf, loadAmc, fk } = await import(R + 'tools/cmu_convert.mjs'), { buildCharacter, DIM } = await import(R + 'src/rig.js'), { setWorldQuat } = await import(R + 'src/ik.js');
const [gal, name, asf, amc, t0] = process.argv.slice(2), G = JSON.parse(fs.readFileSync(gal, 'utf8')), c = G.clips[name], bones = G.bones;
const S = loadAsf(asf), all = loadAmc(amc), rig = buildCharacter(), B = rig.bones, V = () => new THREE.Vector3();
const pairs = [['upperArm.L', 'foreArm.L', 'lclavicle', 'lhumerus'], ['foreArm.L', 'hand.L', 'lhumerus', 'lradius'], ['upperArm.R', 'foreArm.R', 'rclavicle', 'rhumerus'], ['foreArm.R', 'hand.R', 'rhumerus', 'rradius'],
  ['upLeg.L', 'leg.L', 'lhipjoint', 'lfemur'], ['leg.L', 'foot.L', 'lfemur', 'ltibia'], ['upLeg.R', 'leg.R', 'rhipjoint', 'rfemur'], ['leg.R', 'foot.R', 'rfemur', 'rtibia'], ['spine', 'neck', 'lowerback', 'lowerneck']];
const mx = {}, sum = {}; let N = 0;
for (let f = 0; f < c.n; f++) {
  B.hips.position.set(c.hip[3*f], c.hip[3*f+1], c.hip[3*f+2]); bones.forEach((nm, j) => B[nm].quaternion.set(c.q[4*(f*21+j)], c.q[4*(f*21+j)+1], c.q[4*(f*21+j)+2], c.q[4*(f*21+j)+3])); rig.root.updateMatrixWorld(true);
  const P = fk(S, all[Math.round((+t0 + f / c.fps) * 120)]).pos;
  for (const [a, b, ca, cb] of pairs) { const u = B[b].getWorldPosition(V()).sub(B[a].getWorldPosition(V())).normalize(), v = P[cb].clone().sub(P[ca]).normalize(), ang = u.angleTo(v) * 57.3, k = a + '→' + b;
    mx[k] = Math.max(mx[k] || 0, ang); sum[k] = (sum[k] || 0) + ang; }
  N++;
}
console.log(name, '뼈 방향 차(평균/최대 °):', Object.keys(mx).map(k => `${k} ${(sum[k]/N).toFixed(1)}/${mx[k].toFixed(1)}`).join(' · '));
