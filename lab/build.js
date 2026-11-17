// src/*.js 를 한 파일(climb_lab.html)로 묶는다. 사용: node build.js
'use strict';
const fs = require('fs'), path = require('path');
const src = n => fs.readFileSync(path.join(__dirname, 'src', n), 'utf8');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>등반 조작 실험실</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}canvas{display:block;touch-action:none;cursor:none}</style>
</head><body>
${['engine.js', 'physics.js', 'bots.js', 'controls.js', 'game.js'].map(n => `<script>\n${src(n)}\n</script>`).join('\n')}
</body></html>
`;
fs.writeFileSync(path.join(__dirname, 'climb_lab.html'), html);
console.log('climb_lab.html', html.length, 'bytes');
