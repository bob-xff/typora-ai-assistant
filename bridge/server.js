'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SCENES, buildMessages, buildChatMessages, CHAT_SYSTEM,
        AGENT_PLAN_SYSTEM, AGENT_STEP_SYSTEM, agentPlanPrompt, agentStepPrompt, parsePlan } = require('./prompts');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const CLIENT_JS = path.join(ROOT, '..', 'plugin', 'client.js');
const CLIENT_CSS = path.join(ROOT, '..', 'plugin', 'client.css');

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

function defaultConfig() {
  return {
    _comment: 'apiKey 填你的 DeepSeek Key；可改用任何 OpenAI 兼容服务（改 baseUrl + model 即可）',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: '',
    port: 8765,
    token: crypto.randomBytes(16).toString('hex'),
    temperature: 0.7,
    maxContextChars: 12000,
  };
}

function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error('[配置] config.json 解析失败，已用默认值覆盖：' + e.message);
    }
  }
  const merged = Object.assign(defaultConfig(), cfg);
  // 先按文件配置落盘，再让环境变量只覆盖本次运行（测试方便，且不污染 config.json）
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  if (process.env.AI_BRIDGE_API_KEY) merged.apiKey = process.env.AI_BRIDGE_API_KEY;
  if (process.env.DEEPSEEK_API_KEY) merged.apiKey = process.env.DEEPSEEK_API_KEY;
  if (process.env.AI_BRIDGE_BASE_URL) merged.baseUrl = process.env.AI_BRIDGE_BASE_URL;
  if (process.env.AI_BRIDGE_MODEL) merged.model = process.env.AI_BRIDGE_MODEL;
  return merged;
}

const CONFIG = loadConfig();

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, file, type) {
  if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': type + '; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

// 只允许本机调用：拒绝来自外部网页的 Origin（浏览器 CSRF / DNS rebinding 防护）
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return true; // file:// 页面 或 Node 原生请求
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
}

function guard(req, res, needToken) {
  if (!originAllowed(req)) {
    sendJson(res, 403, { error: '拒绝跨站来源的调用' });
    return false;
  }
  if (needToken && CONFIG.token) {
    const got = req.headers['x-ai-bridge-token'];
    if (got !== CONFIG.token) {
      sendJson(res, 401, { error: '缺少或错误的访问令牌（token 不匹配）' });
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * 调用上游模型（流式）
 * ------------------------------------------------------------------ */

function upstreamChat({ messages, temperature }, onDelta, onFinish, onError) {
  let url;
  try {
    url = new URL(CONFIG.baseUrl.replace(/\/+$/, '') + '/chat/completions');
  } catch (e) {
    return onError(new Error('baseUrl 不是合法 URL：' + CONFIG.baseUrl));
  }

  const payload = JSON.stringify({
    model: CONFIG.model,
    messages,
    stream: true,
    temperature: typeof temperature === 'number' ? temperature : CONFIG.temperature,
  });

  const transport = url.protocol === 'http:' ? http : https;
  const request = transport.request(
    {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + CONFIG.apiKey,
        Accept: 'text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 120000,
    },
    (up) => {
      if (up.statusCode !== 200) {
        let raw = '';
        up.on('data', (c) => (raw += c));
        up.on('end', () => {
          let detail = raw.slice(0, 600);
          try {
            const j = JSON.parse(raw);
            detail = (j.error && (j.error.message || j.error.code)) || detail;
          } catch (_) {}
          onError(new Error(`上游返回 ${up.statusCode}：${detail}`));
        });
        return;
      }

      let buffer = '';
      up.setEncoding('utf8');
      up.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const text = line.trim();
          if (!text || !text.startsWith('data:')) continue;
          const data = text.slice(5).trim();
          if (data === '[DONE]') return onFinish();
          try {
            const json = JSON.parse(data);
            if (json.error) return onError(new Error(json.error.message || '上游返回错误'));
            const delta = json.choices && json.choices[0] && json.choices[0].delta;
            if (delta && delta.content) onDelta(delta.content);
            const reason = json.choices && json.choices[0] && json.choices[0].finish_reason;
            if (reason && reason !== 'null') {
              /* 收尾交给 [DONE] */
            }
          } catch (_) {
            /* 忽略半截 JSON */
          }
        }
      });
      up.on('end', () => onFinish());
      up.on('error', onError);
    }
  );

  request.on('timeout', () => {
    request.destroy(new Error('请求上游超时'));
  });
  request.on('error', onError);
  request.end(payload);
  return request;
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * SSE 通道（/ask、/chat、/agent 共用）
 * ------------------------------------------------------------------ */

function initSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let closed = false;
  let finished = false;
  res.on('close', () => { closed = true; });
  const send = (obj) => {
    if (closed || res.writableEnded) return false;
    res.write('data: ' + JSON.stringify(obj) + '\n\n');
    return true;
  };
  const done = () => {
    if (finished || closed) return;
    finished = true;
    send({ done: true });
    if (!res.writableEnded) res.end();
  };
  return {
    send,
    done,
    isClosed: () => closed,
    // 客户端断开时销毁上游连接，避免后台继续烧 token
    abortUpstream: (up) => {
      if (!up || !up.destroy) return;
      res.on('close', () => { try { up.destroy(); } catch (_) {} });
    },
  };
}

