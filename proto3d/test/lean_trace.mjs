// 윗몸·고개가 얼마나 뒤로 젖혀지는가(골반·가슴·머리의 벽에서의 거리, 풀이의 가슴 숙임, 고개 비킴 값)를 적는다. 스크립트 입력이며 사람 손이 아니다.
// 화면 도구(dense_strip·hand_video)와 같은 길로 명령을 넣는다(DUP=1: 명령이 한 걸음에 두 번 들어간다 — 화면 도구가 그렇게 넣는다). 사용: [PA=1] [DUP=1] POSTURE=fb node test/lean_trace.mjs <장면> <시작> <끝> [간격]
import { prov, provLine } from './provenance.mjs';
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import * as THREE from 'three';
console.log(provLine(prov()));
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js'), { FBI } = await imp('fbik.js'), SC = await import('./scenes_foot.mjs');
const [id, t0s, t1s, evS] = process.argv.slice(2), every = +(evS || 60), dup = !!process.env.DUP;
const list = [...SC.SCENES_FOOT.map((s, i) => ['foot' + (i + 1), ...s]), ...SC.SCENES_H.map(s => [s[0].split(' ')[0], ...s]), ...(SC.SCENES_P || []).map(s => [s[0].split(' ')[0], ...s])], sc = list.find(s => s[0] === id); if (!sc) throw new Error('장면 없음 ' + id);
const [, title, fn, assist, mode, st0] = sc, inputs = [], put = (inp = {}, cmd = []) => inputs.push({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd }), rep = (n, inp, cmd) => { for (let i = 0; i < n; i++) put(inp, i ? [] : cmd); }; fn(null, put, rep);
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), null); sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.grabAssist = true; sim.opt.poseAssist = !!process.env.PA; if (process.env.POSTURE) sim.opt.posture = process.env.POSTURE;
const wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3()), f2 = v => (v === undefined || v === null ? '-' : (+v).toFixed(2)), ev = [];
for (let k = 0; k < inputs.length; k++) { const x = inputs[k]; sim.step(dup && x.cmd.length ? { ...x, cmd: x.cmd.concat(x.cmd) } : x); for (const e of sim.climb.events) if (e.type !== 'try') ev.push(`${((k + 1) / 120).toFixed(2)} ${e.type}(${e.name || ''} ${e.why || ''})`);
  const t = (k + 1) / 120; if (t < +t0s || t > +t1s || (k + 1) % every) continue; rig.root.updateMatrixWorld(true); const K = sim.climb, hp = wp('hips'), ch = wp('chest'), hd = wp('head');
  console.log(`${t.toFixed(2)} 몸 y ${sim.body.pos.y.toFixed(2)} · z: 골반 ${hp.z.toFixed(2)} 가슴 ${ch.z.toFixed(2)} 머리 ${hd.z.toFixed(2)} · 풀이 가슴 숙임 ${K.fb && K.fb.x ? f2(K.fb.x[FBI.PC]) : '-'} 골반 숙임 ${K.fb && K.fb.x ? f2(K.fb.x[FBI.PH]) : '-'} · 고개 비킴 hg ${K.hg ? f2(K.hg.x) + ',' + f2(K.hg.z) : '-'} hc ${f2(K.hc)} · 뺌 ${f2(K.wout)} 청 ${f2(K.clearNeed)} · 손 ${K.hands.map(h => h.st[0]).join('')} 발 ${K.feet.map(f => f.st[0]).join('')} jam ${K.jamStop ? 1 : 0}`); }
console.log(ev.join(' | ').slice(0, 700));
