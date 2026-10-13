/* 本地 mock 服务：确定性验证前端渲染（不调真实 API）
   用法：node scripts/mock_server.js  →  http://127.0.0.1:8766/
   钩子与 bridge 测试台一致：?tab=&say=&task=&run=&pop=&bubble=&click=
   direct 模式验证：URL 加 &direct=1（CFG 指向本 mock 的 OpenAI 兼容端点，不碰真实 Key） */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8766;
const CLIENT_JS = path.join(ROOT, 'plugin', 'client.js');
const CLIENT_CSS = path.join(ROOT, 'plugin', 'client.css');

const CHAT_ANSWER = [
  '**梯度下降**是一种*迭代优化*算法，用来寻找函数的局部最小值。\n\n',
  '## 核心逻辑\n\n',
  '要最小化目标函数 $J(\\theta)$，梯度 $\\nabla J(\\theta)$ 指向函数上升最快的方向，所以我们沿着**负梯度**方向更新参数：\n\n',
  '$$\\theta_{k+1} := \\theta_k - \\alpha \\nabla J(\\theta_k)$$\n\n',
  '其中 $\\alpha$ 是学习率。以二次函数 $f(x) = x^2$ 为例，$f\'(x) = 2x$，最优步长 $\\alpha = \\frac{1}{2}$ 时一步到位。\n\n',
  '更一般地，$\\lim_{k \\to \\infty} \\|\\nabla J(\\theta_k)\\| = 0$ 时收敛。\n\n',
  '## 三个关键点\n\n',
  '1. **学习率太大**：参数来回震荡，甚至发散\n',
  '2. **学习率太小**：收敛很慢，耗时很长\n',
  '3. **局部最小值**：在非凸函数里可能被困住\n\n',
  '> 打个比方：蒙着眼下山，每一步都朝脚下最陡的下坡方向挪一小步。\n\n',
  '```python\n',
  'theta -= lr * grad\n',
  '```\n\n',
  '需要我结合你文档里的内容再展开吗？',
].join('');

const ASK_ANSWER = [
  '**梯度下降**可以理解为「蒙眼下山」：\n\n',
  '- 目标：走到山谷最低处（函数最小值）\n',
  '- 方法：每一步朝**最陡的下坡方向**挪一小步\n',
  '- 步长：由学习率决定，太大容易跨过谷底，太小走得慢\n\n',
  '文档里提到的学习率 `lr` 就是这个步长。',
].join('');

const PLAN_JSON = JSON.stringify({ steps: [
  { title: '通读文档，提取核心概念', goal: '通读全文，列出核心概念与定义' },
  { title: '梳理概念之间的关系', goal: '说明概念之间如何互相影响' },
  { title: '整理成结构化复习笔记', goal: '输出一份 Markdown 复习笔记' },
] });

const AGENT_STEPS = [
  '通读全文后，核心概念有三个：\n\n1. **梯度下降**：沿负梯度方向迭代更新参数\n2. **学习率**：决定每步长度，影响收敛速度与稳定性\n3. **局部最小值**：非凸函数中可能被困住的位置',
  '三者关系：梯度下降依靠**梯度**指路，**学习率**定步长，最终可能收敛到**局部最小值**而非全局最优。',
  '# 复习笔记：梯度下降\n\n## 一句话定义\n沿负梯度方向迭代更新参数，逐步逼近函数最小值的优化算法。\n\n## 要点\n- 更新公式：$\\theta := \\theta - \\alpha \\nabla J(\\theta)$\n- 学习率过大 → 震荡/发散；过小 → 收敛慢\n- 非凸函数可能陷入局部最小值\n\n## 类比\n蒙眼下山：每步朝最陡的下坡方向挪一小步。',
];

function sseHead(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
}
function sseSend(res, obj) { res.write('data: ' + JSON.stringify(obj) + '\n\n'); }
function sseText(res, text) {
  for (let i = 0; i < text.length; i += 6) sseSend(res, { delta: text.slice(i, i + 6) });
  sseSend(res, { done: true });
  res.end();
}

