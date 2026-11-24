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
for (const k of ['PO_FAST', 'OLDPOSE', 'OLDHAND', 'NOSHOMEGA', 'NOSHOM', 'SHVIA', 'WMIN', 'NOWFLOOR', 'NOLOCK', 'FLOORIN', 'OLDSELFTOL', 'OLDHEAD', 'OLDHANDPATH', 'NOBOXFACE', 'YAWFREE', 'OLDTIE', 'OLDWRIST', 'OLDHANDFIT', 'NOANAT', 'NOREACHYIELD', 'OLDJUMPHAND', 'OLDSIDEPULL', 'OLDSMEAR', 'OLDFREEKNEE', 'OLDDETOUR', 'OLDSCAP', 'OLDSTRAIGHT', 'OLDSHOM', 'NOWRIST', 'OLDWALLFALL', 'NOASSIST', 'OLDPOLE', 'CROSSOVER', 'OLDGRIPCAP', 'OLDASSISTX', 'OLDBURST', 'OLDPALM', 'OLDFINGAV', 'OLDLEGX', 'OLDJUMPPOSE', 'OLDREACHANAT', 'NOLX_KNEE', 'NOLX_FREE', 'NOLX_PATH', 'NOLX_FLAG', 'NOLX_FB', 'LX_FREE', 'OLDCROSSKNEE', 'OLDFBKNEE', 'OLDHANDHIP', 'FREECROSS', 'OLDSMEARIDLE', 'OLDFLAGFLOOR', 'OLDHINTPERP', 'OLDPLANTV', 'JUMPARMS', 'OLDJUMPARMS', 'OLDJUMPTO', 'OLDFINGSM', 'ARMKEEP', 'OLDELBOW', 'OLDTWSPLIT', 'NOELFIXR', 'NOELFIXH', 'NOHELDSLOW', 'NOARCANAT', 'ARCANAT', 'OLDARCMIX', 'NOHELDFIXRATE', 'OLDFBSH', 'FBSH_HELD', 'OLDPHYSH', 'OLDHANDWALL', 'OLDWRISTG', 'OLDCOMF', 'OLDFITHI', 'OLDHEADHELD', 'COMFDETOUR', 'OLDSELFPREF', 'OLDELGATE', 'OLDREACHPOLE', 'OLDGRABRATE', 'NOELFIXRATE', 'OPENCAND', 'NOFINGSOFT', 'NOFINGBLEND', 'OLDTIPTOE']) if (E[k]) globalThis[k] = 1;
for (const k of ['SIDE_FACE', 'TURN_ACC', 'KNEE_R1', 'FOLD_D', 'FING_PG', 'FING_PMAX', 'AIR_ARM_W', 'FBSH_W', 'FBSH_M', 'ELGATE', 'ELPREF', 'ELFIX_M', 'ARC_ANAT']) if (E[k] !== undefined && E[k] !== '') globalThis[k] = +E[k];
if (E.YAWMODE) globalThis.YAWMODE = E.YAWMODE;
if (E.POSTURE && !E.VARIANT) E.VARIANT = E.POSTURE;
export const POSTURE = E.VARIANT || '';
const hashDir = d => { const h = crypto.createHash('sha256'); for (const f of fs.readdirSync(d).filter(f => /\.(js|json|mjs)$/.test(f)).sort()) { h.update(f); h.update(fs.readFileSync(path.join(d, f))); } return h.digest('hex').slice(0, 16); };
export function prov(extra = {}) {
  const build = extra.build && fs.existsSync(extra.build) ? crypto.createHash('sha256').update(fs.readFileSync(extra.build)).digest('hex').slice(0, 16) : null;
  return { 소스: path.relative(path.resolve(HERE, '..'), SRC) || SRC, 소스_해시: hashDir(SRC), 빌드: extra.build ? path.basename(extra.build) : null, 빌드_해시: build,
    몸: E.BODY === 'old' ? 'old' : 'human', 자세: POSTURE || 'rule(기본)', 손목_자리: globalThis.GRIP_FRAME && !globalThis.OLDGRIP ? 'frame' : 'old(기본)', 동작: E.MODE === 'clip' ? '캡처' : '자작',
    스위치: Object.fromEntries(['PO_FAST', 'SIDE_FACE', 'TURN_ACC', 'KNEE_R1', 'OLDPOSE', 'YAWMODE', 'NOSHOMEGA', 'NOSHOM', 'SHVIA', 'WMIN', 'NOWFLOOR', 'NOLOCK', 'FLOORIN', 'OLDSELFTOL', 'OLDHEAD', 'OLDHANDPATH', 'NOBOXFACE', 'YAWFREE', 'OLDTIE', 'OLDWRIST', 'OLDHANDFIT', 'NOANAT', 'NOREACHYIELD', 'OLDJUMPHAND', 'OLDSIDEPULL', 'OLDSMEAR', 'OLDFREEKNEE', 'OLDDETOUR', 'OLDSCAP', 'OLDSTRAIGHT', 'OLDSHOM', 'NOWRIST', 'OLDWALLFALL', 'NOASSIST', 'OLDPOLE', 'CROSSOVER', 'OLDGRIPCAP', 'OLDASSISTX', 'OLDBURST', 'OLDPALM', 'OLDFINGAV', 'OLDLEGX', 'OLDJUMPPOSE', 'OLDREACHANAT', 'NOLX_KNEE', 'NOLX_FREE', 'NOLX_PATH', 'NOLX_FLAG', 'NOLX_FB', 'LX_FREE', 'OLDCROSSKNEE', 'OLDFBKNEE', 'OLDHANDHIP', 'FREECROSS', 'OLDSMEARIDLE', 'OLDFLAGFLOOR', 'OLDHINTPERP', 'OLDPLANTV', 'JUMPARMS', 'OLDJUMPARMS', 'OLDJUMPTO', 'OLDFINGSM', 'ARMKEEP', 'OLDELBOW', 'OLDTWSPLIT', 'NOELFIXR', 'NOELFIXH', 'NOHELDSLOW', 'NOARCANAT', 'ARCANAT', 'OLDARCMIX', 'NOHELDFIXRATE', 'OLDFBSH', 'FBSH_HELD', 'OLDPHYSH', 'OLDHANDWALL', 'OLDWRISTG', 'OLDCOMF', 'OLDFITHI', 'OLDHEADHELD', 'COMFDETOUR', 'OLDSELFPREF', 'OLDELGATE', 'OLDREACHPOLE', 'OLDGRABRATE', 'NOELFIXRATE', 'OPENCAND', 'NOFINGSOFT', 'NOFINGBLEND', 'OLDTIPTOE'].filter(k => globalThis[k] !== undefined).map(k => [k, globalThis[k]])),
    명령: 'node ' + process.argv.slice(1).map(a => path.relative(process.cwd(), a) || a).join(' '), 시각: new Date().toISOString(), ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'build')) };
}
export const provLine = p => `[실행 출처] 소스 ${p.소스_해시} · 몸 ${p.몸} · 자세 ${p.자세} · 손목 자리 ${p.손목_자리} · 동작 ${p.동작}${Object.keys(p.스위치).length ? ' · ' + JSON.stringify(p.스위치) : ''}`;
