// 버티던 손이 풀리던 표본을 입력을 조금씩 흔들어 다시 넣는다(p3d-0.15.4, GPT의 0.15.3 검토 5절 "정상 입력 하나, 누르는 길이·타이밍을 조금 달리한 입력 하나 — 정밀한 단일 타이밍 성공으로 통과시키지 않는다").
// 흔드는 것: 겨눈 자리(옆·위 ±6cm) × 보내기 전에 기다린 시간(0.08·0.25·0.5초) = 15가지. 설정 넷: 전신 연결 끔 / 0.15.3의 켬(NOHELDCLR) / 0.15.4의 켬 / 실험(바닥에서 물러나기 FLOORROOM도 켬). **스크립트 입력(사람 손 아님).**
// 사용: [MODE=clip] [OUT=결과.jsonl] node test/support_jitter.mjs
import { prov, provLine } from './provenance.mjs'; import fs from 'fs';
const { runCase } = await import('./support_trace.mjs'); console.log(provLine(prov()));
const CASES = [['green', 0, '초록 5', 1], ['green', 0, '초록 발7', 1], ['green', 0, '초록 발8', 0], ['green', 1, '초록 발8', 0], ['green', 0, '홀드 4', 0], ['yellow', 0, '노랑 3', 0]];
const VAR = []; for (const w of [10, 30, 60]) for (const [dx, dy] of [[0, 0], [0.06, 0], [-0.06, 0], [0, 0.06], [0, -0.06]]) VAR.push({ wait: w, dx, dy });
// p3d-0.15.5: 뻗기 전 검사(plan) 켬을 끔·켬에 하나씩 더하고, EASY=1이면 모든 설정을 쉬운 조작 켬(화면 기본)으로 잰다. 결과를 넷으로 나눠 적는다:
//   버티던 손 풀림 / 새 손 잡음 / 둘 다 유지 / 손을 떼지 않고 거부(뻗기 전 검사가 막음 — 닿지 않는 목표를 못 잡은 것은 실패가 아니다)
const EASY = process.env.EASY === '1';
// p3d-0.15.6: 자동 이동 보호(guard)를 더한 설정으로 바꿈 — 끔(화면 기본) / 끔 + 보호 / 전신 연결 켬 / 전신 연결 켬 + 보호 / 해 보기 후보(전신 연결 + 검사 + 보호)
const CFG = [['끔', { link: false }, {}], ['끔 + 자동 이동 보호', { link: false, guard: true }, {}], ['전신 연결 켬', { link: true }, {}], ['전신 연결 켬 + 자동 이동 보호', { link: true, guard: true }, {}], ['후보: 전신 연결 + 검사 + 보호', { link: true, plan: true, guard: true }, {}]], out = process.env.OUT ? fs.createWriteStream(process.env.OUT) : null;
for (const [course, d, hold, hand] of CASES) { const line = [];
  for (const [name, o, sw] of CFG) { for (const k of ['FLOORROOM', 'NOHELDCLR']) delete globalThis[k]; Object.assign(globalThis, sw); let lost = 0, got = 0, both = 0, den = 0, ms = 0, msN = 0;
    for (const v of VAR) { const R = runCase({ course, d, hold, hand, n: EASY ? 420 : 240, easy: EASY, ...o, ...v }), pe = R.ev.filter(e => e.type === 'plan' || e.type === 'guard'), dn = pe.some(e => /뻗지 않음|그만둠/.test(e.why)); if (R.lost) lost++; if (R.got) got++; if (R.got && !R.lost) both++; if (dn) den++; if (out) out.write(JSON.stringify({ course, d, hold, hand, cfg: name, ...v, easy: EASY, got: R.got, lost: R.lost, denied: dn, plan: pe.map(e => e.why), pr: R.pr, rel: R.ev.filter(e => e.type === 'release' || e.type === 'slip').map(e => `${e.name} ${e.why}`), why: (R.ev.find(e => e.type === 'slip') || {}).why || '' }) + '\n'); }
    line.push(`${name}: 버티던 손 풀림 ${lost}/${VAR.length} · 새 손 잡음 ${got} · 둘 다 ${both} · 떼지 않고 거부 ${den}`); }
  console.log(`${course} d${d} ${hold} ${hand ? '오른손' : '왼손'}${EASY ? ' (쉬운 조작 켬)' : ''}\n    ` + line.join('\n    ')); }
