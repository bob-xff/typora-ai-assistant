/* saveMarkdown 逻辑测试：三条路径（Electron 对话框 / a[download] 降级 / 复制降级）
   不启动浏览器，用桩对象验证函数行为。 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const lines = fs.readFileSync(path.join(ROOT, 'plugin', 'client.js'), 'utf8').split('\n');

// 抽取 saveMarkdown 与 suggestMdName（按行范围动态定位）
function extract(name) {
  const start = lines.findIndex((l) => l.includes('function ' + name + '('));
  if (start < 0) throw new Error('找不到函数 ' + name);
  let depth = 0, end = start;
  for (let i = start; i < lines.length; i++) {
    for (const c of lines[i]) { if (c === '{') depth++; else if (c === '}') depth--; }
    if (depth === 0 && i > start) { end = i; break; }
    if (depth === 0 && i === start && /\{\s*$/.test(lines[i])) { /* 单行开头 */ }
  }
  return lines.slice(start, end + 1).join('\n');
}

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

/* ---------- 路径 1：Electron 对话框 + fs ---------- */
(function () {
  console.log('路径 1：Electron showSaveDialog + fs.writeFileSync');
  const tmp = path.join(os.tmpdir(), 'tyai-save-test.md');
  try { fs.unlinkSync(tmp); } catch (e) {}
  const calls = { dialog: 0, write: 0 };
  const sandbox = {
    window: {
      reqnode: function (mod) {
        if (mod === 'electron') return { remote: { dialog: { showSaveDialog: function (opts) { calls.dialog++; calls.opts = opts; return { filePath: tmp }; } } } };
        if (mod === 'fs') return { writeFileSync: function (p, t, enc) { calls.write++; global.__written = { p: p, t: t, enc: enc }; } };
        throw new Error('unexpected module ' + mod);
      },
    },
    getFilePath: function () { return 'C:\\docs\\梯度下降.md'; },
    flash: function (m) { global.__flash = m; },
    Blob: function () { throw new Error('路径 1 不该走到 Blob'); },
    copyText: function () { throw new Error('路径 1 不该走到 copyText'); },
  };
  const fn = new Function('window', 'getFilePath', 'flash', 'Blob', 'copyText', 'URL', 'document',
    extract('saveMarkdown') + '\nreturn saveMarkdown;');
  const save = fn(sandbox.window, sandbox.getFilePath, sandbox.flash, sandbox.Blob, sandbox.copyText, {}, {});
  save('# 测试内容', '梯度下降-AI笔记.md');
  check('调用了 showSaveDialog', calls.dialog === 1);
  check('传了默认文件名', calls.opts && calls.opts.defaultPath === '梯度下降-AI笔记.md');
  check('写了文件（utf8）', calls.write === 1 && global.__written && global.__written.enc === 'utf8' && global.__written.t === '# 测试内容');
  check('提示已保存', /已保存/.test(global.__flash || ''));
})();

/* ---------- 路径 2：无 reqnode → a[download] ---------- */
(function () {
  console.log('路径 2：无 Node 能力 → a[download] 降级');
  let clicked = null;
  const sandbox = {
    window: {},
    getFilePath: function () { return ''; },
    flash: function (m) { global.__flash2 = m; },
    Blob: function (parts, opts) { global.__blob = { parts: parts, opts: opts }; return {}; },
    copyText: function () { global.__copied = true; },
    URL: { createObjectURL: function (b) { return 'blob:fake'; } },
    document: {
      createElement: function (tag) { return { tag: tag, href: '', download: '', click: function () { clicked = this; } }; },
      body: { appendChild: function () {}, removeChild: function () {} },
    },
  };
  const fn = new Function('window', 'getFilePath', 'flash', 'Blob', 'copyText', 'URL', 'document',
    extract('saveMarkdown') + '\nreturn saveMarkdown;');
  const save = fn(sandbox.window, sandbox.getFilePath, sandbox.flash, sandbox.Blob, sandbox.copyText, sandbox.URL, sandbox.document);
  save('内容一', 'AI助手笔记.md');
  check('创建了 Blob（markdown 类型）', global.__blob && global.__blob.opts.type.indexOf('text/markdown') === 0);
  check('触发了 a.click()', !!clicked && clicked.tag === 'a');
  check('下载文件名正确', clicked && clicked.download === 'AI助手笔记.md');
  check('提示已触发下载', /已触发下载/.test(global.__flash2 || ''));
})();

/* ---------- 路径 3：空内容 ---------- */
(function () {
  console.log('路径 3：空内容应直接提示');
  const fn = new Function('window', 'getFilePath', 'flash', 'Blob', 'copyText', 'URL', 'document',
    extract('saveMarkdown') + '\nreturn saveMarkdown;');
  let flashed = '';
  const save = fn({}, function () { return ''; }, function (m) { flashed = m; }, null, function () {}, {}, {});
  save('', 'x.md');
  check('空内容提示"没有可保存的内容"', flashed === '没有可保存的内容');
})();

/* ---------- suggestMdName ---------- */
(function () {
  console.log('suggestMdName：从当前文档路径派生文件名');
  const fn = new Function('getFilePath', extract('suggestMdName') + '\nreturn suggestMdName;');
  check('从文档名派生', fn(function () { return 'C:\\docs\\梯度下降.md'; })() === '梯度下降-AI笔记.md');
  check('无文档时用默认名', fn(function () { return ''; })() === 'AI助手-AI笔记.md');
})();

console.log('\n结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