const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>xff助手一号 · mock 测试台</title>
<link rel="stylesheet" href="/client.css">
<style>
  html,body{margin:0;height:100%;font-family:system-ui,"Microsoft YaHei",sans-serif;background:#f5f5f3;color:#2c2c2a}
  .wrap{max-width:900px;margin:0 auto;padding:24px}
  h1{font-size:18px;font-weight:500;margin:0 0 6px}
  p.tip{font-size:13px;color:#5f5e5a;margin:0 0 18px}
  #write{background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:20px 24px;min-height:260px;font-size:14px;line-height:1.8;outline:none}
  #write h2{font-size:15px;margin:0 0 8px}
  code{background:#f1efe8;padding:1px 4px;border-radius:4px}
</style></head><body>
<div class="wrap">
  <h1>xff助手一号 · mock 测试台</h1>
  <p class="tip">这是一个假的 Typora 编辑区。选中下面的文字试试划词功能，界面和注入到 Typora 里的是同一套代码。</p>
  <div id="write" contenteditable="true"><h2>示例文档</h2>
    <p>梯度下降是一种迭代优化算法，用来寻找函数的局部最小值。它沿着梯度的反方向更新参数，因为梯度的方向是函数上升最快的方向。</p>
    <p>学习率 <code>lr</code> 决定了每一步走多远：太小收敛慢，太大可能震荡甚至发散。</p>
  </div>
</div>
<script>
// direct 模式：把前端切到直连，CFG 指向本 mock 的 OpenAI 兼容端点（不碰真实 Key）
if (/[?&]direct=1/.test(location.search)) {
  window.__TYAI_MODE__ = 'direct';
  // 测试台专用 reqnode shim：用 fetch 流式模拟 Node http（仅本页生效，不进产品代码）
  window.reqnode = function (mod) {
    return {
      request: function (opts, cb) {
        var url = 'http://' + (opts.hostname || opts.host) + ':' + (opts.port || 80) + (opts.path || '/');
        var controller = new AbortController();
        var destroyed = false;
        var req = {
          _body: '', _err: null,
          setTimeout: function () {},
          on: function (ev, fn) { if (ev === 'error') req._err = fn; },
          write: function (b) { req._body += b; },
          end: function () {
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: req._body, signal: controller.signal })
              .then(function (res) {
                var hs = {};
                var up = {
                  statusCode: res.status,
                  setEncoding: function () {},
                  on: function (ev, fn) { (hs[ev] = hs[ev] || []).push(fn); },
                };
                function emit(ev, arg) { (hs[ev] || []).forEach(function (f) { f(arg); }); }
                cb(up);
                if (res.status !== 200) {
                  res.text().then(function (t) { emit('data', t); emit('end'); });
                  return;
                }
                var reader = res.body.getReader();
                var dec = new TextDecoder();
                (function pump() {
                  reader.read().then(function (r) {
                    if (r.done) { emit('end'); return; }
                    emit('data', dec.decode(r.value, { stream: true }));
                    pump();
                  });
                })();
              })
              .catch(function (e) { if (!destroyed && req._err) req._err(e); });
          },
          destroy: function () { destroyed = true; try { controller.abort(); } catch (e) {} },
        };
        return req;
      },
    };
  };
  try {
    localStorage.setItem('tyai.cfg.v3', JSON.stringify({
      provider: 'custom', baseUrl: location.origin + '/v1', model: 'mock-model', apiKey: 'mock-key-123456'
    }));
  } catch (e) {}
}
</script>
<script src="/client.js"></script>
<script>
(function () {
  var q = {};
  location.search.replace(/([^?&=]+)=([^&]*)/g, function (_, k, v) { q[k] = decodeURIComponent(v); return ''; });
  window.addEventListener('load', function () {
    setTimeout(function () {
      var write = document.getElementById('write');
      var range = document.createRange();
      range.selectNodeContents(write.querySelector('p'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      setTimeout(function () {
        var api = window.__tyai;
        if (!api) return;
        api.open();
        api.tab(q.tab || 'quick');
        if (q.run) api.runScene(q.run);
        else if (q.say) api.chat(q.say);
        else if (q.task) api.agent(q.task);
        if (q.pop === 'model') api.modelPop();
        else if (q.pop === 'sheet') api.sheet();
        if (q.others) { var _t = document.getElementById('tyai-pop-toggle'); if (_t) _t.click(); }
        if (q.click) { var _c = document.querySelector(q.click); if (_c) _c.click(); else console.warn('click: 找不到', q.click); }
        if (q.bubble) {
          var _b = document.querySelector('#tyai-bubble button[data-scene="' + q.bubble + '"]');
          if (_b) _b.click(); else console.warn('bubble: 浮窗里找不到', q.bubble);
        }
        // 脚本化动作序列：?steps=new;chat:你好;new;chat:第二问;switch:1;q:第二;del:0
        if (q.steps) {
          var acts = q.steps.split(';');
          var i = 0;
          (function next() {
            if (i >= acts.length) return;
            var a = acts[i++];
            var m;
            try {
              if (a === 'new') { document.getElementById('tyai-side-new').click(); }
              else if (a === 'fold') { document.getElementById('tyai-side-fold').click(); }
              else if (a === 'unfold') { document.getElementById('tyai-side-unfold').click(); }
              else if ((m = a.match(/^chat:(.*)$/s))) { api.chat(m[1]); }
              else if ((m = a.match(/^agent:(.*)$/s))) { api.agent(m[1]); }
              else if ((m = a.match(/^switch:(\\d+)$/))) {
                var items = document.querySelectorAll('.tyai-side-item');
                if (items[+m[1]]) items[+m[1]].click(); else console.warn('switch: 没有第', m[1], '项');
              }
              else if ((m = a.match(/^del:(\\d+)$/))) {
                var dels = document.querySelectorAll('.tyai-side-del');
                if (dels[+m[1]]) dels[+m[1]].click(); else console.warn('del: 没有第', m[1], '项');
              }
              else if ((m = a.match(/^q:(.*)$/s))) {
                var qq = document.getElementById('tyai-side-q');
                qq.value = m[1];
                qq.dispatchEvent(new Event('input', { bubbles: true }));
              }
              else if ((m = a.match(/^click:(.*)$/s))) {
                var el = document.querySelector(m[1]);
                if (el) el.click(); else console.warn('click: 找不到', m[1]);
              }
            } catch (e) { console.warn('step 失败:', a, e); }
            setTimeout(next, 700);
          })();
        }
      }, 300);
    }, 500);
  });
})();
</script>
</body></html>`;

/* OpenAI 兼容 SSE：识别 agent 计划/步骤/对话/快捷，返回对应罐头 */
function openAiAnswer(messages) {
  const sys = (messages[0] && messages[0].content) || '';
  const user = (messages[messages.length - 1] && messages[messages.length - 1].content) || '';
  if (/请输出拆解步骤的 JSON/.test(user)) return PLAN_JSON;
  if (/智能体模式/.test(sys)) {
    const m = user.match(/当前是第 (\d+)\/(\d+) 步/);
    const idx = m ? parseInt(m[1], 10) - 1 : 0;
    return AGENT_STEPS[idx] || AGENT_STEPS[0];
  }
  if (/选中的内容/.test(user)) return ASK_ANSWER;
  return CHAT_ANSWER;
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'typora-ai-mock', configured: true, model: 'mock-model' }));
  }
  if (req.method === 'GET' && pathname === '/client.js') {
    const prelude = 'window.__AI_BRIDGE_PORT__ = ' + PORT + ';\nwindow.__AI_BRIDGE_TOKEN__ = "mock";\n';
    const body = Buffer.from(prelude + fs.readFileSync(CLIENT_JS, 'utf8'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': body.length });
    return res.end(body);
  }
  if (req.method === 'GET' && pathname === '/client.css') {
    const body = fs.readFileSync(CLIENT_CSS);
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    return res.end(body);
  }
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }
  if (req.method === 'POST' && pathname === '/chat') { sseHead(res); return sseText(res, CHAT_ANSWER); }
  if (req.method === 'POST' && pathname === '/ask') { sseHead(res); return sseText(res, ASK_ANSWER); }
  if (req.method === 'POST' && pathname === '/agent') {
    sseHead(res);
    sseSend(res, { plan: { steps: ['通读文档，提取核心概念', '梳理概念之间的关系', '整理成结构化复习笔记'] } });
    let i = 0;
    (function next() {
      if (i >= AGENT_STEPS.length) { sseSend(res, { done: true }); return res.end(); }
      const idx = i++;
      sseSend(res, { step_start: { i: idx, total: AGENT_STEPS.length, title: ['通读文档，提取核心概念', '梳理概念之间的关系', '整理成结构化复习笔记'][idx] } });
      for (let k = 0; k < AGENT_STEPS[idx].length; k += 6) sseSend(res, { delta: AGENT_STEPS[idx].slice(k, k + 6), step: idx });
      sseSend(res, { step_end: { i: idx } });
      setTimeout(next, 30);
    })();
    return;
  }
  // OpenAI 兼容端点（direct 模式）：/v1/chat/completions
  if (req.method === 'POST' && pathname === '/v1/chat/completions') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch (e) {}
      const answer = openAiAnswer(body.messages || []);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });
      for (let i = 0; i < answer.length; i += 6) {
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: answer.slice(i, i + 6) } }] }) + '\n\n');
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '127.0.0.1', () => console.log('mock server on http://127.0.0.1:' + PORT));
