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
// MODE=clip: 캡처 동작(assets_local/clips.json)으로 돈다 — 영상·사용자 빌드와 같은 조건. 없으면 자작 동작(땅에서의 자세가 달라 벽에 붙는 순간의 상태가 조금 다르고, 아슬아슬한 장면은 흐름이 갈린다)
const CLIPS = process.env.MODE === 'clip' ? JSON.parse((await import('fs')).readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null;
const rig = buildCharacter(), sim = makeSim(rig, makeWorld(), CLIPS);
// PRE=n: 화면처럼 다시 시작하기 전에 n걸음을 먼저 돌린다(화면은 멈추기 전까지 실제 시간으로 돌고 있었다). 화면 도구와 node 시험의 차이를 가를 때 쓴다
for (let i = 0; i < +(process.env.PRE || 0); i++) sim.step({ mx: 0, mz: 0, cxSign: 1, cmd: [] });
sim.reset({ pos: st0 || SC.START, yaw: Math.PI }); sim.opt.wallRest = false; sim.opt.footAssist = !!assist; sim.opt.grabAssist = true; sim.opt.poseAssist = !!process.env.PA; if (process.env.POSTURE) sim.opt.posture = process.env.POSTURE;
const wp = n => rig.bones[n].getWorldPosition(new THREE.Vector3()), f2 = v => (v === undefined || v === null ? '-' : (+v).toFixed(2)), ev = [];
// LOOK=x,y,z: 겨눈 곳(마우스 조준점)을 걸음마다 넘긴다 — 화면에서는 늘 넘어온다(main.js의 look). 없으면 스크립트 장면처럼 겨눈 곳이 없다
const LOOK = process.env.LOOK ? process.env.LOOK.split(',').map(Number) : null, fwdOf = n => new THREE.Vector3(0, 0, 1).applyQuaternion(rig.bones[n].getWorldQuaternion(new THREE.Quaternion())), deg = v => (Math.asin(Math.max(-1, Math.min(1, v))) * 57.3).toFixed(0);
for (let k = 0; k < inputs.length; k++) { const x0 = inputs[k], x = LOOK ? { ...x0, look: LOOK } : x0; sim.step(dup && x.cmd.length ? { ...x, cmd: x.cmd.concat(x.cmd) } : x); for (const e of sim.climb.events) if (e.type !== 'try') ev.push(`${((k + 1) / 120).toFixed(2)} ${e.type}(${e.name || ''} ${e.why || ''})`);
  const t = (k + 1) / 120; if (t < +t0s || t > +t1s || (k + 1) % every) continue; rig.root.updateMatrixWorld(true); const K = sim.climb, hp = wp('hips'), ch = wp('chest'), hd = wp('head');
  console.log(`${t.toFixed(2)} 몸 x ${sim.body.pos.x.toFixed(2)} y ${sim.body.pos.y.toFixed(2)} 머리 x ${hd.x.toFixed(2)} y ${hd.y.toFixed(2)} · 얼굴이 보는 쪽 위로 ${deg(fwdOf('head').y)}° 가슴 ${deg(fwdOf('chest').y)}° · z: 골반 ${hp.z.toFixed(2)} 가슴 ${ch.z.toFixed(2)} 머리 ${hd.z.toFixed(2)} · 풀이 가슴 숙임 ${K.fb && K.fb.x ? f2(K.fb.x[FBI.PC]) : '-'} 골반 숙임 ${K.fb && K.fb.x ? f2(K.fb.x[FBI.PH]) : '-'} · 고개 비킴 hg ${K.hg ? f2(K.hg.x) + ',' + f2(K.hg.z) : '-'} hc ${f2(K.hc)} · 뺌 ${f2(K.wout)} 청 ${f2(K.clearNeed)} · 손 ${K.hands.map(h => h.st[0]).join('')} 발 ${K.feet.map(f => f.st[0]).join('')} jam ${K.jamStop ? 1 : 0}`); }
console.log(ev.join(' | ').slice(0, 700));
