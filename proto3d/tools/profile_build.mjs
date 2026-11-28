// 한 파일 시험 빌드(p3d-0.15.7): 빌드 HTML에 설정을 적어 넣은 사본을 만든다(P3D_PROFILE — main.js가 주소의 ? 뒤처럼 읽는다. 주소에 적은 값이 그보다 먼저다).
// 0.15.6의 "해 보기" 파일은 기본 빌드를 주소만 바꿔 여는 작은 파일이라 기본 빌드가 같은 폴더에 있어야 했고, 설정이 저장되어 섞일 수 있었다. 이 사본은 혼자 열린다.
// 사용: node tools/profile_build.mjs <빌드.html> <출력.html> "<link=1&plan=1&guard=1&foot=0>" "<창 제목에 붙일 글>"
import fs from 'fs';
const [src, out, prof, label] = process.argv.slice(2); if (!src || !out || !prof) { console.error('사용: node tools/profile_build.mjs 빌드.html 출력.html "link=1&plan=1&guard=1&foot=0" "글"'); process.exit(1); }
if (!/^[a-z0-9=&_,A-Z.]+$/.test(prof)) { console.error('설정 글에는 영문·숫자·=·&만 쓴다'); process.exit(1); }
let h = fs.readFileSync(src, 'utf8'); const i = h.indexOf('<script'); if (i < 0) throw new Error('script 없음');
h = h.slice(0, i) + `<script>globalThis.P3D_PROFILE=${JSON.stringify(prof)};</script>\n` + h.slice(i);
if (label) h = h.replace(/<title>([^<]*)<\/title>/, (m, t) => `<title>${t} · ${label}</title>`);
fs.writeFileSync(out, h); console.log(out, h.length, '바이트 · 설정', prof);
