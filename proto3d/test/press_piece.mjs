// 누르기 시험 조각(p3d-0.15.3, GPT의 0.15.2 검토 작업 D): 혼자 선 대(윗면 1.55m)에서 턱 잡기 → 발판을 디디고 올라서기 → 어깨가 손 위로(누르기) → 윗면에 발 올리기 → 윗면에 서기.
// **스크립트 입력이다(사람 손 아님).** 명령을 계산에 바로 넣어 단계마다 무엇이 되고 어디서 막히는지 적는다. 지형은 src/world.js의 '누르기 대'(기존 벽·코스는 그대로).
// 단계마다: 결과, 몸 높이, 어깨가 손보다 높은 정도(가장 낮은 어깨 − 가장 높은 손), 팔의 상태(당김/누름·힘), 접촉, 사건. 끝에 요약.
// 사용: [MODE=clip] [LINK=1(전신 연결 켬)] [PRESS=0] [FOOT=0(발 보조 끔 — 기본 끔: 직접 넣는 발만)] [RECIN=파일.json(다시 틀 입력)] node test/press_piece.mjs
import { prov, provLine } from './provenance.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), imp = f => import(pathToFileURL(path.join(HERE, '../src', f)).href);
const { buildCharacter } = await imp('rig.js'), { makeGym } = await imp('world.js'), { makeSim } = await imp('sim.js'), { CL } = await imp('climb.js'), THREE = await import('three');
const E = process.env, CLIPS = E.MODE === 'clip' ? JSON.parse(fs.readFileSync(path.join(HERE, '../assets_local/clips.json'), 'utf8')) : null, rig = buildCharacter(), world = makeGym(), P = world.pressPiece, box = nm => world.boxes.find(b => b.name === nm), T = box('누르기 대');
const lip = x => [x, T.max.y, T.max.z], topOf = b => b.min.clone().add(b.max).multiplyScalar(0.5).setY(b.max.y).toArray();
export const STEPS = [['hand', 0, lip(1.30), '왼손 → 대의 턱'], ['hand', 1, lip(1.70), '오른손 → 대의 턱'], ['foot', 0, topOf(box('누르기 대 발판1')), '왼발 → 발판1(0.45m)'], ['W', 1.2], ['foot', 1, topOf(box('누르기 대 발판2')), '오른발 → 발판2(0.95m)'], ['W', 1.5],
  ['foot', 0, [1.20, T.max.y, T.max.z - 0.25], '왼발 → 대의 윗면(올라서기)'], ['W', 1.5], ['rel', 0, null, '왼손 놓기'], ['rel', 1, null, '오른손 놓기'], ['W', 1.0]];
