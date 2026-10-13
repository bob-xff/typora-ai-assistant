/* Agent 工具协议测试：parseToolCall / stripToolBlocks / suggestMdName 兼容性
   不启动浏览器，从 plugin/client.js 动态抽取函数验证。 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'plugin', 'client.js'), 'utf8');

// 从源码里抽取一个 function 定义（按花括号计数定位）
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('找不到函数 ' + name);
  let depth = 0, end = -1, inStr = false, escCh = false, strCh = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escCh) { escCh = false; continue; }
      if (c === '\\') { escCh = true; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('函数 ' + name + ' 花括号不闭合');
  return src.slice(start, end);
}

const parseToolCall = new Function('return (' + extract('parseToolCall') + ')')();
const stripToolBlocks = new Function('return (' + extract('stripToolBlocks') + ')')();

let pass = 0, fail = 0;
function t(name, actual, expect) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n    实际: ' + JSON.stringify(actual) + '\n    期望: ' + JSON.stringify(expect)); }
}

console.log('parseToolCall');
let r = parseToolCall('说明文字\n```tool\n{"tool":"read_document","args":{}}\n```\n尾随文字');
t('标准块', r, { tool: 'read_document', args: {} });
r = parseToolCall('a\n```tool\n{"tool":"save_md","args":{"name":"x.md","content":"# 标题"}}\n```');
t('带参数', r, { tool: 'save_md', args: { name: 'x.md', content: '# 标题' } });
r = parseToolCall('a\n```tool\n{"tool":"save_md","args":{"content":"包含 \\"引号\\" 与 {花括号}"}}\n```');
t('JSON 内转义引号与花括号', r && r.tool, 'save_md');
r = parseToolCall('a\n```tool\n{"tool":"todo_set","args":{"items":[{"text":"x","status":"done"}]}}\n```');
t('数组参数', r && r.args.items.length, 1);
r = parseToolCall('只有一个块\n```tool\n{"tool":"finish","args":{"summary":"ok"}}\n```\n中间又有\n```tool\n{"tool":"memory_save","args":{"content":"m"}}\n```');
t('多块取最后一个', r && r.tool, 'memory_save');
r = parseToolCall('正文里提到 ```tool 但没有真正的块');
t('无 JSON → null', r, null);
r = parseToolCall('```tool\n{"tool":"eval","args":{}}\n```');
t('白名单外工具 → null', r, null);
r = parseToolCall('```tool\n{"tool":"clipboard"}\n```');
t('缺 args → 空对象兜底', r, { tool: 'clipboard', args: {} });
r = parseToolCall('');
t('空串 → null', r, null);
r = parseToolCall('没有工具块');
t('无块 → null', r, null);

console.log('stripToolBlocks');
t('去掉闭合块', stripToolBlocks('前文\n```tool\n{"tool":"read_document"}\n```\n后文'), '前文\n\n后文');
t('去掉未闭合半截块（流式中）', stripToolBlocks('前文\n```tool\n{"tool":"save_md"'), '前文\n');
t('纯正文不动', stripToolBlocks('正常 **markdown** 文本'), '正常 **markdown** 文本');
t('空串', stripToolBlocks(''), '');
t('无正文只有块', stripToolBlocks('```tool\n{"tool":"finish"}\n```'), '');

console.log('结果：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
