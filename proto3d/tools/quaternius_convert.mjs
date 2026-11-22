// Quaternius Universal Animation Library 2(Standard, CC0 1.0)의 GLB → 게임이 읽는 작은 JSON(src/human_data.json).
// 사람형 몸(남성 마네킹 메시 + 65개 뼈의 쉬는 자세)과 고른 동작 몇 개만 옮긴다. 원본 GLB는 저장소에 넣지 않는다(크기). 원본 해시·출처는 README에 적는다.
// 사용: node tools/quaternius_convert.mjs <UAL2_Standard.glb> <UAL2_Standard_RM.glb> [출력 JSON]
// 메시: 위치는 16비트로(상자 기준 0.03mm 단위), 법선은 8비트, 뼈 무게는 8비트로 줄인다. 동작: 뼈마다 회전(쿼터니언)을 30장/초로, 골반·뿌리의 위치를 함께 적는다.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [fStd, fRM, outF = path.join(HERE, '../src/human_data.json')] = process.argv.slice(2);
if (!fStd || !fRM) { console.log('사용: node tools/quaternius_convert.mjs <UAL2_Standard.glb> <UAL2_Standard_RM.glb> [출력]'); process.exit(1); }
const load = async f => { const b = fs.readFileSync(f); return new Promise((res, rej) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
const sha = f => (await_crypto()).createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function await_crypto() { return globalThis.__crypto; }
globalThis.__crypto = await import('crypto');
const G = await load(fStd), GR = await load(fRM);
G.scene.updateMatrixWorld(true);
const meshes = []; G.scene.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
const sk = meshes[0].skeleton, bones = sk.bones, names = bones.map(b => b.name);
for (const m of meshes) if (m.skeleton.bones.map(b => b.name).join() !== names.join()) throw new Error('메시마다 뼈 순서가 다르다');
// 뼈: 부모 이름과 쉬는 자세(부모 기준). 뿌리(root)의 부모(Armature 등)의 변환은 root에 합쳐 둔다(세계 = y 위, 앞 = +z)
const r6 = v => +v.toFixed(6);
const B = bones.map(b => { const isTop = !names.includes(b.parent?.name); let t = b.position.clone(), q = b.quaternion.clone(), s = b.scale.clone();
  if (isTop) { const m = b.matrixWorld.clone(); m.decompose(t, q, s); }
  return { name: b.name, parent: isTop ? null : b.parent.name, t: t.toArray().map(r6), q: q.toArray().map(r6), s: s.toArray().map(v => +v.toFixed(5)) }; });
const b64 = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const M = meshes.map(m => { const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = P.count;
  // 메시의 세계 변환(대개 단위)을 위치·법선에 합친다 — 뼈의 bind 역행렬도 같은 틀이어야 한다
  const mw = m.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(mw), v = new THREE.Vector3();
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); for (let k = 0; k < n; k++) { v.fromBufferAttribute(P, k).applyMatrix4(mw); pos.set(v.toArray(), k * 3); v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize(); nor.set(v.toArray(), k * 3); }
  const bb = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(pos, 3)), lo = bb.min.toArray(), sz = bb.max.clone().sub(bb.min).toArray();
  const qp = new Uint16Array(n * 3), qn = new Int8Array(n * 3), si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
  for (let k = 0; k < n * 3; k++) { qp[k] = Math.round((pos[k] - lo[k % 3]) / sz[k % 3] * 65535); qn[k] = Math.round(nor[k] * 127); }
  // 8비트로 줄일 때 남는 몫은 가장 큰 무게에 더한다(p3d-0.10.1). 0.10.0은 넷째 칸에 넣었는데, 무게가 0인 넷째 칸의 뼈 번호 0 = root라 정점이 원점 쪽으로 최대 1cm쯤 끌려갔다
  for (let k = 0; k < n; k++) { const w = [0, 1, 2, 3].map(j => SW.getComponent(k, j)), tot = w.reduce((a, c) => a + c, 0) || 1, q = w.map(x => Math.round(x / tot * 255)), big = w.indexOf(Math.max(...w));
    q[big] += 255 - q.reduce((a, c) => a + c, 0);
    for (let j = 0; j < 4; j++) { si[k * 4 + j] = SI.getComponent(k, j); sw[k * 4 + j] = q[j]; } }
  const idx = g.index ? (n > 65535 ? new Uint32Array(g.index.array) : new Uint16Array(g.index.array)) : null;
  // bind 역행렬: 메시의 세계 변환을 합친 위치에 맞춘다(bind = 뼈의 세계 행렬 × 메시의 세계 변환의 역 → 합친 뒤에는 뼈의 세계 행렬의 역)
  return { name: m.name, mat: [].concat(m.material)[0].name, color: '#' + [].concat(m.material)[0].color.getHexString(), n, lo, sz, pos: b64(qp), nor: b64(qn), si: b64(si), sw: b64(sw), idx: idx ? b64(idx) : null, idx32: !!(idx && idx instanceof Uint32Array) };
});
// 쉬는 자세가 bind 자세와 같은지(GLB의 노드 자세 = bind 자세인지) 확인한다: 각 뼈의 세계 행렬 × bind 역행렬 = 메시의 세계 행렬이어야 한다
{ let worst = 0; const mw = meshes[0].matrixWorld; bones.forEach((b, i) => { const m = b.matrixWorld.clone().multiply(sk.boneInverses[i]); for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs(m.elements[k] - mw.elements[k])); }); console.log('쉬는 자세 = bind 자세 확인: 가장 큰 차이', worst.toExponential(2)); if (worst > 1e-3) throw new Error('쉬는 자세가 bind 자세와 다르다 — bind 역행렬을 따로 옮겨야 한다'); }
// 동작: 고른 것만. 뼈마다 회전을 30장/초로 다시 뽑는다(원본 키 시각이 뼈마다 같다고 기대하지 않는다)
const PICK = ['ClimbUp_1m', 'NinjaJump_Start', 'NinjaJump_Idle_Loop', 'NinjaJump_Land', 'A_TPose'], PICK_RM = ['ClimbUp_1m'];
function bake(gl, name) { const clip = gl.animations.find(a => a.name === name); if (!clip) throw new Error('동작 없음: ' + name);
  const root = gl.scene, mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(clip); act.play(); const fps = 30, nf = Math.round(clip.duration * fps) + 1;
  const bl = []; root.traverse(o => { if (o.isBone) bl.push(o); }); const order = names.map(n => bl.find(b => b.name === n));
  const rot = new Int16Array(nf * order.length * 4), pos = { pelvis: [], root: [] };
  for (let f = 0; f < nf; f++) { mixer.setTime(Math.min(clip.duration, f / fps)); root.updateMatrixWorld(true);
    order.forEach((b, i) => { const q = b.quaternion; [q.x, q.y, q.z, q.w].forEach((c, j) => { rot[(f * order.length + i) * 4 + j] = Math.round(c * 32767); }); });
    for (const k of ['pelvis', 'root']) { const b = order[names.indexOf(k)]; pos[k].push(...b.position.toArray().map(v => +v.toFixed(4))); } }
  return { name, dur: +clip.duration.toFixed(4), fps, nf, rot: b64(rot), pos };
}
const clips = [...PICK.map(n => bake(G, n)), ...PICK_RM.map(n => ({ ...bake(GR, n), name: n + '_RM' }))];
const out = { source: { pack: 'Quaternius Universal Animation Library 2 (Standard)', license: 'CC0 1.0 Universal', url: 'https://quaternius.itch.io/universal-animation-library-2', files: { 'UAL2_Standard.glb': sha(fStd), 'UAL2_Standard_RM.glb': sha(fRM) }, note: '남성 마네킹(Mannequin) 메시와 뼈대, 동작 6개만 옮김' }, bones: B, meshes: M, clips };
fs.writeFileSync(outF, JSON.stringify(out));
console.log(outF, (fs.statSync(outF).size / 1024).toFixed(0) + 'KB', '뼈', B.length, '메시', M.map(m => `${m.name}(${m.mat} ${m.color}) 정점 ${m.n}`).join(', '), '동작', clips.map(c => `${c.name} ${c.dur}s ${c.nf}장`).join(', '));