export function run(o = {}) {
  const sim = makeSim(rig, world, CLIPS); sim.reset({ pos: P.startPos, yaw: P.startYaw }); const K = sim.climb, b = sim.body, rec = [], out = [], ev = [];
  Object.assign(sim.opt, { posture: 'fb', grabAssist: true, poseAssist: true, easy: true, autoBody: true, press: o.press !== false, footAssist: !!o.footAssist, wallRest: false, linkPose: !!o.link });
  let nlog = 0, look = null; const step = (k, inp = {}, cmd = []) => { for (let i = 0; i < k; i++) { const x = { mx: 0, mz: 0, cxSign: 1, ...(look ? { look } : {}), ...inp, cmd: i ? [] : cmd }; rec.push(x); sim.step(x); for (; nlog < K.log.length; nlog++) { const e = K.log[nlog]; if (!/^(try|bump)$/.test(e.type)) ev.push(`${e.t.toFixed(2)} ${e.type} ${e.name || ''} ${e.why || ''}${e.hold ? '(' + e.hold + ')' : e.box ? '(' + e.box + ')' : ''}`); } } };
  const state = () => { const Tn = K.T, held = K.hands.filter(h => h.st === 'hold'); return { y: b.pos.y, over: Tn && held.length ? Math.min(...held.map(h => Tn.sh[h.i].y)) - Math.max(...held.map(h => h.goal.y)) : null, hands: K.hands.map(h => (h.st === 'hold' ? `${h.edge.box.name}${h.cone ? '·낮은 손' : ''}${h.pressK > 0 ? '·누름' : ''}(${(h.load || 0).toFixed(2)})` : h.st === 'reach' ? '(뻗는 중)' : '-')), feet: K.feet.map(f => (f.st === 'plant' ? `${f.box.name}(${(f.load || 0).toFixed(2)})` : f.st === 'move' ? '(가는 중)' : '-')), on: K.on, ground: !!b.onGround }; };
  step(30);
  for (const [kind, a, p, label] of STEPS) { const e0 = ev.length, y0 = b.pos.y; let res = '';
    if (kind === 'hand') { look = p; step(20); step(1, {}, [{ type: 'hand', i: a, p }]); let k = 0; for (; k < 360; k++) { step(1); const h = K.hands[a]; if (h.st === 'hold') break; if (h.st === 'free' && !h.arm && k > 30) break; } step(40); res = K.hands[a].st === 'hold' ? '잡음' : `못 잡음(${K.hands[a].why || '-'})`; }
    else if (kind === 'foot') { look = p; step(20); step(1, {}, [{ type: 'foot', i: a, p }]); let k = 0; for (; k < 300; k++) { step(1); const f = K.feet[a]; if (f.st === 'plant' && k > 5 && f.p.distanceTo(new THREE.Vector3(...p)) < 0.25) break; if (f.st !== 'move' && k > 20) break; } step(40); const f = K.feet[a]; res = f.st === 'plant' && f.p.distanceTo(new THREE.Vector3(...p)) < 0.25 ? '디딤' : `못 디딤(${f.why || '-'})`; }
    else if (kind === 'rel') { step(1, {}, [{ type: 'release', limb: 'hand', i: a }]); step(40); res = K.hands[a].st === 'free' ? '놓음' : '-'; }
    else { let why = ''; for (let k = 0; k < Math.round(a * 120); k++) { step(1, { cy: 1 }); why = K.upWhy || why; } step(40); res = `몸 ${(y0).toFixed(2)} → ${b.pos.y.toFixed(2)}m${why ? ' · 멈춘 까닭 ' + why : ''}`; }
    const s = state(); out.push({ step: kind === 'W' ? `W ${a}초` : label, res, ...s, ev: ev.slice(e0) }); }
  step(120); return { out, end: state(), rec, opts: { handMode: 1, ...sim.opt } };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) { console.log(provLine(prov()));
  const R = run({ link: E.LINK === '1', press: E.PRESS !== '0', footAssist: E.FOOT === '1' }); console.log(`누르기 시험 조각 · 전신 연결 ${E.LINK === '1' ? '켬' : '끔'} · 누르기 ${E.PRESS !== '0' ? '켬' : '끔'} · 발 보조 ${E.FOOT === '1' ? '켬' : '끔'} · ${E.MODE === 'clip' ? '캡처' : '자작'} 동작 · 스크립트 입력(사람 손 아님)`);
  for (const o of R.out) { console.log(`  ${o.step}: ${o.res} · 몸 ${o.y.toFixed(2)}m · 어깨−손 ${o.over === null ? '-' : (o.over * 100).toFixed(0) + 'cm'} · 손 ${o.hands.join(' / ')} · 발 ${o.feet.join(' / ')}${o.on ? '' : o.ground ? ' · 지상(서 있음)' : ' · 공중'}`); if (E.EV) for (const e of o.ev) console.log('      · ' + e); }
  const pressed = R.out.some(o => o.over !== null && o.over > 0.05), onTop = R.out.some(o => o.feet.some(f => f.startsWith('누르기 대('))), stood = R.end.ground && R.end.y > 1.4;
  console.log(`요약: 어깨가 손 위로 5cm 넘게 올라감 ${pressed ? '예' : '아니오'} · 윗면에 발을 디딤 ${onTop ? '예' : '아니오'} · 윗면에 섬(끝의 몸 높이 ${R.end.y.toFixed(2)}m, ${R.end.on ? '벽 문맥' : R.end.ground ? '지상' : '공중'}) ${stood ? '예' : '아니오'}`);
  if (E.RECIN) { const ver = /VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(HERE, '../src/main.js'), 'utf8'))[1]; fs.writeFileSync(E.RECIN, JSON.stringify({ version: ver, clip: E.MODE === 'clip', route: '누르기 조각', recover: false, shadow: false, opts: R.opts, startPos: P.startPos, startYaw: P.startYaw, inputs: R.rec, end: null })); } }
