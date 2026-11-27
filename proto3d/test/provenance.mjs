// 실행 출처(p3d-0.10.3, GPT의 0.10.2 검토 "결과의 설정을 분리" — 0.10.2 보고에 frame 설정일 때 만든 결과를 기본으로 적은 것이 있었다).
// ① 환경 변수로 설정 스위치를 켠다(소스를 불러오기 전에 — CL 값 일부가 불러올 때 globalThis를 읽는다). 시험 도구는 이 파일을 **맨 먼저** 불러온다.
//   GRIP=frame|old · POSTURE=rule|base|solve(=VARIANT) · PO_FAST=1 · SIDE_FACE=수 · TURN_ACC=수 · KNEE_R1=수 · OLDPOSE=1 · BODY=old · MODE=clip · YAWMODE=…
// ② prov(extra) = 결과에 붙일 기록: 소스 해시(src 전체), 빌드 해시(있으면), 설정, 명령, 시각
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), SRC = process.env.SRC ? path.resolve(process.env.SRC) : path.resolve(HERE, '../src');
const E = process.env;
if (E.GRIP === 'frame') globalThis.GRIP_FRAME = 1;
if (E.GRIP === 'old') globalThis.OLDGRIP = 1;
// 읽는 목록과 기록하는 목록은 하나다(p3d-0.15.4, GPT의 0.15.3 검토 M3: 0.12.0부터 새로 넣은 스위치 63개가 읽기만 하고 결과에는 적히지 않았다)
export const SW_BOOL = ['OLDPLANCACHE', 'OLDPLANAIM', 'PLAN_NOFAST', 'PLANREACH', 'NOPLANREACH', 'PLAN_FULL', 'PO_FAST', 'OLDPOSE', 'OLDHAND', 'NOSHOMEGA', 'NOSHOM', 'SHVIA', 'WMIN', 'NOWFLOOR', 'NOLOCK', 'FLOORIN', 'OLDSELFTOL', 'OLDHEAD', 'OLDHANDPATH', 'NOBOXFACE', 'YAWFREE', 'OLDTIE', 'OLDWRIST', 'OLDHANDFIT', 'NOANAT', 'NOREACHYIELD', 'OLDJUMPHAND', 'OLDSIDEPULL', 'OLDSMEAR', 'OLDFREEKNEE', 'OLDDETOUR', 'OLDSCAP', 'OLDSTRAIGHT', 'OLDSHOM', 'NOWRIST', 'OLDWALLFALL', 'NOASSIST', 'OLDPOLE', 'CROSSOVER', 'OLDGRIPCAP', 'OLDASSISTX', 'OLDBURST', 'OLDPALM', 'OLDFINGAV', 'OLDLEGX', 'OLDJUMPPOSE', 'OLDREACHANAT', 'NOLX_KNEE', 'NOLX_FREE', 'NOLX_PATH', 'NOLX_FLAG', 'NOLX_FB', 'LX_FREE', 'OLDCROSSKNEE', 'OLDFBKNEE', 'OLDHANDHIP', 'FREECROSS', 'OLDSMEARIDLE', 'OLDFLAGFLOOR', 'OLDHINTPERP', 'OLDPLANTV', 'JUMPARMS', 'OLDJUMPARMS', 'OLDJUMPTO', 'OLDFINGSM', 'ARMKEEP', 'OLDELBOW', 'OLDTWSPLIT', 'NOELFIXR', 'NOELFIXH', 'NOHELDSLOW', 'NOARCANAT', 'ARCANAT', 'OLDARCMIX', 'NOHELDFIXRATE', 'OLDFBSH', 'FBSH_HELD', 'OLDPHYSH', 'OLDHANDWALL', 'OLDWRISTG', 'OLDCOMF', 'OLDFITHI', 'OLDHEADHELD', 'COMFDETOUR', 'OLDSELFPREF', 'OLDELGATE', 'OLDREACHPOLE', 'OLDWANTWP', 'OLDPOLESELF', 'OLDARCWP', 'OLDRETFLOOR', 'OLDRETLIM', 'RET_FLOOR', 'REACHPOLERULE', 'OLDGRABRATE', 'NOELFIXRATE', 'OPENCAND', 'NOFINGSOFT', 'NOFINGBLEND', 'OLDTIPTOE', 'OLDRISE', 'RISE_SIDE', 'OLDGRIPLAT', 'OLDROCK', 'OLDBRAKE', 'NOPOSEASSIST', 'OLDFEETGATHER', 'POSEASSIST', 'OLDELBACK', 'OLDFOLDSTOP', 'OLDLOOKUP', 'OLDCLEARLAT', 'OLDSMEARLEAD', 'OLDAIMBODY', 'OLDLOOKYIELD', 'NOAIMSNAP', 'OLDAIMSIDE', 'NOCULL', 'NOPRESS', 'OLDOVEROUT', 'OLDAIMON', 'OLDPROBE', 'OLDPROBE6', 'OLDKNEEBOX', 'OLDHELDTERR', 'OLDLEFTPAD', 'OLDMATCHREL', 'NOKEEPHOLD', 'NOLINKPOSE', 'LINKPOSE', 'PRESSON', 'NOFOLDROOM', 'NOFOLDALL', 'NOLINKSOLVE', 'NOLOWSIDE', 'NOUSERFOOT', 'DBGUP', 'OLDOUTSUM', 'OLDWSINK', 'OLDPREJAM', 'OLDARMLINE', 'NOARMREACH', 'NOARMBACK', 'NOAUTOBODY', 'NOFLOORROOM', 'NOHELDCLR', 'FLOORROOM', 'NOFLOORCONE', 'NOFLOORDEPTH', 'FLOORCONE1', 'HELD_REACHONLY', 'HELD_REACHTRIG', 'OLDHEADE'];
export const SW_NUM = ['PLAN_BUD', 'PLAN_BUD_CMD', 'PLAN_WAIT_MAX', 'PLAN_LOSE', 'HEADE_K', 'PLAN_T2', 'SIDE_FACE', 'TURN_ACC', 'KNEE_R1', 'FOLD_D', 'FOLD_GAP', 'FOLD_HANG', 'FOLD_SOLVE', 'FOLD_HI', 'FOLD_KEEP', 'FOLD_FRONT', 'HELD_DB', 'LOOK_EL', 'CLEAR_LAT', 'AIM_YAW', 'FING_PG', 'FING_PMAX', 'AIR_ARM_W', 'FBSH_W', 'FBSH_M', 'ELGATE', 'ELPREF', 'ELFIX_M', 'ARC_ANAT', 'RISE_V', 'HELD_M', 'HELD_PAD', 'HELDCLR_W', 'HELDHEAD_W', 'HELD_JAM', 'FLOORCONE'];
for (const k of SW_BOOL) if (E[k]) globalThis[k] = 1;
for (const k of SW_NUM) if (E[k] !== undefined && E[k] !== '') globalThis[k] = +E[k];
if (E.YAWMODE) globalThis.YAWMODE = E.YAWMODE;
if (E.POSTURE && !E.VARIANT) E.VARIANT = E.POSTURE;
export const POSTURE = E.VARIANT || '';
const hashDir = d => { const h = crypto.createHash('sha256'); for (const f of fs.readdirSync(d).filter(f => /\.(js|json|mjs)$/.test(f)).sort()) { h.update(f); h.update(fs.readFileSync(path.join(d, f))); } return h.digest('hex').slice(0, 16); };
export function prov(extra = {}) {
  const build = extra.build && fs.existsSync(extra.build) ? crypto.createHash('sha256').update(fs.readFileSync(extra.build)).digest('hex').slice(0, 16) : null;
  return { 소스: path.relative(path.resolve(HERE, '..'), SRC) || SRC, 소스_해시: hashDir(SRC), 빌드: extra.build ? path.basename(extra.build) : null, 빌드_해시: build,
    몸: E.BODY === 'old' ? 'old' : 'human', 자세: POSTURE || 'rule(기본)', 손목_자리: globalThis.GRIP_FRAME && !globalThis.OLDGRIP ? 'frame' : 'old(기본)', 동작: E.MODE === 'clip' ? '캡처' : '자작',
    스위치: Object.fromEntries([...SW_BOOL, ...SW_NUM, 'YAWMODE'].filter(k => globalThis[k] !== undefined).map(k => [k, globalThis[k]])),
    명령: 'node ' + process.argv.slice(1).map(a => path.relative(process.cwd(), a) || a).join(' '), 시각: new Date().toISOString(), ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'build')) };
}
// 실제 적용된 설정(p3d-0.15.4): 시험이 넘긴 값이 아니라 계산이 읽는 sim.opt와, 그 설정이 실제로 켜는 것(누르기는 전신 연결에 포함된다)을 적는다
export const provOpt = sim => { const o = sim.opt || {}, on = k => !!o[k], e = sim.effect ? sim.effect() : {}, post = o.posture || e.posture || POSTURE || 'rule', fb = post === 'fb';
  return { 자세_방식: post, 자세_보조: !!e.poseAssist && fb, 잡기_보정: on('grabAssist'), 발_보조: on('footAssist'), 쉬운_조작: e.easy !== undefined ? !!e.easy : on('easy'), 자동_몸_맞추기: e.autoBody !== undefined ? !!e.autoBody : on('autoBody'), 지지_손_유지: on('keepHold'), 벽_딛기: on('wallRest'), 누르기_설정: !!e.pressSet, 전신_연결_설정: on('linkPose') || !!globalThis.LINKPOSE, 누르기_실제: !!e.press && fb, 전신_연결_실제: !!e.link && fb, 뻗기_전_검사: !!e.plan && fb }; };
export const provOptLine = sim => { const p = provOpt(sim), b = v => (v ? '켬' : '끔'); return `[실제 설정] 자세 ${p.자세_방식} · 자세 보조 ${b(p.자세_보조)} · 잡기 보정 ${b(p.잡기_보정)} · 발 보조 ${b(p.발_보조)} · 쉬운 조작 ${b(p.쉬운_조작)} · 자동 몸 맞추기 ${b(p.자동_몸_맞추기)} · 지지 손 유지 ${b(p.지지_손_유지)} · 누르기 ${b(p.누르기_실제)}${p.누르기_실제 && !p.누르기_설정 ? '(전신 연결에 포함)' : ''} · 전신 연결 ${b(p.전신_연결_실제)} · 뻗기 전 검사 ${b(p.뻗기_전_검사)}`; };
export const provLine = p => `[실행 출처] 소스 ${p.소스_해시} · 몸 ${p.몸} · 자세 ${p.자세} · 손목 자리 ${p.손목_자리} · 동작 ${p.동작}${Object.keys(p.스위치).length ? ' · ' + JSON.stringify(p.스위치) : ''}`;