function sseGuard(req, res) {
  if (!guard(req, res, true)) return null;
  if (!CONFIG.apiKey) {
    sendJson(res, 400, {
      error: '还没有配置 API Key。请打开 bridge/config.json，把 DeepSeek 的 Key 填到 apiKey 字段，然后重启桥接服务。',
      code: 'NO_API_KEY',
    });
    return null;
  }
  return true;
}

function needInput(res, ok) {
  if (ok) return true;
  sendJson(res, 400, { error: '没有可用的输入内容：请先选中一段文字、打开一篇文档，或填写任务/问题。' });
  return false;
}

// 把流式响应收集为完整文本；onDelta 可选（转发增量）
function streamCollect({ messages, temperature }, onDelta) {
  return new Promise((resolve, reject) => {
    let acc = '';
    upstreamChat(
      { messages, temperature },
      (d) => { acc += d; if (onDelta) onDelta(d); },
      () => resolve(acc),
      reject
    );
  });
}

/* ------------------------------------------------------------------ *
 * 路由处理器
 * ------------------------------------------------------------------ */

async function handleAsk(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, 400, { error: '请求体不是合法 JSON：' + e.message });
  }

  const scene = SCENES[body.scene] ? body.scene : 'ask';
  const selected = String(body.text || '');
  const question = String(body.question || '').trim();
  const doc = String((body.context && body.context.docText) || '').slice(0, CONFIG.maxContextChars);

  if (!needInput(res, Boolean(selected.trim() || doc.trim() || question))) return;

  const messages = buildMessages(scene, {
    text: selected,
    question: String(body.question || ''),
    history: body.history,
    context: { ...(body.context || {}), docText: doc },
  });

  const sse = initSSE(res);
  const upstream = upstreamChat(
    { messages },
    (delta) => sse.send({ delta }),
    () => sse.done(),
    (err) => {
      sse.send({ error: String((err && err.message) || err) });
      sse.done();
    }
  );
  sse.abortUpstream(upstream);
}

/* 对话模式：多轮 + 全量历史 */
async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, 400, { error: '请求体不是合法 JSON：' + e.message });
  }

  const doc = String((body.context && body.context.docText) || '').slice(0, CONFIG.maxContextChars);
  const selection = String(body.selection || '').slice(0, 6000);
  const messages = buildChatMessages({ history: body.messages, context: { ...(body.context || {}), docText: doc }, selection });

  const last = messages[messages.length - 1];
  if (!needInput(res, Boolean(last && last.role === 'user' && last.content.trim()))) return;

  const sse = initSSE(res);
  const upstream = upstreamChat(
    { messages, temperature: typeof body.temperature === 'number' ? body.temperature : undefined },
    (delta) => sse.send({ delta }),
    () => sse.done(),
    (err) => {
      sse.send({ error: String((err && err.message) || err) });
      sse.done();
    }
  );
  sse.abortUpstream(upstream);
}

