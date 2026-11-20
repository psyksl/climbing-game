// 우리 게임의 벽 동작에서 관절 자리를 뽑아 pose_extract.py의 결과와 같은 꼴로 적는다(pose_metrics.py로 실제 영상과 같은 지표를 잰다).
// 스크립트 입력이며 사람 손이 아니다. 화면 기본 설정(벽 딛기 켬·발 보조 켬)으로 돈다. "화면에서 본 각도"는 등 뒤에서 벽을 정면으로 본 것으로 계산한다.
// 사용: node tools/video/game_pose.mjs <결과 json>   캡처 동작으로: MODE=clip
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as THREE from 'three';
const P3 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), imp = f => import(pathToFileURL(path.join(P3, 'src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeWorld } = await imp('world.js'), { makeSim } = await imp('sim.js');
const CLP = path.join(P3, 'assets_local/clips.json'), clips = process.env.MODE === 'clip' && fs.existsSync(CLP) ? JSON.parse(fs.readFileSync(CLP, 'utf8')) : null;
const rig = buildCharacter(), frames = []; let sim, T = 0, n = 0;
const MAP = { 11: 'upperArm.L', 12: 'upperArm.R', 13: 'foreArm.L', 14: 'foreArm.R', 15: 'hand.L', 16: 'hand.R', 23: 'upLeg.L', 24: 'upLeg.R', 25: 'leg.L', 26: 'leg.R', 27: 'foot.L', 28: 'foot.R' };
const start = pos => { sim = makeSim(rig, makeWorld(), clips); sim.opt.wallRest = true; sim.opt.footAssist = true; sim.reset({ pos, yaw: Math.PI }); sim.opt.wallRest = true; sim.opt.footAssist = true; };
function run(n1, inp = {}, cmd = null) { for (let i = 0; i < n1; i++) { sim.step({ mx: 0, mz: 0, cxSign: 1, ...inp, cmd: i === 0 && cmd ? cmd : [] }); T += 1 / 120;
  if (++n % 5 === 0 && sim.climb.on) { const img = Array.from({ length: 33 }, () => [0, 0, 0]), world = Array.from({ length: 33 }, () => [0, 0, 0]); for (const [k, b] of Object.entries(MAP)) { const p = rig.bones[b].getWorldPosition(new THREE.Vector3()); img[k] = [p.x, -p.y, 1]; world[k] = [p.x, -p.y, p.z]; } frames.push({ t: +T.toFixed(3), ok: true, img, world }); } } }
const hand = (i, p) => ({ type: 'hand', i, p }), rel = (limb, i) => ({ type: 'release', limb, i });
// ① 턱 A: 서서 두 손으로 잡고, 당겨 오르고, 좌우로 옮기고, 뛴다
start([-0.9, 0, -2.58]); run(30); run(150, {}, [hand(0, [-1.1, 1.92, -2.84])]); run(150, {}, [hand(1, [-0.7, 1.92, -2.84])]); run(120, { cy: 1 }); run(240); run(120, { cx: -1 }); run(180, { cx: 1 }); run(120); run(100, { jump: true }); run(240);
// ② 턱 B: 뛰어 잡고, 벽을 딛고, 손을 옮기고, 옆으로 가고, 뛰어 턱 D를 잡고, 발을 떼고 흔들다가 놓는다
start([0.7, 0, -2.65]); run(30); run(1, { jump: true }, [hand(0, [0.5, 2.32, -2.86]), hand(1, [0.9, 2.32, -2.86])]); run(59, { jump: true }); run(360);
run(150, {}, [hand(1, [1.12, 2.32, -2.86])]); run(150, {}, [hand(0, [0.72, 2.32, -2.86])]); run(120, { cx: 1 }); run(180);
run(18, { jump: true }); run(1, { jump: true }, [hand(1, [1.0, 2.48, -2.86])]); run(40, { jump: true }); run(300);
run(1, {}, [rel('foot', 0), rel('foot', 1)]); for (let k = 0; k < 360; k++) { const vx = sim.body.vel.x; run(1, { cx: vx > 0.003 ? 1 : vx < -0.003 ? -1 : 1 }); } run(60);
fs.writeFileSync(process.argv[2] || 'game_pose.json', JSON.stringify({ video: 'game', fps: 24, w: 1, h: 1, frames }));
console.log('장면 ' + frames.length + '장(벽에 붙어 있는 동안만) · ' + T.toFixed(1) + '초 · 기록: ' + sim.climb.log.filter(e => ['grab', 'step', 'slip', 'exit', 'push'].includes(e.type)).map(e => e.type + (e.name ? ' ' + e.name : '')).join(' → ').slice(0, 300));
