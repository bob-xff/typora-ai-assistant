#!/usr/bin/env node
/* ==========================================================================
   xff助手一号 · 兼容性自检
   --------------------------------------------------------------------------
   目标内核是 Typora 1.8.3 自带的 Electron 1.8.3 → Chromium 59（2017 年）。
   用了它不认识的新语法，界面就会「错乱」（本项目踩过：sheet 抽屉塌成 0 宽）。

   用法：  node scripts/compat-check.js
   退出码：0 = 通过；1 = 有致命项（会破坏布局）
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = path.join(ROOT, 'plugin', 'client.css');
const JS_FILES = ['plugin/client.js', 'plugin/inject.js'];

// 去掉注释但保留行号（把注释内容换成等量空格）
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const stripJsComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

// —— Chromium 59 不认识 CSS 的哪些东西 ——
const CSS_FATAL = [
  [/(?:^|[;{\s])inset\s*:/g, 'inset 简写（Chrome 87+）→ 改成 top/right/bottom/left'],
  [/(?:^|[;{\s])gap\s*:/g, 'flex/grid 的 gap（Chrome 84 / 66+）→ 用 margin，grid 用 grid-gap'],
  [/(?:^|[;{\s])(?:row|column)-gap\s*:/g, 'row-gap / column-gap 简写 → grid 改用 grid-gap'],
  [/:(?:is|where|has)\s*\(/g, ':is() / :where() / :has()（Chrome 88+）'],
  [/backdrop-filter\s*:/g, 'backdrop-filter（Chrome 76+）'],
  [/aspect-ratio\s*:/g, 'aspect-ratio（Chrome 88+）'],
  [/content-visibility\s*:/g, 'content-visibility（Chrome 85+）'],
];

// 不破坏布局，但在目标内核里是死代码，提醒一下
const CSS_WARN = [
  [/overscroll-behavior\s*:/g, 'overscroll-behavior（Chrome 63+）'],
  [/scroll-behavior\s*:/g, 'scroll-behavior（Chrome 61+）'],
  [/scrollbar-width\s*:|scrollbar-color\s*:/g, 'scrollbar-width / scrollbar-color（Chrome 121+）'],
  [/text-wrap\s*:/g, 'text-wrap（Chrome 114+）'],
  [/^\s*color-scheme\s*:/gm, 'color-scheme（Chrome 81+）→ 深色下表单控件仍会是浅色'],
  [/prefers-reduced-motion/g, 'prefers-reduced-motion 媒体查询（Chrome 74+）→ 目标内核里动效不会被关掉'],
  [/^\s*appearance\s*:/gm, '裸 appearance → 请保留 -webkit-appearance'],
];

// —— Chromium 59 的 V8 不认识哪些 JS 语法 ——
const JS_FATAL = [
  [/=>/g, '箭头函数（Chromium 45+，但本项目统一 ES5）'],
  [/\?\./g, '可选链 ?.（Chrome 80+）'],
  [/[^?]\?\?[^?]/g, '空值合并 ??（Chrome 80+）'],
  [/(?:[([{,=]|\breturn\s)\s*\.\.\.\s*[A-Za-z_$]/g, '展开 / 剩余参数 ...（Chrome 60+，本项目统一 ES5）'],
  [/\basync\s+function|\bawait\s/g, 'async / await（请改回回调写法，保持风格统一）'],
  [/\bObject\.fromEntries\b/g, 'Object.fromEntries（Chrome 73+）'],
  [/\.flat(?:Map)?\s*\(/g, 'Array.prototype.flat / flatMap（Chrome 69+）'],
  [/\bglobalThis\b/g, 'globalThis（Chrome 71+）'],
];

let fatal = 0;
let warn = 0;

function scan(label, text, rules, isFatal) {
  const lines = text.split('\n');
  return () => {
    rules.forEach(([re, why]) => {
      const hits = [];
      lines.forEach((ln, i) => {
        re.lastIndex = 0;
        if (re.test(ln)) hits.push(i + 1);
      });
      if (!hits.length) return;
      const tag = isFatal ? '  ✗ [致命]' : '  · [提醒]';
      console.log(tag + ' ' + label + ':' + hits.slice(0, 6).join(',') + (hits.length > 6 ? ' …' : '') + '  ' + why);
      if (isFatal) fatal += hits.length; else warn += hits.length;
    });
  };
}

console.log('');
console.log('  xff助手一号 · Chromium 59 兼容性自检');
console.log('  ------------------------------------------------------------');

const css = stripCssComments(fs.readFileSync(CSS, 'utf8'));
scan('client.css', css, CSS_FATAL, true)();
scan('client.css', css, CSS_WARN, false)();

JS_FILES.forEach((rel) => {
  const js = stripJsComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  scan(path.basename(rel), js, JS_FATAL, true)();
});

console.log('  ------------------------------------------------------------');
if (!fatal) {
  console.log('  ✓ 没有致命项' + (warn ? '（' + warn + ' 处提醒，不影响布局）' : '，全绿'));
} else {
  console.log('  ✗ 发现 ' + fatal + ' 处致命项，请按上面的提示改掉后再提交');
}
console.log('');
process.exit(fatal ? 1 : 0);
