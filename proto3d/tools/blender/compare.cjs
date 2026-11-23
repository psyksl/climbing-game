// human_data 두 개를 값으로 견준다: 뼈(이름·부모·쉬는 자리·회전), 메시(정점 자리·법선·무게·면 순서), 동작
const [fa, fb] = process.argv.slice(2), a = require(fa), b = require(fb);
const dec = (s, T) => { const u = Buffer.from(s, 'base64'); return new T(u.buffer, u.byteOffset, u.byteLength / T.BYTES_PER_ELEMENT); };
const out = {};
const bn = x => x.map(y => y.name);
out.뼈_이름_집합_같음 = JSON.stringify([...bn(a.bones)].sort()) === JSON.stringify([...bn(b.bones)].sort());
out.뼈_순서_같음 = bn(a.bones).join() === bn(b.bones).join();
let dt = 0, dq = 0, par = 0; for (const A of a.bones) { const Bb = b.bones.find(x => x.name === A.name); if (!Bb) continue; if (A.parent !== Bb.parent) par++; for (let j = 0; j < 3; j++) dt = Math.max(dt, Math.abs(A.t[j] - Bb.t[j])); let d = 0; for (let j = 0; j < 4; j++) d += A.q[j] * Bb.q[j]; dq = Math.max(dq, 2 * Math.acos(Math.min(1, Math.abs(d))) * 180 / Math.PI); }
Object.assign(out, { 부모가_다른_뼈: par, 쉬는_자리_최대차_m: dt, 쉬는_회전_최대차_도: +dq.toFixed(5) });
// 뼈 번호가 바뀌면 무게의 뼈 번호(si)도 이름으로 옮겨 견준다
const map = a.bones.map(A => b.bones.findIndex(x => x.name === A.name));
out.메시 = a.meshes.map((A, i) => { const Bm = b.meshes.find(x => x.mat === A.mat) || b.meshes[i]; const r = { 이름: [A.name, Bm.name], 정점: [A.n, Bm.n] }; if (A.n !== Bm.n) return r;
  const P = (m) => { const q = dec(m.pos, Uint16Array), p = new Float32Array(m.n * 3); for (let k = 0; k < m.n * 3; k++) p[k] = m.lo[k % 3] + q[k] / 65535 * m.sz[k % 3]; return p; };
  const pa = P(A), pb = P(Bm); let dp = 0; for (let k = 0; k < pa.length; k++) dp = Math.max(dp, Math.abs(pa[k] - pb[k])); r.정점_자리_최대차_mm = +(dp * 1000).toFixed(3);
  const na = dec(A.nor, Int8Array), nb = dec(Bm.nor, Int8Array); let dn = 0; for (let k = 0; k < na.length; k++) dn = Math.max(dn, Math.abs(na[k] - nb[k])); r.법선_최대차_127분의 = dn;
  const sa = dec(A.si, Uint8Array), sb = dec(Bm.si, Uint8Array), wa = dec(A.sw, Uint8Array), wb = dec(Bm.sw, Uint8Array); let dw = 0;
  for (let v = 0; v < A.n; v++) { const ga = {}, gb = {}; for (let j = 0; j < 4; j++) { const ia = map[sa[v * 4 + j]]; ga[ia] = (ga[ia] || 0) + wa[v * 4 + j]; gb[sb[v * 4 + j]] = (gb[sb[v * 4 + j]] || 0) + wb[v * 4 + j]; } for (const k of new Set([...Object.keys(ga), ...Object.keys(gb)])) dw = Math.max(dw, Math.abs((ga[k] || 0) - (gb[k] || 0))); }
  r.무게_최대차_255분의 = dw; r.면_순서_같음 = A.idx === Bm.idx; return r; });
out.동작 = a.clips.map((c, i) => { const d = b.clips.find(x => x.name === c.name); return d ? `${c.name} ${c.dur}→${d.dur}` : `${c.name} 없음`; });
console.log(JSON.stringify(out, null, 1));
