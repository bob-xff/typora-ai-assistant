#!/usr/bin/env node
/* ==========================================================================
   xff助手一号 · 兼容性自检
   --------------------------------------------------------------------------
   目标内核是 Typora 1.8.3 自带的 Electron 1.8.3 → Chromium 59（2017 年）。
   用了它不认识的新语法，界面就会「错乱」（本项目踩过：sheet 抽屉塌成 0 宽）。

   用法：  node scripts/compat-check.js
   退出码：0 = 通过；1 = 有致命项（会破坏布局）

   说明：CSS 里「现代内核增强层」（选择器含 .tyai-k-modern 的块）是刻意给
   新内核用的，老内核根本没有这个 class，整块规则都不会命中。因此该区块内
   允许出现「不支持就被忽略」的属性（如 backdrop-filter）。
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

/* ---- 找出「仅现代内核生效」的区块行号（选择器里含 tyai-k-modern 的规则块） ---- */
function gatedLines(css) {
  const lines = css.split('\n');
  const gated = new Set();
  let inGate = false;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!inGate && /tyai-k-modern/.test(ln)) { inGate = true; depth = 0; }
    if (!inGate) continue;
    gated.add(i);
    for (const ch of ln) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth <= 0 && /\}/.test(ln)) inGate = false;
  }
  return gated;
}

// —— Chromium 59 不认识、且会破坏布局的 CSS ——
// 第三项 gated=true 表示「在 tyai-k-modern 区块里出现是允许的」
const CSS_FATAL = [
  [/(?:^|[;{\s])inset\s*:/g, 'inset 简写（Chrome 87+）→ 改成 top/right/bottom/left', false],
  [/(?:^|[;{\s])gap\s*:/g, 'flex/grid 的 gap（Chrome 84 / 66+）→ 用 margin，grid 用 grid-gap', false],
  [/(?:^|[;{\s])(?:row|column)-gap\s*:/g, 'row-gap / column-gap 简写 → grid 改用 grid-gap', false],
  [/:(?:is|where|has)\s*\(/g, ':is() / :where() / :has()（Chrome 88+）', false],
  [/aspect-ratio\s*:/g, 'aspect-ratio（Chrome 88+）', false],
  [/content-visibility\s*:/g, 'content-visibility（Chrome 85+）', false],
];

// 不破坏布局，但在目标内核里是死代码，提醒一下
const CSS_WARN = [
  [/overscroll-behavior\s*:/g, 'overscroll-behavior（Chrome 63+）', false],
  [/scroll-behavior\s*:/g, 'scroll-behavior（Chrome 61+）', false],
  [/scrollbar-width\s*:|scrollbar-color\s*:/g, 'scrollbar-width / scrollbar-color（Chromium 121+ 才认，Firefox 一直认）', false],
  [/text-wrap\s*:/g, 'text-wrap（Chrome 114+）', false],
  [/^\s*color-scheme\s*:/gm, 'color-scheme（Chrome 81+）→ 深色下表单控件仍会是浅色', false],
  [/prefers-reduced-motion/g, 'prefers-reduced-motion 媒体查询（Chrome 74+）→ 目标内核里动效不会被关掉', false],
  // 毛玻璃：只允许出现在 tyai-k-modern 区块（老内核没这个 class，整块不命中）
  [/backdrop-filter\s*:/g, 'backdrop-filter（Chrome 76+）→ 只许写在 .tyai-k-modern 块里', true],
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

function scan(label, text, rules, isFatal, gated) {
  const lines = text.split('\n');
  rules.forEach((rule) => {
    const re = rule[0];
    const why = rule[1];
    const gatedOk = rule[2] === true;
    const hits = [];
    lines.forEach((ln, i) => {
      if (gatedOk && gated && gated.has(i)) return;   // 增强区块里允许
      re.lastIndex = 0;
      if (re.test(ln)) hits.push(i + 1);
    });
    if (!hits.length) return;
    const tag = isFatal ? '  ✗ [致命]' : '  · [提醒]';
    console.log(tag + ' ' + label + ':' + hits.slice(0, 6).join(',') + (hits.length > 6 ? ' …' : '') + '  ' + why);
    if (isFatal) fatal += hits.length; else warn += hits.length;
  });
}

console.log('');
console.log('  xff助手一号 · Chromium 59 兼容性自检');
console.log('  ------------------------------------------------------------');

const css = stripCssComments(fs.readFileSync(CSS, 'utf8'));
const gated = gatedLines(css);
scan('client.css', css, CSS_FATAL, true, gated);
scan('client.css', css, CSS_WARN, false, gated);

// appearance 必须是「-webkit- 前缀 + 标准属性」成对出现；只有标准属性说明漏了前缀
const prefixed = (css.match(/^\s*-webkit-appearance\s*:/gm) || []).length;
const bare = (css.match(/^\s*appearance\s*:/gm) || []).length;
if (bare > prefixed) {
  console.log('  ✗ [致命] client.css  裸 appearance 出现 ' + (bare - prefixed) + ' 处 → 请保留 -webkit-appearance');
  fatal += bare - prefixed;
}

JS_FILES.forEach((rel) => {
  const js = stripJsComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  scan(path.basename(rel), js, JS_FATAL.map((r) => [r[0], r[1], false]), true, null);
});

console.log('  ------------------------------------------------------------');
if (!fatal) {
  console.log('  ✓ 没有致命项' + (warn ? '（' + warn + ' 处提醒，不影响布局）' : '，全绿'));
} else {
  console.log('  ✗ 发现 ' + fatal + ' 处致命项，请按上面的提示改掉后再提交');
}
console.log('');
process.exit(fatal ? 1 : 0);
