// 장면 h1(왼손이 턱 A를 잡고 있다) 동안 마네킹 왼손·손가락 정점의 세계 자리를 0.25초마다 적는다
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const R = process.cwd(), imp = f => import(pathToFileURL(path.join(R, f)).href);
const THREE = await import(pathToFileURL(path.join(R, 'node_modules/three/build/three.module.js')).href);
const { buildCharacter } = await imp('src/rig.js'), { makeWorld } = await imp('src/world.js'), { makeSim } = await imp('src/sim.js'), { buildHuman, makeRetarget } = await imp('src/human.js'), SC = await imp('test/scenes_foot.mjs');
const sc = SC.SCENES_H[0], rig = buildCharacter(), H = buildHuman(), RT = makeRetarget(rig, H), world = makeWorld(), sim = makeSim(rig, world, null); sim.reset({ pos: sc[4] || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.posture = 'fb';
const inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; sc[1](sim, put, rep);
const re = /^(hand|index|middle|ring|pinky|thumb|lowerarm)\w*_l$/, out = [];
const vb = H.meshes.map(m => { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, o = []; for (let k = 0; k < si.count; k++) { let b = 0, w = -1; for (let j = 0; j < 4; j++) if (sw.getComponent(k, j) > w) { w = sw.getComponent(k, j); b = si.getComponent(k, j); } o.push(H.list[b].name); } return o; });
for (let k = 0; k < inputs.length; k++) { sim.step(inputs[k]); if (k % 30) continue; RT.apply(sim.fing, sim.pron, sim.climb, world, sim.gw); H.root.updateMatrixWorld(true); const v = new THREE.Vector3(), fr = [];
  H.meshes.forEach((m, mi) => { m.updateMatrixWorld(true); for (let j = 0; j < m.geometry.attributes.position.count; j++) if (re.test(vb[mi][j])) { m.getVertexPosition(j, v).applyMatrix4(m.matrixWorld); fr.push(+v.x.toFixed(5), +v.y.toFixed(5), +v.z.toFixed(5)); } }); out.push(fr); }
fs.writeFileSync(process.argv[2], JSON.stringify(out)); console.log('frames', out.length, 'verts', out[0].length / 3);