/* 智能体模式：计划 → 逐步执行（流式） */
async function handleAgent(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, 400, { error: '请求体不是合法 JSON：' + e.message });
  }

  const task = String(body.task || '').trim();
  if (!needInput(res, Boolean(task))) return;

  const doc = String((body.context && body.context.docText) || '').slice(0, CONFIG.maxContextChars);
  const selection = String(body.selection || '').slice(0, 6000);
  const ctx = { task, selection, docText: doc };

  const sse = initSSE(res);

  try {
    // ---- 第一步：拆解计划 ----
    const planRaw = await streamCollect({
      messages: [
        { role: 'system', content: AGENT_PLAN_SYSTEM },
        { role: 'user', content: agentPlanPrompt(ctx) },
      ],
      temperature: 0.3,
    });
    if (sse.isClosed()) return;

    const steps = parsePlan(planRaw) || [{ title: '执行任务', goal: task }];
    sse.send({ plan: { steps: steps.map((s) => s.title) } });

    // ---- 第二步：逐步执行 ----
    const results = [];
    for (let i = 0; i < steps.length; i++) {
      if (sse.isClosed()) return;
      const step = steps[i];
      sse.send({ step_start: { i, total: steps.length, title: step.title, goal: step.goal } });

      await new Promise((resolve) => {
        let acc = '';
        let ended = false; // upstreamChat 可能触发两次收尾（[DONE] + end），只认第一次
        const finish = (fn) => { if (ended) return; ended = true; fn(); resolve(); };
        const upstream = upstreamChat(
          {
            messages: [
              { role: 'system', content: AGENT_STEP_SYSTEM },
              { role: 'user', content: agentStepPrompt({ task, step, index: i, total: steps.length, prevResults: results, selection, docText: doc }) },
            ],
          },
          (delta) => {
            acc += delta;
            sse.send({ delta, step: i });
          },
          () => finish(() => {
            results[i] = acc || '(这一步没有产出)';
            sse.send({ step_end: { i } });
          }),
          (err) => finish(() => {
            sse.send({ error: String((err && err.message) || err), step: i }); // 单步失败不拖垮整个任务
          })
        );
        sse.abortUpstream(upstream);
      });

      if (sse.isClosed()) return;
      if (results[i] === undefined) results[i] = '';
    }

    sse.done();
  } catch (err) {
    sse.send({ error: String((err && err.message) || err) });
    sse.done();
  }
}

/* 通用 LLM 透传：客户端 Agent 循环驱动，服务端只转发 */
async function handleLlm(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, 400, { error: '请求体不是合法 JSON：' + e.message });
  }

  const messages = Array.isArray(body.messages) ? body.messages : null;
  const ok = messages && messages.length && messages.some((m) => m && m.role === 'user' && String(m.content || '').trim());
  if (!needInput(res, Boolean(ok))) return;

  const sse = initSSE(res);
  const upstream = upstreamChat(
    { messages, temperature: typeof body.temperature === 'number' ? body.temperature : undefined },
    (delta) => sse.send({ delta }),
    () => sse.done(),
    (err) => {
      sse.send({ error: String((err && err.message) || err) });
      sse.done();
    }
  );
  sse.abortUpstream(upstream);
}

const DEBUG_PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>xff助手一号 · 本地测试台</title>
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
  <h1>xff助手一号 · 本地测试台</h1>
  <p class="tip">这是一个假的 Typora 编辑区。选中下面的文字试试划词功能，界面和注入到 Typora 里的是同一套代码。</p>
  <div id="write" contenteditable="true"><h2>示例文档</h2>
    <p>梯度下降是一种迭代优化算法，用来寻找函数的局部最小值。它沿着梯度的反方向更新参数，因为梯度的方向是函数上升最快的方向。</p>
    <p>学习率 <code>lr</code> 决定了每一步走多远：太小收敛慢，太大可能震荡甚至发散。</p>
  </div>
