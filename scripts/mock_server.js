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
  { title: '重读文档，锁定核心概念', goal: '重读全文，确认核心概念与定义' },
  { title: '产出复习笔记并保存', goal: '整理成 Markdown 复习笔记，并用 save_md 落成文件' },
] });

/* Agent 循环脚本：按 LLM 调用序号推进（plan 请求会把计数清零）
   t0 重读文档 → t1 概念+清单 → t2 笔记+保存 → t3 收束 */
const AGENT_LOOP_SCRIPT = [
  '先重读一遍文档，确认核心概念没有遗漏。\n```tool\n{"tool":"read_document","args":{}}\n```',
  '核心概念确认：**梯度下降**、**学习率**、**局部最小值**。已把进度记入任务清单。\n```tool\n{"tool":"todo_set","args":{"items":[{"text":"梳理核心概念","status":"done"},{"text":"产出复习笔记并保存","status":"doing"}]}}\n```',
  '# 复习笔记：梯度下降\n\n## 一句话定义\n沿负梯度方向迭代更新参数，逐步逼近函数最小值的优化算法。\n\n## 要点\n- 更新公式：θ := θ − α·∇J(θ)\n- 学习率过大 → 震荡/发散；过小 → 收敛慢\n- 非凸函数可能陷入局部最小值\n\n笔记已整理好，落成文件：\n```tool\n{"tool":"save_md","args":{"name":"mock复习笔记.md","content":"# 复习笔记：梯度下降（更新公式 / 学习率 / 局部最小值）"}}\n```',
  '笔记已保存为 `mock复习笔记.md`，任务完成。\n```tool\n{"tool":"finish","args":{"summary":"已梳理核心概念并产出复习笔记文件"}}\n```',
];
let loopTurn = 0;

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
// 脏数据注入：?badagent=1 往 localStorage 写一个结构损坏 + 硬中断残留的 agent
// 会话，验证 loadSessions 的 normalizeAgent 兜底（旧版本数据 / Typora 崩溃残留）
if (/[?&]badagent=1/.test(location.search)) {
  try {
    localStorage.setItem('tyai.sessions.v2', JSON.stringify([{
      id: 'bad1', title: '损坏会话', ts: Date.now(), messages: [],
      agent: { task: 123, steps: '这不是数组', status: 'running', calls: 'x', todo: '坏数据', summary: null, updated: '昨天' },
    }]));
    var _mk = document.createElement('div');
    _mk.id = 'inject-mark';
    _mk.textContent = 'badagent-injected';
    document.body.appendChild(_mk);
  } catch (e) {}
}
// direct 模式：把前端切到直连，CFG 指向本 mock 的 OpenAI 兼容端点（不碰真实 Key）
// 注意：PAGE 是模板字符串，正则字面量里的 \/ 会被转义成 /（退化成注释！），
// 这里一律用 new RegExp 的字符串形式，别再踩坑。
if (/[?&]slow=1/.test(location.search)) {
  // 慢速 LLM：把每个请求推迟 700ms，拉长 Agent 循环，
  // 便于验证「运行中切换/新建/删除会话被拦截」这类时序敏感场景
  var _slowRe = new RegExp('/(llm|chat|ask|chat/completions)');
  var _fetch = window.fetch ? window.fetch.bind(window) : null;
  if (_fetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : ((input && input.url) || '');
      if (_slowRe.test(url)) {
        return new Promise(function (res) { setTimeout(function () { res(_fetch(input, init)); }, 700); });
      }
      return _fetch(input, init);
    };
  }
}
if (/[?&]direct=1/.test(location.search)) {
  window.__TYAI_MODE__ = 'direct';
  var _dm = document.createElement('div');
  _dm.id = 'direct-mark';
  _dm.textContent = 'direct-mode';
  document.body.appendChild(_dm);
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
<script>
// 测试台桩：拦截 a[download] 的真实下载（headless 下会让页面挂起），只打日志
(function () {
  var origCreate = document.createElement.bind(document);
  document.createElement = function (tag) {
    var el = origCreate(tag);
    if (String(tag).toLowerCase() === 'a') {
      var origClick = el.click.bind(el);
      el.click = function () {
        if (el.hasAttribute('download')) { console.log('[mock] download:', el.download); return; }
        origClick();
      };
    }
    return el;
  };
})();
</script>
<script src="/client.js"></script>
<script>
(function () {
  var q = {};
  location.search.replace(/([^?&=]+)=([^&]*)/g, function (_, k, v) { q[k] = decodeURIComponent(v); return ''; });
  // 测试台专用：当前会话的 Agent 是否处于运行态（读持久化数据，供 steps 日志标注）
  function agentOn() {
    try {
      var list = JSON.parse(localStorage.getItem('tyai.sessions.v2') || '[]');
      var cur = localStorage.getItem('tyai.sessions.v2.cur');
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === cur && list[i].agent && list[i].agent.status === 'running') return true;
      }
    } catch (e) {}
    return false;
  }
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
        if (q.steps) {          var acts = q.steps.split(';');
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
            window.__stepsLog = (window.__stepsLog || []).concat(a + (agentOn() ? '' : '(未运行)'));
            setTimeout(next, 700);
          })();
        }
        // 外部点击收回验证：?mousedown=body / ?mousedown=#tyai-ball / ?mousedown=#tyai-panel
        // 往指定元素派发真实 mousedown（冒泡到 document），验证 outside-click 逻辑。
        // 面板在 api.open() 时已展开；1.6s 后派发，dump-dom/截图核对 #tyai-panel 的 on 类。
        if (q.mousedown) {
          setTimeout(function () {
            var el = q.mousedown === 'body' ? document.body : document.querySelector(q.mousedown);
            if (!el) { console.warn('mousedown: 找不到', q.mousedown); return; }
            var ev = document.createEvent('MouseEvents');
            ev.initMouseEvent('mousedown', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
            el.dispatchEvent(ev);
            var p = document.getElementById('tyai-panel');
            console.log('[TEST] mousedown ->', q.mousedown,
              '| panel.on =', p.classList.contains('on'),
              '| sheet.hidden =', document.getElementById('tyai-sheet').hidden);
          }, 1600);
        }
        // steps 执行日志落到一个隐藏 DOM 节点，供 --dump-dom 断言（无头环境拿不到 console）
        if (q.steps) {
          setTimeout(function () {
            var log = document.createElement('div');
            log.id = 'test-steps-log';
            log.style.display = 'none';
            log.textContent = (window.__stepsLog || []).join(' | ');
            document.body.appendChild(log);
          }, 1400 + 800 * String(q.steps).split(';').length);
        }
      }, 300);
    }, 500);
  });
})();
</script>
</body></html>`;

/* OpenAI 兼容 SSE：识别 agent 计划/循环/对话/快捷，返回对应罐头 */
function openAiAnswer(messages) {
  const sys = (messages[0] && messages[0].content) || '';
  const user = (messages[messages.length - 1] && messages[messages.length - 1].content) || '';
  if (/请输出拆解步骤的 JSON/.test(user)) { loopTurn = 0; return PLAN_JSON; }
  if (/正在自主完成多步任务/.test(sys)) {
    const i = Math.min(loopTurn, AGENT_LOOP_SCRIPT.length - 1);
    loopTurn++;
    return AGENT_LOOP_SCRIPT[i];
  }
  // 快捷场景（direct 模式走 DP.buildMessages，用户消息是场景提示词）：
  // 只匹配「选中的内容」会漏掉 explain/translate/plain/summarize/outline/quiz，
  // 那些场景会错拿 CHAT_ANSWER。把各场景的特征句都列上。
  if (/选中的内容|请解释下面这段内容|把下面的内容翻译一下|大白话重讲|请总结下面这篇文档|层级大纲|出 3 道题/.test(user)) return ASK_ANSWER;
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
  if (req.method === 'POST' && pathname === '/llm') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch (e) {}
      sseHead(res);
      sseText(res, openAiAnswer(body.messages || []));
    });
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
