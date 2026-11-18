// src/*.js 를 한 파일(climb_lab.html)로 묶는다. 사용: node build.js
'use strict';
const fs = require('fs'), path = require('path');
const src = n => fs.readFileSync(path.join(__dirname, 'src', n), 'utf8');
// 줄 끝 주석 뒤에 코드가 붙어 실행되지 않는 실수를 막는다(v0.5~v0.6.1 던지기 세기 오류, v0.7.1 작업 중에도 한 번 더 났다)
{ const bad = [];
  const files = [...fs.readdirSync(path.join(__dirname, 'src')).map(n => 'src/' + n), ...fs.readdirSync(path.join(__dirname, 'test')).filter(n => n.endsWith('.js')).map(n => 'test/' + n)];
  for (const n of files) fs.readFileSync(path.join(__dirname, n), 'utf8').split('\n').forEach((l, i) => {
    const m = l.match(/(^|[^:'"`])\/\/(.*)$/); if (!m) return;
    if (/(^|[;{}\s])[a-zA-Z_][\w.\[\]]*\s*(=|\+=|-=)(?!=)[^;]*;|[;{}]\s*(const|let|if|for|return)\b/.test(m[2])) bad.push(`${n}:${i + 1}: //${m[2].slice(0, 100)}`); });
  if (bad.length) { console.error('주석 뒤에 코드로 보이는 글이 있습니다(실행되지 않음):\n' + bad.join('\n')); process.exit(1); } }
// 입력 UI 그림(키캡 틀 13종, 패널)을 한 파일 빌드에 data 주소로 묻는다. 외부 파일·통신 없이 열린다
const asset = (n, type) => `data:${type};base64,` + fs.readFileSync(path.join(__dirname, 'assets', 'input', n)).toString('base64');
const SHAPES = ['square', 'short', 'tab', 'caps', 'backspace', 'enter', 'shift', 'space', 'numenter', 'numzero', 'iso', 'mouse', 'mouseSide'];
const assets = `const INPUT_ASSETS = ${JSON.stringify({ templates: Object.fromEntries(SHAPES.map(n => [n, asset(`templates/${n}.png`, 'image/png')])), panel: asset('panel.webp', 'image/webp') })};`;
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>등반 조작 실험실</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}canvas{display:block;touch-action:none;cursor:none}</style>
</head><body>
${['engine.js', 'physics.js', 'bots.js', 'bind.js', 'action-names.js', 'input-catalog.js', 'input-ui.js'].map(n => `<script>\n${src(n)}\n</script>`).join('\n')}
<script>\n${assets}\n</script>
${['controls.js', 'lessons.js', 'game.js'].map(n => `<script>\n${src(n)}\n</script>`).join('\n')}
</body></html>
`;
fs.writeFileSync(path.join(__dirname, 'climb_lab.html'), html);
console.log('climb_lab.html', html.length, 'bytes');