</div>
<script src="/client.js"></script>
<script>
// 演示钩子：?tab=quick&run=explain / ?tab=chat&say=你好 / ?tab=agent&task=总结全文
//          ?pop=model|sheet / ?others=1 / ?click=.tyai-some-selector（真实点击路径）
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
        // 真实点击路径：验证按钮的点击处理器真的接上了（例如输入框右侧的齿轮）
        if (q.click) { var _c = document.querySelector(q.click); if (_c) _c.click(); else console.warn('click: 找不到', q.click); }
        // 复现用户路径：选中文字 → 浮窗弹出 → 点浮窗里的场景按钮（验证侧栏会自动跳出）
        if (q.bubble) {
          var _b = document.querySelector('#tyai-bubble button[data-scene="' + q.bubble + '"]');
          if (_b) _b.click(); else console.warn('bubble: 浮窗里找不到', q.bubble);
        }
      }, 300);
    }, 500);
  });
})();
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname !== '/health') console.log('[req]', new Date().toLocaleTimeString(), req.method, pathname);

  try {
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'typora-ai-bridge',
        version: '2.8.2',
        provider: CONFIG.provider,
        model: CONFIG.model,
        baseUrl: CONFIG.baseUrl,
        configured: Boolean(CONFIG.apiKey),
        port: CONFIG.port,
      });
    }

    if (req.method === 'GET' && pathname === '/client.js') {
      // 该响应内嵌访问令牌，只放行本机来源（Node 请求无 Origin，调试页 Origin 是本机）
      if (!originAllowed(req)) return sendJson(res, 403, { error: '拒绝跨站来源的调用' });
      if (!fs.existsSync(CLIENT_JS)) return sendJson(res, 404, { error: 'client.js 不存在' });
      // 把端口和访问令牌注入到前端代码里，省去额外请求
      const prelude =
        'window.__AI_BRIDGE_PORT__ = ' + JSON.stringify(CONFIG.port) + ';\n' +
        'window.__AI_BRIDGE_TOKEN__ = ' + JSON.stringify(CONFIG.token) + ';\n';
      const body = Buffer.from(prelude + fs.readFileSync(CLIENT_JS, 'utf8'), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      return res.end(body);
    }
    if (req.method === 'GET' && pathname === '/client.css') {
      return sendFile(res, CLIENT_CSS, 'text/css');
    }
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      if (!originAllowed(req)) return sendJson(res, 403, { error: '拒绝跨站来源的调用' });
      const body = DEBUG_PAGE;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      return res.end(body);
    }

    if (req.method === 'POST' && pathname === '/ask') {
      if (!sseGuard(req, res)) return;
      return await handleAsk(req, res);
    }
    if (req.method === 'POST' && pathname === '/chat') {
      if (!sseGuard(req, res)) return;
      return await handleChat(req, res);
    }
    if (req.method === 'POST' && pathname === '/agent') {
      if (!sseGuard(req, res)) return;
      return await handleAgent(req, res);
    }
    // 通用 LLM 透传：客户端 Agent 循环用（messages 由客户端组装，服务端不掺和提示词）
    if (req.method === 'POST' && pathname === '/llm') {
      if (!sseGuard(req, res)) return;
      return await handleLlm(req, res);
    }

    sendJson(res, 404, { error: '未知路径：' + pathname });
  } catch (err) {
    console.error('[请求出错]', err);
    if (!res.headersSent) sendJson(res, 500, { error: String(err.message || err) });
    else if (!res.writableEnded) res.end();
  }
});

server.listen(CONFIG.port, '127.0.0.1', () => {
  const line = '─'.repeat(52);
  console.log(line);
  console.log('  xff助手一号 · 桥接服务已启动');
  console.log('  地址   : http://127.0.0.1:' + CONFIG.port);
  console.log('  模型   : ' + CONFIG.provider + ' / ' + CONFIG.model);
  console.log('  Key    : ' + (CONFIG.apiKey ? '已配置' : '❌ 未配置 —— 请编辑 bridge/config.json'));
  console.log(line);
  console.log('  测试台 : http://127.0.0.1:' + CONFIG.port + '/');
  console.log('  停止   : 按 Ctrl+C');
  console.log(line);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + CONFIG.port + ' 已被占用：可能桥接服务已经在运行了。');
    console.error('若确认要重启，请先结束旧的 node 进程，或改 config.json 里的 port。');
  } else {
    console.error('服务启动失败：', err);
  }
  process.exit(1);
});
