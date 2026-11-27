// 팔–머리 판정의 타원(src/rig.js headEll)이 마네킹의 머리 메시와 얼마나 맞는지 잰다(p3d-0.15.5, GPT의 0.15.4 검토 A1). 사용: node test/head_fit.mjs
// 마네킹의 머리 메시(Head 뼈에 0.5 넘게 묶인 꼭짓점)를 머리 뼈의 좌표로 옮겨 범위·가운데를 잰다(쉬는 자세)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; const HERE = path.dirname(fileURLToPath(import.meta.url)), THREE = await import('three');
const d = JSON.parse(fs.readFileSync(path.join(HERE, '../src/human_data.json'), 'utf8')), dec = b => { const u = Buffer.from(b, 'base64'); return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength); };
const W = []; d.bones.forEach((b, i) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(...b.t), new THREE.Quaternion(...b.q), new THREE.Vector3(...b.s)), p = d.bones.findIndex(x => x.name === b.parent); W[i] = p >= 0 ? W[p].clone().multiply(m) : m; });
const hi = d.bones.findIndex(b => b.name === 'Head'), inv = W[hi].clone().invert(), pts = [];
for (const m of d.meshes) { const qp = new Uint16Array(dec(m.pos)), si = new (m.n * 4 === Buffer.from(m.si, 'base64').length ? Uint8Array : Uint16Array)(dec(m.si)), swRaw = Buffer.from(m.sw, 'base64'), sw = swRaw.length === m.n * 4 ? new Uint8Array(dec(m.sw)) : new Float32Array(dec(m.sw)), sc = swRaw.length === m.n * 4 ? 255 : 1;
  for (let k = 0; k < m.n; k++) { let w = 0; for (let j = 0; j < 4; j++) if (si[k * 4 + j] === hi) w += sw[k * 4 + j] / sc; if (w > 0.5) pts.push(new THREE.Vector3(m.lo[0] + qp[k * 3] / 65535 * m.sz[0], m.lo[1] + qp[k * 3 + 1] / 65535 * m.sz[1], m.lo[2] + qp[k * 3 + 2] / 65535 * m.sz[2]).applyMatrix4(inv)); } }
const mn = [9, 9, 9], mx = [-9, -9, -9]; for (const p of pts) ['x', 'y', 'z'].forEach((a, i) => { mn[i] = Math.min(mn[i], p[a]); mx[i] = Math.max(mx[i], p[a]); });
const c = mn.map((v, i) => (v + mx[i]) / 2), h = mn.map((v, i) => (mx[i] - v) / 2), f = a => a.map(v => +v.toFixed(4));
console.log('머리 꼭짓점', pts.length, '· 범위(머리 뼈 기준) 최소', f(mn), '최대', f(mx), '· 가운데', f(c), '· 반폭', f(h));
// 목 아래로 내려간 꼭짓점을 뺀 두개골 부분(뼈 위쪽 y > 0.02)만
const sk = pts.filter(p => p.y > 0.03), mn2 = [9, 9, 9], mx2 = [-9, -9, -9]; for (const p of sk) ['x', 'y', 'z'].forEach((a, i) => { mn2[i] = Math.min(mn2[i], p[a]); mx2[i] = Math.max(mx2[i], p[a]); });
console.log('머리뼈 위 3cm부터', sk.length, '· 가운데', f(mn2.map((v, i) => (v + mx2[i]) / 2)), '· 반폭', f(mn2.map((v, i) => (mx2[i] - v) / 2)));
// 타원(가운데 c, 반지름 r)이 꼭짓점을 얼마나 덮는가: 겉에서 가장 멀리 나간 꼭짓점과 가장 안쪽
const cover = (c, r, name) => { let out = 0, inn = 9; for (const p of sk) { const k = Math.hypot((p.x - c[0]) / r[0], (p.y - c[1]) / r[1], (p.z - c[2]) / r[2]); out = Math.max(out, k); inn = Math.min(inn, k); } console.log(name, '가운데', f(c), '반지름', f(r), '· 가장 바깥 꼭짓점 k', out.toFixed(3), '(1 = 겉)'); };
const R = 0.115; cover([0, 0.9 * R, 0.01], [0.9 * R, 1.05 * R, R], '옛 타원'); cover([0, 0.121, -0.002], [R, R, R], '머리 공(headC)'); cover([0, 0.121, -0.002], [0.9 * R, 1.05 * R, R], '옛 반지름을 headC로');
const cov2 = (c, r, name) => { let out = 0, n = 0, far = 0; for (const p of pts) { const k = Math.hypot((p.x - c[0]) / r[0], (p.y - c[1]) / r[1], (p.z - c[2]) / r[2]); if (k > 1) { n++; far = Math.max(far, (k - 1) * Math.min(...r)); } out = Math.max(out, k); } console.log(name, f(c), f(r), '· 타원 밖의 꼭짓점', n, '/', pts.length, '· 가장 멀리', (far * 100).toFixed(1) + 'cm(작은 반지름 기준)'); };
cov2([0, 0.9 * R, 0.01], [0.9 * R, 1.05 * R, R], '옛 타원(전체 202)'); cov2([0, 0.1223, -0.0062], [0.0867, 0.138, 0.1164], '메시 범위에 맞춘 타원'); cov2([0, 0.1223, -0.0062], [0.092, 0.143, 0.121], '5mm 키운 것');
