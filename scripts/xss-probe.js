// 从真实源码 plugin/client.js 中提取 esc/…/mdToHtml，验证修复后的渲染层是否还会产生可执行残留
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join('plugin', 'client.js'), 'utf8');

const start = src.indexOf('function esc(');
const endMarker = src.indexOf('/* ======================================================================\n   * 网络层');
const code = src.slice(start, endMarker);
if (start < 0 || endMarker < 0) { console.error('提取失败', start, endMarker); process.exit(1); }

const mdToHtml = new Function(code + '\nreturn mdToHtml;')();

const cases = [
  ['script tag', '<script>alert(1)</script>'],
  ['img onerror', '<img src=x onerror=alert(document.domain)>'],
  ['js: link', '[点我](javascript:alert(1))'],
  ['js: link (encoded)', '[点我](javascript:alert%28document.cookie%29)'],
  ['vbscript link', '[x](vbscript:msgbox(1))'],
  ['details ontoggle', '<details open ontoggle="alert(1)"><summary>x</summary></details>'],
  ['details clean', '<details><summary>标题</summary>正文</details>'],
  ['data: link', '[x](data:text/html,<script>alert(1)</script>)'],
  ['normal https link', '[文档](https://example.com/a?b=1&c=2)'],
  ['normal relative', '[本地](/docs/x.md)'],
  ['normal code', '`const a = <b>`'],
];
let bad = 0;
cases.forEach(function (c) {
  const html = mdToHtml(c[1]);
  // 判定：是否存在可执行向量（事件属性 / javascript: / vbscript: / data:text/html）
  const risky = /<[a-z][^>]*\son\w+\s*=/i.test(html) || /href="(javascript|vbscript|data:text\/html)/i.test(html);
  if (risky) bad++;
  console.log((risky ? '[!] ' : '[ok] ') + c[0] + '\n     -> ' + html.replace(/\n/g, ' '));
});
console.log('\n风险用例数: ' + bad + (bad === 0 ? '  ✅ 全部拦截' : '  ⚠️ 仍存在'));
process.exit(bad === 0 ? 0 : 2);
