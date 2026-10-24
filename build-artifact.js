// 由 index.html 產生線上發佈用的 artifact.html（去掉 doctype/html/head/body 外殼）
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const out = src
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '')
  .replace(/<meta charset="utf-8">\s*/i, '');
fs.writeFileSync(path.join(__dirname, 'artifact.html'), out);
console.log('artifact.html 已產生');
