// 한 파일 HTML로 묶는다: node build.js → climb3d.html (three.js 포함, 인터넷 없이 열림)
'use strict';
const esbuild = require('esbuild'), fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src');
// 2D판과 같은 검사: 줄 끝 주석 뒤에 코드가 이어지는 실수를 막는다
for (const f of [...fs.readdirSync(src).map(x => path.join(src, x)), ...fs.readdirSync(path.join(__dirname, 'test')).map(x => path.join(__dirname, 'test', x))].filter(f => f.endsWith('.js'))) fs.readFileSync(f, 'utf8').split('\n').forEach((ln, i) => { const m = ln.match(/^(?:[^'"`/]|'[^']*'|"[^"]*"|`[^`]*`)*?\/\/(.*)$/); if (m && (/;\s*[A-Za-z_$][\w$.]*\s*[=(]/.test(m[1]) && /\)\s*;|\}\s*$/.test(m[1]) || /[A-Za-z_$][\w$]*(\.[\w$]+)+\s*=\s*[^=]/.test(m[1]) && /;\s*\}?\s*$/.test(m[1]))) { console.error(`주석 뒤 코드로 보임: ${path.relative(__dirname, f)}:${i + 1}`); process.exit(1); } });
const out = esbuild.buildSync({ entryPoints: [path.join(src, 'main.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
const js = out.outputFiles[0].text, three = JSON.parse(fs.readFileSync(path.join(__dirname, 'node_modules/three/package.json'), 'utf8')).version;
const css = `html,body{margin:0;height:100%;overflow:hidden;background:#cfd6dc;font-family:system-ui,'Noto Sans KR',sans-serif}
#hud{position:fixed;left:10px;top:8px;background:rgba(28,35,29,.86);color:#f3ecd6;padding:7px 10px;border-radius:7px;font-size:13px;line-height:1.55;pointer-events:none;max-width:60vw}
#hud .ver{font-size:11px;color:#bbc4b2}#hud .dim{font-size:11.5px;color:#bbc4b2}
#help{position:fixed;right:10px;top:8px;background:rgba(28,35,29,.80);color:#f3ecd6;padding:7px 10px;border-radius:7px;font-size:12px;line-height:1.6;pointer-events:none}
#help .k{display:inline-block;min-width:54px;padding:0 5px;margin-right:4px;border-radius:4px;background:#e9e3cf;color:#1c231d;font-weight:700;font-size:11px;text-align:center}
#help .warn{color:#ff9c8a}
#hud .slow{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:4px;background:#ffd166;color:#1c231d;font-weight:800}#hud .real{display:inline-block;margin-top:3px;padding:1px 7px;border-radius:4px;background:#3c4a3e;color:#f3ecd6;font-size:11.5px}
#banner{display:none;position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(28,35,29,.86);color:#f3ecd6;padding:5px 14px;border-radius:7px;font-size:15px;font-weight:700;pointer-events:none}`;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>등반 3D 모션 시제품</title><style>${css}</style></head><body><script>/* three.js ${three} (MIT) 포함 */\n${js}</script></body></html>`;
fs.writeFileSync(path.join(__dirname, 'climb3d.html'), html);
console.log('climb3d.html', html.length, 'bytes · three', three);
