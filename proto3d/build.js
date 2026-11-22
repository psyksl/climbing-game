// 한 파일 HTML로 묶는다: node build.js → climb3d.html (three.js 포함, 인터넷 없이 열림)
'use strict';
const esbuild = require('esbuild'), fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src');
// 2D판과 같은 검사: 줄 끝 주석 뒤에 코드가 이어지는 실수를 막는다(src·test·tools의 .js와 .mjs)
for (const f of ['src', 'test', 'tools'].flatMap(d => fs.readdirSync(path.join(__dirname, d)).map(x => path.join(__dirname, d, x))).filter(f => /\.m?js$/.test(f))) fs.readFileSync(f, 'utf8').split('\n').forEach((ln, i) => { const m = ln.match(/^(?:[^'"`/]|'[^']*'|"[^"]*"|`[^`]*`)*?\/\/(.*)$/); if (m && (/;\s*[A-Za-z_$][\w$.]*\s*[=(]/.test(m[1]) && /\)\s*;|\}\s*$/.test(m[1]) || /[A-Za-z_$][\w$]*(\.[\w$]+)+\s*=\s*[^=]/.test(m[1]) && /;\s*\}?\s*$/.test(m[1]))) { console.error(`주석 뒤 코드로 보임: ${path.relative(__dirname, f)}:${i + 1}`); process.exit(1); } });
// 캡처 동작 자료(assets_local/clips.json)는 저장소에 넣지 않는다(외부 자료를 옮긴 값). 있으면 climb3d_mocap.html을 따로 만든다. climb3d.html에는 넣지 않는다
const refFile = path.join(__dirname, 'assets_local', 'ref_index.json'); // 참고 자세 색인(p3d-0.10.1, tools/ref_pose.mjs — Mixamo에서 뽑은 값이라 캡처 빌드에만)
const clipFile = path.join(__dirname, 'assets_local', 'clips.json'), galFile = path.join(__dirname, 'assets_local', 'gallery.json'), hasClips = fs.existsSync(clipFile);
const bundle = withClips => esbuild.buildSync({ entryPoints: [path.join(src, 'main.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none',
  alias: { 'clip-data': withClips ? clipFile : path.join(src, 'noclips.json'), 'gallery-data': withClips && fs.existsSync(galFile) ? galFile : path.join(src, 'noclips.json'), 'ref-data': withClips && fs.existsSync(refFile) ? refFile : path.join(src, 'noclips.json') } }).outputFiles[0].text;
const js = bundle(false), three = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules/three/package.json'), 'utf8')).version;
const css = `html,body{margin:0;height:100%;overflow:hidden;background:#cfd6dc;font-family:system-ui,'Noto Sans KR',sans-serif}
#hud{position:fixed;left:10px;top:8px;background:rgba(28,35,29,.86);color:#f3ecd6;padding:7px 10px;border-radius:7px;font-size:13px;line-height:1.55;pointer-events:none;max-width:60vw}
#hud .ver{font-size:11px;color:#bbc4b2}#hud .dim{font-size:11.5px;color:#bbc4b2}
#help{position:fixed;right:10px;top:8px;background:rgba(28,35,29,.80);color:#f3ecd6;padding:7px 10px;border-radius:7px;font-size:12px;line-height:1.6;pointer-events:none}
#help .k{display:inline-block;min-width:54px;padding:0 5px;margin-right:4px;border-radius:4px;background:#e9e3cf;color:#1c231d;font-weight:700;font-size:11px;text-align:center}
#help .warn{color:#ff9c8a}#help .on{margin-top:4px}#help .off{margin-top:4px;opacity:.45}
#hud .ctx{display:inline-block;padding:0 7px;border-radius:4px;background:#f3ecd6;color:#1c231d;font-weight:800}#hud .log{margin-top:3px;font-size:11.5px;color:#dfe6d6;min-height:1.5em}#hud .log .t{color:#9fb0a0}
.tag{display:none;position:fixed;pointer-events:none;background:rgba(28,35,29,.88);color:#f3ecd6;padding:2px 7px;border-radius:5px;font-size:12px;line-height:1.5;white-space:nowrap;border-left:4px solid #bbb}.tag.L{border-left-color:#e0705c}.tag.R{border-left-color:#4f9be0}.tag.pv{border-left-color:#f3ecd6}.tag i{font-style:normal;color:#bbc4b2}
#hud .slow{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:4px;background:#ffd166;color:#1c231d;font-weight:800}#hud .real{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:4px;background:#3c4a3e;color:#f3ecd6;font-size:11.5px}
#banner{display:none;position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(28,35,29,.86);color:#f3ecd6;padding:5px 14px;border-radius:7px;font-size:15px;font-weight:700;pointer-events:none}`;
const page = js => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>등반 3D 모션 시제품</title><style>${css}</style></head><body><script>/* three.js ${three} (MIT) 포함 */\n${js}</script></body></html>`;
const html = page(js);
fs.writeFileSync(path.join(__dirname, 'climb3d.html'), html);
console.log('climb3d.html', html.length, 'bytes · three', three);
// 몸 보기(p3d-0.10.0): 사람형 몸·뼈대를 앞·옆·뒤에서 보고 기본 관절 동작과 원본 동작을 튼다
{ const bv = esbuild.buildSync({ entryPoints: [path.join(src, 'bodyview.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' }).outputFiles[0].text;
  const h3 = page(bv).replace('<title>등반 3D 모션 시제품</title>', '<title>몸 보기</title>'); fs.writeFileSync(path.join(__dirname, 'body3d.html'), h3); console.log('body3d.html', h3.length, 'bytes'); }
if (hasClips) { const h2 = page(bundle(true)); fs.writeFileSync(path.join(__dirname, 'climb3d_mocap.html'), h2); console.log('climb3d_mocap.html', h2.length, 'bytes · 캡처 동작 포함(저장소에 넣지 않음)'); }
