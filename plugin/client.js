/* ==========================================================================
   xff助手一号 · 前端 v2.4
   --------------------------------------------------------------------------
   设计：清爽白底 + 大留白 + 大圆角输入容器；对话 / 智能体 / 快捷 三模式；
        输入区内置「模型切换」下拉与「配置」面板，API Key 只存在本机。
   运行：由 plugin/inject.js 注入到 Typora 的 window.html。
         - direct 模式：Typora 渲染进程直连 AI API（默认，无需后台）
         - bridge 模式：请求走本地桥接服务（可选，支持热更新）
   同一份代码也能直接在浏览器里跑（桥接服务的首页就是测试台）。
   ========================================================================== */

(function () {
  'use strict';

  if (window.__TYPORA_AI_BRIDGE_V3__) return;
  window.__TYPORA_AI_BRIDGE_V3__ = true;

  var VERSION = '2.4';
  var PORT = window.__AI_BRIDGE_PORT__ || 8765;
  var TOKEN = window.__AI_BRIDGE_TOKEN__ || '';
  var BASE = 'http://127.0.0.1:' + PORT;

  /* ======================================================================
   * 图标（内联 SVG，统一 currentColor）
   * ==================================================================== */

  var ICONS = {
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>',
    spark: '<path d="M11 3.2l1.6 4.3 4.3 1.6-4.3 1.6L11 15l-1.6-4.3L5.1 9.1l4.3-1.6z"/><path d="M18.4 14.6l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z"/>',
    bolt: '<path d="M13 2 4.5 13.5H10l-1 8.5 8.5-11.5H12z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.2 14.6a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.67 9.2a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.1 4.44l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.56 1.03z"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5V9h4.5"/><path d="M12 8.5V12l2.8 1.7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    send: '<path d="M12 19.5V5"/><path d="M5.5 11.5 12 5l6.5 6.5"/>',
    stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5.5 15.5V6a2 2 0 0 1 2-2h8"/>',
    insert: '<path d="M12 5v14M5 12h14"/>',
    redo: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M21 4.5V9h-4.5"/>',
    eye: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeoff: '<path d="M4 4l16 16"/><path d="M9.9 5.1A9.6 9.6 0 0 1 12 4.9c6 0 9.5 5.5 9.5 5.5a17 17 0 0 1-3.2 3.9"/><path d="M6.2 7.4A17 17 0 0 0 2.5 10.4s3.5 5.5 9.5 5.5c1 0 1.9-.2 2.7-.4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    warn: '<path d="M12 9.5v4M12 17h.01"/><path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    bulb: '<path d="M9.5 18h5"/><path d="M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.5 3.5 5.4 3.5 8.5S14.3 18 12 20.5c-2.3-2.5-3.5-5.4-3.5-8.5S9.7 6 12 3.5z"/>',
    lines: '<path d="M4 6.5h16M4 12h12.5M4 17.5h8"/>',
    tree: '<path d="M4 5h7M4 12h11M4 19h7"/><circle cx="17.5" cy="12" r="1.5"/>',
    quiz: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.3c-.6.3-.9.8-.9 1.4v.3"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 20 3M16.5 6.5 19 9M14.5 8.5 17 11"/>',
    model: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 7.5 10 10M17 7.5 14 10M7 16.5 10 14M17 16.5 14 14"/>',
  };

  function icon(name, size) {
    var s = size || 16;
    var p = ICONS[name] || ICONS.spark;
    return '<svg class="tyai-i" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ======================================================================
   * Logo：纯色几何标记 —— 粉色圆角方块 + 白色对话气泡 + 粉星（灵感）
   *       全纯色填充，无任何渐变。
   * ==================================================================== */

  function logoMark(size) {
    return '<svg class="tyai-mark" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true">' +
      '<rect x="2" y="2" width="60" height="60" rx="18" fill="#e0567d"/>' +
      '<path d="M32 13.5c-9.6 0-17.4 6-17.4 13.4 0 4.7 3.1 8.8 7.9 11.3-.4 2.3-1.7 4.4-3.5 5.9 3.3-.4 6.3-1.8 8.6-3.9 1.4.2 2.9.3 4.4.3 9.6 0 17.4-6 17.4-13.6S41.6 13.5 32 13.5z" fill="#ffffff"/>' +
      '<path d="M32 20.6c.9 3.5 1.7 4.3 5.2 5.2-3.5.9-4.3 1.7-5.2 5.2-.9-3.5-1.7-4.3-5.2-5.2 3.5-.9 4.3-1.7 5.2-5.2z" fill="#e0567d"/>' +
      '</svg>';
  }

  /* ======================================================================
   * 配置：预设服务商 + 本地存储（API Key 只留在本机）
   * ==================================================================== */

  var CFG_KEY = 'tyai.cfg.v3';

  var PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash'] },
    { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-turbo', 'qwen-max'] },
    { id: 'moonshot', name: 'Kimi（Moonshot）', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o'] },
    { id: 'custom', name: '自定义（OpenAI 兼容）', baseUrl: '', models: [] }
  ];

  function providerOf(id) {
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i];
    return PROVIDERS[0];
  }

  var DEFAULT_CFG = {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: '',
    temperature: 0.7,
    maxContextChars: 12000
  };

  // 只合并「有值」的字段，避免空值把已有配置抹掉
  function mergeCfg(dst, src) {
    if (!src) return dst;
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (v === undefined || v === null || v === '') continue;
      dst[k] = v;
    }
    return dst;
  }

  function loadCfg() {
    var c = mergeCfg({}, DEFAULT_CFG);
    mergeCfg(c, window.__TYAI_CONFIG__);           // 安装目录里的 config.json（可能带默认值）
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (e) {}
    mergeCfg(c, saved);                            // 面板里填的配置优先
    if (!c.provider || !providerOf(c.provider).id) c.provider = 'custom';
    return c;
  }

  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); } catch (e) {}
  }

  function hasKey() { return !!(CFG.apiKey && String(CFG.apiKey).length > 6); }

  var CFG = loadCfg();
  var MODE = window.__TYAI_MODE__ || 'bridge';

  /* ======================================================================
   * 状态
   * ==================================================================== */

  var STORE_KEY = 'tyai.sessions.v2';
  var MAX_SESSIONS = 30;
  var MAX_TURNS = 60;
  var DATA_TIMEOUT = 60000;

  var state = {
    tab: 'chat',
    open: false,
    busy: false,
    abort: null,
    sessions: [],
    curId: null,
    lastSelection: '',
    lastRange: null,
    lastResult: '',
    lastScene: null,
    lastAgentTask: '',
    agentResult: [],
  };

  var root, ball, panel, statusEl, bubble, composerInput;
  var els = {};

  /* ======================================================================
   * 工具
   * ==================================================================== */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function byteLength(str) {
    if (typeof TextEncoder !== 'undefined') {
      try { return new TextEncoder().encode(str).length; } catch (e) {}
    }
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i++; continue; }
      }
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  }

  function pickError(raw, code) {
    var msg = raw;
    try { msg = JSON.parse(raw).error || raw; } catch (e) {}
    return String(msg || '').trim() || 'HTTP ' + code;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function clamp(n, a, b) { return Math.min(Math.max(n, a), b); }

  /* ======================================================================
   * Markdown 渲染（极简）
   * ==================================================================== */

  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function mdToHtml(src) {
    var slots = [];
    function slot(html) { slots.push(html); return '\u0001' + (slots.length - 1) + '\u0001'; }

    var text = String(src);
    text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, function (m, code) {
      return '\n' + slot('<pre><code>' + esc(code.replace(/\n$/, '')) + '</code></pre>') + '\n';
    });
    text = text.replace(/<\/?(?:details|summary)[^>]*>/gi, function (m) { return slot(m.toLowerCase()); });
    text = esc(text);

    var lines = text.split('\n');
    var out = [];
    var list = null;

    function closeList() { if (list) { out.push('</' + list + '>'); list = null; } }
    function openList(type) { if (list !== type) { closeList(); out.push('<' + type + '>'); list = type; } }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m;

      if (/^\u0001\d+\u0001$/.test(line.trim())) { closeList(); out.push(line.trim()); continue; }
      if (!line.trim()) { closeList(); continue; }

      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        closeList();
        var lv = Math.min(6, m[1].length + 2);
        out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>');
        continue;
      }
      if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line)) { closeList(); out.push('<hr>'); continue; }
      if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { openList('ul'); out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { openList('ol'); out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if ((m = line.match(/^&gt;\s?(.*)$/))) { closeList(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }

      if (line.indexOf('|') === 0 && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        closeList();
        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf('|') === 0) { rows.push(splitRow(lines[i])); i++; }
        i--;
        out.push(
          '<table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join(''); }).join('') +
          '</tbody></table>'
        );
        continue;
      }

      var para = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|&gt;|\u0001|\|)/.test(lines[i + 1])) {
        para.push(lines[++i]);
      }
      closeList();
      out.push('<p>' + inline(para.join('<br>')) + '</p>');
    }
    closeList();
    return out.join('\n').replace(/\u0001(\d+)\u0001/g, function (_, n) { return slots[+n]; });
  }

  /* ======================================================================
   * 网络层：桥接服务（SSE）+ 超时保护
   * ==================================================================== */

  function makeStream(handlers) {
    var buffer = '';
    var finished = false;

    function finish(err) {
      if (finished) return;
      finished = true;
      if (handlers.onFinish) handlers.onFinish();
      if (err) { if (handlers.onError) handlers.onError(err); }
      else if (handlers.onEnd) handlers.onEnd();
    }

    function feed(chunk) {
      if (finished) return;
      buffer += chunk;
      var parts = buffer.split('\n\n');
      buffer = parts.pop();
      for (var i = 0; i < parts.length; i++) {
        var line = parts[i].trim();
        if (line.indexOf('data:') !== 0) continue;
        var data = line.slice(5).trim();
        if (!data) continue;
        var json;
        try { json = JSON.parse(data); } catch (e) { continue; }

        if (json.error) { finish(); handlers.onError && handlers.onError(new Error(json.error)); return; }
        if (json.delta && handlers.onDelta) handlers.onDelta(json.delta, json.step);
        if (json.plan && handlers.onPlan) handlers.onPlan(json.plan);
        if (json.step_start && handlers.onStepStart) handlers.onStepStart(json.step_start);
        if (json.step_end && handlers.onStepEnd) handlers.onStepEnd(json.step_end);
        if (json.done) { finish(); return; }
      }
    }

    return { feed: feed, finish: finish, isFinished: function () { return finished; } };
  }

  function request(method, path, body, handlers) {
    var payload = body ? JSON.stringify(body) : null;
    var headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['X-AI-Bridge-Token'] = TOKEN;
    if (payload) headers['Content-Length'] = byteLength(payload);

    var stream = makeStream(handlers);
    var gotData = false;
    var watchdog = setTimeout(function () {
      if (!gotData && !stream.isFinished()) {
        stream.finish();
        handlers.onError && handlers.onError(new Error('响应超时（60 秒没有收到任何数据）'));
      }
    }, DATA_TIMEOUT);

    function noteData() { gotData = true; }
    function clear() { clearTimeout(watchdog); }

    if (window.reqnode) {
      var aborted = false;
      var http = window.reqnode('http');
      var req = http.request(
        { host: '127.0.0.1', port: PORT, path: path, method: method, headers: headers },
        function (res) {
          res.setEncoding && res.setEncoding('utf8');
          if (res.statusCode !== 200) {
            var raw = '';
            res.on('data', function (c) { raw += c; });
            res.on('end', function () {
              clear();
              stream.finish();
              handlers.onError && handlers.onError(new Error(pickError(raw, res.statusCode)));
            });
            return;
          }
          res.on('data', function (c) { noteData(); stream.feed(c); });
          res.on('end', function () { clear(); stream.finish(); });
        }
      );
      req.on('error', function (e) {
        clear();
        if (!aborted) { stream.finish(); handlers.onError && handlers.onError(e); }
      });
      if (payload) req.write(payload);
      req.end();
      return function () {
        aborted = true;
        clear();
        try { req.destroy(); } catch (e) {}
      };
    }

    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var init = { method: method, headers: headers };
    if (ctrl) init.signal = ctrl.signal;
    if (payload) init.body = payload;

    fetch(BASE + path, init)
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            clear();
            stream.finish();
            handlers.onError && handlers.onError(new Error(pickError(t, res.status)));
          });
        }
        if (!res.body || !res.body.getReader) {
          return res.text().then(function (t) { noteData(); stream.feed(t); clear(); stream.finish(); });
        }
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        (function pump() {
          reader.read().then(function (r) {
            if (r.done) { clear(); stream.finish(); return; }
            noteData();
            stream.feed(dec.decode(r.value, { stream: true }));
            if (stream.isFinished()) { try { reader.cancel(); } catch (e) {} return; }
            pump();
          }).catch(function (e) { clear(); stream.finish(e); });
        })();
      })
      .catch(function (e) {
        clear();
        if (e && e.name === 'AbortError') return;
        stream.finish();
        handlers.onError && handlers.onError(e);
      });

    return function () { clear(); try { ctrl && ctrl.abort(); } catch (e) {} };
  }

  // 整包请求（非流式），用于 /health
  function rawRequest(method, path, body, cb) {
    var payload = body ? JSON.stringify(body) : null;
    var headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['X-AI-Bridge-Token'] = TOKEN;
    if (payload) headers['Content-Length'] = byteLength(payload);

    if (window.reqnode) {
      var http = window.reqnode('http');
      var req = http.request({ host: '127.0.0.1', port: PORT, path: path, method: method, headers: headers }, function (res) {
        res.setEncoding && res.setEncoding('utf8');
        var body2 = '';
        res.on('data', function (c) { body2 += c; });
        res.on('end', function () {
          if (res.statusCode !== 200) return cb(new Error(pickError(body2, res.statusCode)));
          cb(null, body2);
        });
      });
      req.on('error', function (e) { cb(e); });
      req.setTimeout(4000, function () { try { req.destroy(new Error('timeout')); } catch (e) {} });
      if (payload) req.write(payload);
      req.end();
      return;
    }
    fetch(BASE + path, { method: method, headers: headers, body: payload })
      .then(function (r) { return r.text(); })
      .then(function (t) { cb(null, t); })
      .catch(function (e) { cb(e); });
  }

  /* ======================================================================
   * 内置提示词与直连层（direct 模式使用；与 bridge/prompts.js 保持同步）
   * ==================================================================== */

  var DP = (function () {
    var BASE_SYSTEM =
      '你是一位严谨、耐心的学习助手，嵌入在用户的 Markdown 阅读器（Typora）里。\n' +
      '用户正在阅读或整理一篇文档，希望你能帮他真正读懂，而不是替他读完。\n\n' +
      '硬性要求：\n' +
      '1. 默认用简体中文回答；用户明确要求其他语言时才切换。\n' +
      '2. 先给结论，再给推理。开篇不要寒暄，不要复述用户的原文。\n' +
      '3. 出现专业术语时，顺手用一句话解释清楚。\n' +
      '4. 用 Markdown 排版（标题、列表、表格）；数学公式用 $...$ 或 $$...$$。\n' +
      '5. 材料不足以回答时，直说缺什么，禁止编造事实、数据或引用。\n' +
      '6. 不要输出「希望这对你有帮助」这类填充语句。';

    function docBlock(ctx) {
      if (!ctx) return '';
      var parts = [];
      if (ctx.filePath) parts.push('当前文件：' + ctx.filePath);
      if (ctx.title) parts.push('文档标题：' + ctx.title);
      if (ctx.docText) parts.push('文档全文（可能被截断，仅供理解上下文）：\n<<<DOC\n' + ctx.docText + '\nDOC>>>');
      return parts.length ? '\n\n【上下文】\n' + parts.join('\n') : '';
    }

    var SCENES = {
      explain: {
        build: function (req) {
          return '请解释下面这段内容：\n\n<<<\n' + req.text + '\n>>>\n\n' +
            '按这个结构回答：\n' +
            '1. **一句话**说清它在讲什么。\n' +
            '2. 分点展开关键概念（每个概念配一句白话解释）。\n' +
            '3. 给一个贴近生活的类比或例子。\n' +
            '4. 如果这是某个更大知识体系的一环，指出它和相邻概念的关系。';
        },
      },
      translate: {
        build: function (req) {
          return '把下面的内容翻译一下：\n\n<<<\n' + req.text + '\n>>>\n\n' +
            '规则：内容主要是中文就译成英文，主要是英文就译成中文。' +
            '保留原有的 Markdown 结构、公式和代码块。先给译文，' +
            '最后另起一段用「术语对照」列出 3-5 个值得记的词。';
        },
      },
      plain: {
        build: function (req) {
          return '把下面这段内容用大白话重讲一遍，让完全没接触过这个领域的人也能听懂：\n\n<<<\n' + req.text + '\n>>>\n\n' +
            '要求：不许堆术语；必须保留原意，不许为了简单而失真。' +
            '讲完后再补一句「严谨版本」的精确表述。';
        },
      },
      summarize: {
        build: function (req) {
          return '请总结下面这篇文档：\n\n<<<\n' + req.text + '\n>>>\n\n' +
            '输出格式：\n' +
            '- **一句话主旨**\n' +
            '- **核心要点**（3-7 条，每条不超过 30 字）\n' +
            '- **关键结论/数据**（有就列，没有就跳过）\n' +
            '- **读后应该能回答的问题**（2-3 个）';
        },
      },
      outline: {
        build: function (req) {
          return '请为下面的文档生成一份层级大纲：\n\n<<<\n' + req.text + '\n>>>\n\n' +
            '用 Markdown 多级列表表示层次，标题要精炼。' +
            '大纲之后，另起一段指出原文结构中「逻辑跳跃或缺失」的地方（如果有）。';
        },
      },
      quiz: {
        build: function (req) {
          return '请基于下面这段内容出 3 道题来检测我是否真的读懂了：\n\n<<<\n' + req.text + '\n>>>\n\n' +
            '要求：\n' +
            '- 题型混合：1 道概念题、1 道应用题、1 道「判断对错并说明理由」。\n' +
            '- **先只给题目**，不要泄露答案。\n' +
            '- 题目全部写完后，另起一段用 <details><summary>查看答案</summary> ... </details> 包住答案与解析。';
        },
      },
      ask: {
        build: function (req) {
          return (req.text ? '选中的内容：\n<<<\n' + req.text + '\n>>>\n\n' : '') +
            '我的问题：' + (req.question || '');
        },
      },
    };

    function buildMessages(scene, req) {
      var def = SCENES[scene] || SCENES.ask;
      var messages = [{ role: 'system', content: BASE_SYSTEM + docBlock(req.context) }];
      var history = Array.isArray(req.history) ? req.history.slice(-10) : [];
      for (var i = 0; i < history.length; i++) {
        var turn = history[i];
        if (!turn || !turn.role || !turn.content) continue;
        messages.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content) });
      }
      messages.push({ role: 'user', content: def.build(req) });
      return messages;
    }

    var CHAT_SYSTEM =
      BASE_SYSTEM +
      '\n7. 当前处于「对话模式」：保持上下文连贯，用户追问时直接回应，不必每次都长篇大论。\n' +
      '8. 用户引用「选中的内容」时，优先围绕它回答。';

    function buildChatMessages(opts) {
      var ctx = {};
      for (var k in (opts.context || {})) ctx[k] = opts.context[k];
      if (opts.selection && !ctx.selection) ctx.selection = opts.selection;
      var sys = CHAT_SYSTEM + docBlock(ctx) +
        (ctx.selection ? '\n\n【选中的内容】\n<<<\n' + String(ctx.selection).slice(0, 4000) + '\n>>>' : '');
      var messages = [{ role: 'system', content: sys }];
      var hist = Array.isArray(opts.history) ? opts.history.slice(-40) : [];
      for (var i = 0; i < hist.length; i++) {
        var turn = hist[i];
        if (!turn || !turn.role || !turn.content) continue;
        messages.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content).slice(0, 16000) });
      }
      return messages;
    }

    var AGENT_PLAN_SYSTEM =
      '你是「学习智能体」，运行在用户本地的学习助手里。用户会给你一个学习任务和一份文档上下文。\n' +
      '你的第一步是把任务拆解成 2~4 个可执行的步骤。\n\n' +
      '硬性要求：\n' +
      '1. 只输出一个 JSON 对象，禁止输出 JSON 以外的任何文字（包括解释、代码块围栏）。\n' +
      '2. 格式：{"steps":[{"title":"步骤短标题（不超过12字）","goal":"这一步具体做什么，一句话"}]}\n' +
      '3. 步骤通常依次为：梳理讲解 → 深入举例 → 检验总结；按任务需要调整。\n' +
      '4. 不要编造文档里不存在的知识。文档不足以完成任务时，在对应步骤的 goal 里写明「基于通用知识」。';

    var AGENT_STEP_SYSTEM =
      BASE_SYSTEM +
      '\n7. 当前处于「智能体模式」：你正在执行多步骤任务中的一步。直接输出这一步的成果，不要复述步骤名，不要说「接下来我们」。\n' +
      '8. 若这不是最后一步，结尾不要对整个任务做总结；最后一步需要给出收束性的小结。';

    function agentPlanPrompt(opts) {
      var parts = ['学习任务：' + opts.task];
      if (opts.selection) parts.push('\n用户选中的内容（优先围绕它）：\n<<<\n' + String(opts.selection).slice(0, 4000) + '\n>>>');
      if (opts.docText) parts.push('\n文档上下文（可能截断）：\n<<<DOC\n' + opts.docText + '\nDOC>>>');
      parts.push('\n请输出拆解步骤的 JSON。');
      return parts.join('\n');
    }

    function agentStepPrompt(opts) {
      var prev = (opts.prevResults || [])
        .map(function (r, i) { return '【步骤' + (i + 1) + ' · 已完成】\n' + String(r).slice(0, 3000); })
        .join('\n\n');
      var parts = ['总任务：' + opts.task];
      if (opts.step) parts.push('当前是第 ' + (opts.index + 1) + '/' + opts.total + ' 步：' + opts.step.title + ' —— ' + opts.step.goal);
      if (opts.selection) parts.push('\n用户选中的内容：\n<<<\n' + String(opts.selection).slice(0, 4000) + '\n>>>');
      if (opts.docText) parts.push('\n文档上下文（可能截断）：\n<<<DOC\n' + opts.docText + '\nDOC>>>');
      if (prev) parts.push('\n\n前面步骤的成果（供衔接，不要重复）：\n' + prev);
      parts.push('\n现在直接输出这一步的成果。');
      return parts.join('\n\n');
    }

    function parsePlan(text) {
      if (!text) return null;
      var t = String(text).replace(/```(?:json)?/gi, '').trim();
      var start = t.indexOf('{');
      if (start < 0) return null;
      var depth = 0, end = -1;
      for (var i = start; i < t.length; i++) {
        var c = t[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end < 0) return null;
      try {
        var obj = JSON.parse(t.slice(start, end));
        var steps = Array.isArray(obj.steps) ? obj.steps : [];
        var clean = steps
          .filter(function (s) { return s && (s.title || s.goal); })
          .slice(0, 5)
          .map(function (s) { return { title: String(s.title || s.goal).slice(0, 30), goal: String(s.goal || s.title).slice(0, 200) }; });
        return clean.length ? clean : null;
      } catch (e) { return null; }
    }

    return {
      SCENES: SCENES,
      buildMessages: buildMessages,
      buildChatMessages: buildChatMessages,
      AGENT_PLAN_SYSTEM: AGENT_PLAN_SYSTEM,
      AGENT_STEP_SYSTEM: AGENT_STEP_SYSTEM,
      agentPlanPrompt: agentPlanPrompt,
      agentStepPrompt: agentStepPrompt,
      parsePlan: parsePlan,
    };
  })();

  /* ---------------- 直连请求（Typora 渲染进程 → AI API） ---------------- */

  function directRequest(opts, handlers) {
    var reqnode = window.reqnode;
    if (!reqnode) {
      setTimeout(function () {
        handlers.onFinish && handlers.onFinish();
        handlers.onError && handlers.onError(new Error('当前环境没有 Node 能力，无法直连 AI 服务。请启动桥接服务。'));
      }, 0);
      return function () {};
    }

    var url;
    try {
      url = new URL(String(CFG.baseUrl || '').replace(/\/+$/, '') + '/chat/completions');
    } catch (e) {
      setTimeout(function () {
        handlers.onFinish && handlers.onFinish();
        handlers.onError && handlers.onError(new Error('Base URL 不是合法地址：' + CFG.baseUrl));
      }, 0);
      return function () {};
    }

    var payload = JSON.stringify({
      model: CFG.model,
      messages: opts.messages,
      stream: true,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : (Number(CFG.temperature) || 0.7),
    });

    var transport = url.protocol === 'http:' ? reqnode('http') : reqnode('https');
    var gotData = false;
    var finished = false;

    function finish(err) {
      if (finished) return;
      finished = true;
      handlers.onFinish && handlers.onFinish();
      if (err) handlers.onError && handlers.onError(err);
      else handlers.onEnd && handlers.onEnd();
    }

    var watchdog = setTimeout(function () {
      if (!gotData && !finished) {
        finish(new Error('连接 AI 服务超时（60 秒没有任何数据）'));
        try { req.destroy(); } catch (e) {}
      }
    }, 60000);

    var req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CFG.apiKey,
        'Accept': 'text/event-stream',
        'Content-Length': byteLength(payload),
      },
    }, function (up) {
      if (up.statusCode !== 200) {
        var raw = '';
        up.setEncoding && up.setEncoding('utf8');
        up.on('data', function (c) { raw += c; });
        up.on('end', function () {
          clearTimeout(watchdog);
          finish(new Error('AI 服务返回 ' + up.statusCode + '：' + briefApiError(raw)));
        });
        return;
      }
      var buffer = '';
      up.setEncoding && up.setEncoding('utf8');
      up.on('data', function (c) {
        gotData = true;
        buffer += c;
        var lines = buffer.split('\n');
        buffer = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf('data:') !== 0) continue;
          var data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          var j;
          try { j = JSON.parse(data); } catch (e) { continue; }
          var d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (d && handlers.onDelta) handlers.onDelta(d);
        }
      });
      up.on('end', function () { clearTimeout(watchdog); finish(); });
      up.on('error', function (e) { clearTimeout(watchdog); finish(e); });
    });
    req.setTimeout(120000, function () {
      finish(new Error('AI 服务响应超时'));
      try { req.destroy(); } catch (e) {}
    });
    req.on('error', function (e) { clearTimeout(watchdog); finish(e); });
    req.write(payload);
    req.end();

    return function () { clearTimeout(watchdog); try { req.destroy(); } catch (e) {} };
  }

  function briefApiError(raw) {
    var s = String(raw || '').slice(0, 300);
    try {
      var j = JSON.parse(raw);
      s = (j.error && (j.error.message || j.error.code)) || j.message || s;
    } catch (e) {}
    return s;
  }

  /* ---------------- 直连模式的业务分发（chat / ask / agent） ---------------- */

  function directHandle(path, body, handlers) {
    if (!hasKey()) {
      setTimeout(function () {
        handlers.onFinish && handlers.onFinish();
        handlers.onError && handlers.onError(new Error('NO_CONFIG'));
      }, 0);
      return function () {};
    }

    if (path === '/agent') return directAgent(body, handlers);

    var messages;
    if (path === '/chat') {
      messages = DP.buildChatMessages({ history: body.messages, context: body.context, selection: body.selection });
    } else {
      messages = DP.buildMessages(body.scene, {
        text: String(body.text || ''),
        question: String(body.question || ''),
        history: body.history,
        context: body.context,
      });
    }
    return directRequest({ messages: messages }, handlers);
  }

  function directAgent(body, handlers) {
    var aborted = { v: false };
    var abortFn = null;

    var task = String(body.task || '');
    var docText = String((body.context && body.context.docText) || '');
    var selection = String(body.selection || '');

    var planAcc = '';
    abortFn = directRequest({
      messages: [
        { role: 'system', content: DP.AGENT_PLAN_SYSTEM },
        { role: 'user', content: DP.agentPlanPrompt({ task: task, selection: selection, docText: docText }) },
      ],
      temperature: 0.3,
    }, {
      onDelta: function (d) { planAcc += d; },
      onFinish: function () { handlers.onFinish && handlers.onFinish(); },
      onEnd: function () {
        if (aborted.v) return;
        var steps = DP.parsePlan(planAcc) || [{ title: '执行任务', goal: task }];
        handlers.onPlan && handlers.onPlan({ steps: steps.map(function (s) { return s.title; }) });

        var results = [];
        var i = 0;
        (function next() {
          if (aborted.v) return;
          if (i >= steps.length) { handlers.onEnd && handlers.onEnd(); return; }
          var idx = i++;
          handlers.onStepStart && handlers.onStepStart({ i: idx, total: steps.length, title: steps[idx].title, goal: steps[idx].goal });
          var acc = '';
          abortFn = directRequest({
            messages: [
              { role: 'system', content: DP.AGENT_STEP_SYSTEM },
              { role: 'user', content: DP.agentStepPrompt({ task: task, step: steps[idx], index: idx, total: steps.length, prevResults: results, selection: selection, docText: docText }) },
            ],
          }, {
            onDelta: function (d) {
              acc += d;
              handlers.onDelta && handlers.onDelta(d, idx);
            },
            onFinish: function () { handlers.onFinish && handlers.onFinish(); },
            onEnd: function () {
              results[idx] = acc || '（这一步没有产出）';
              handlers.onStepEnd && handlers.onStepEnd({ i: idx });
              next();
            },
            onError: function (err) {
              results[idx] = '';
              handlers.onError && handlers.onError(err);
              next(); // 单步失败不拖垮整个任务
            },
          });
        })();
      },
      onError: function (err) { handlers.onError && handlers.onError(err); },
    });

    return function () {
      aborted.v = true;
      try { abortFn && abortFn(); } catch (e) {}
    };
  }

  /* ---------------- 统一入口：优先桥接，失败自动降级直连 ---------------- */

  function aiPost(path, body, handlers) {
    if (MODE === 'direct') return directHandle(path, body, handlers);

    var retried = false;
    var wrapped = {};
    for (var k in handlers) wrapped[k] = handlers[k];
    wrapped.onError = function (err) {
      var msg = String((err && err.message) || err);
      if (!retried && window.reqnode &&
          /ECONNREFUSED|socket hang up|Failed to fetch|桥接/i.test(msg)) {
        retried = true;
        MODE = 'direct';
        updateStatus();
        state.abort = directHandle(path, body, handlers);
        return;
      }
      handlers.onError && handlers.onError(err);
    };
    return request('POST', path, body, wrapped);
  }

  /* ======================================================================
   * 内容提取
   * ==================================================================== */

  function getSelectionText() {
    var sel = window.getSelection();
    return sel ? String(sel).trim() : '';
  }

  function getEditor() {
    return document.querySelector('#write') || document.querySelector('#typora-source');
  }

  function getDocText() {
    var el = getEditor();
    if (!el) return '';
    var t = el.innerText || el.textContent || '';
    t = t.replace(/\u00a0/g, ' ').trim();
    var max = Number(CFG.maxContextChars) || 12000;
    return t.length > max ? t.slice(0, max) : t;
  }

  function getFilePath() {
    try {
      if (window.File) {
        if (typeof window.File.getFilePath === 'function') return window.File.getFilePath() || '';
        if (window.File.bundle && window.File.bundle.filePath) return window.File.bundle.filePath;
        if (window.File.filePath) return window.File.filePath;
      }
    } catch (e) {}
    try {
      if (window.utils && typeof window.utils.getFilePath === 'function') return window.utils.getFilePath() || '';
    } catch (e) {}
    return '';
  }

  function getTitle() {
    var p = getFilePath();
    if (p) return p.split(/[\\/]/).pop();
    return document.title || '';
  }

  function currentContext() {
    return { filePath: getFilePath(), title: getTitle(), docText: getDocText() };
  }

  /* ======================================================================
   * 会话存储
   * ==================================================================== */

  function loadSessions() {
    try { state.sessions = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') || []; } catch (e) { state.sessions = []; }
    if (!state.sessions.length) state.sessions.push(newSession('新对话'));
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY + '.cur'); } catch (e) {}
    state.curId = state.sessions.some(function (s) { return s.id === saved; }) ? saved : state.sessions[0].id;
  }

  function saveSessions() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.sessions.slice(0, MAX_SESSIONS)));
      localStorage.setItem(STORE_KEY + '.cur', state.curId || '');
    } catch (e) {}
  }

  function newSession(title) {
    return { id: uid(), title: title || '新对话', ts: Date.now(), messages: [] };
  }

  function curSession() {
    for (var i = 0; i < state.sessions.length; i++) if (state.sessions[i].id === state.curId) return state.sessions[i];
    return state.sessions[0];
  }

  /* ======================================================================
   * 元数据
   * ==================================================================== */

  var SCENE_LIST = [
    { id: 'explain', label: '解释', desc: '拆解概念，配类比', icon: 'bulb' },
    { id: 'translate', label: '翻译', desc: '中英互译，附术语表', icon: 'globe' },
    { id: 'plain', label: '说人话', desc: '大白话重讲一遍', icon: 'chat' },
    { id: 'summarize', label: '总结', desc: '主旨 + 核心要点', icon: 'lines' },
    { id: 'outline', label: '大纲', desc: '梳理层级结构', icon: 'tree' },
    { id: 'quiz', label: '考考我', desc: '出题检验掌握度', icon: 'quiz' },
  ];

  var AGENT_CHIPS = [
    '整理成复习笔记',
    '用费曼技巧讲明白核心概念',
    '基于文档出一份测验卷',
    '找出我没读懂的部分并补背景',
  ];

  function sceneLabel(scene) {
    for (var i = 0; i < SCENE_LIST.length; i++) if (SCENE_LIST[i].id === scene) return SCENE_LIST[i].label;
    return 'AI';
  }

  function detectTheme() {
    try {
      var bg = getComputedStyle(document.body).backgroundColor || '';
      var m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (m) return ((0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255) < 0.5 ? 'dark' : 'light';
    } catch (e) {}
    return 'light';
  }

  /* ======================================================================
   * UI 构建
   * ==================================================================== */

  function homeHTML() {
    var cards = [
      { tab: 'chat', icon: 'chat', title: '对话', desc: '选中正文随时提问，多轮记住上下文' },
      { tab: 'agent', icon: 'spark', title: '智能体', desc: '拆解学习任务，多步执行再汇总' },
      { tab: 'quick', icon: 'bolt', title: '快捷', desc: '解释 / 翻译 / 说人话 / 总结…' },
    ];
    return '<div class="tyai-home">' +
      '<h1 class="tyai-hello">你好，<br>我今天能帮你什么？</h1>' +
      cards.map(function (c) {
        return '<button class="tyai-card" data-go="' + c.tab + '">' +
          '<span class="tyai-card-ic">' + icon(c.icon, 18) + '</span>' +
          '<span class="tyai-card-tx"><b>' + c.title + '</b><i>' + c.desc + '</i></span>' +
          '<span class="tyai-card-go">' + icon('arrow', 16) + '</span>' +
          '</button>';
      }).join('') +
      '<p class="tyai-tip">在正文里选中文字，会弹出小浮窗，可直接解释、翻译或追问。</p>' +
      '</div>';
  }

  function buildUI() {
    root = document.createElement('div');
    root.id = 'tyai-root';
    root.setAttribute('data-theme', detectTheme());
    root.innerHTML =
      '<div id="tyai-ball" class="tyai-ball" title="xff助手一号 · Ctrl+Alt+K">' + logoMark(40) + '</div>' +
      '<div id="tyai-bubble" class="tyai-bubble"></div>' +

      '<div id="tyai-panel" class="tyai-panel">' +

      '  <div class="tyai-head">' +
      '    <span class="tyai-logo">' + logoMark(26) + '</span>' +
      '    <span class="tyai-title">xff助手一号</span>' +
      '    <span class="tyai-status" id="tyai-status">连接中…</span>' +
      '    <button class="tyai-icobtn" id="tyai-sess-btn" title="历史会话">' + icon('history', 17) + '</button>' +
      '    <span class="tyai-x" id="tyai-close" title="关闭">' + icon('x', 16) + '</span>' +
      '  </div>' +

      '  <div class="tyai-seg" id="tyai-seg">' +
      '    <button data-tab="chat" class="on">对话</button>' +
      '    <button data-tab="agent">智能体</button>' +
      '    <button data-tab="quick">快捷</button>' +
      '  </div>' +

      '  <div class="tyai-body">' +

      // ---------- 对话 ----------
      '    <div class="tyai-view tyai-view-chat on" id="tyai-view-chat">' +
      '      <div class="tyai-scroll tyai-msgs" id="tyai-msgs"></div>' +
      '    </div>' +

      // ---------- 智能体 ----------
      '    <div class="tyai-view tyai-view-agent" id="tyai-view-agent">' +
      '      <div class="tyai-chips" id="tyai-chips">' +
      AGENT_CHIPS.map(function (c) { return '<button class="tyai-chip">' + esc(c) + '</button>'; }).join('') +
      '      </div>' +
      '      <div class="tyai-agent-hint" id="tyai-agent-hint"></div>' +
      '      <div class="tyai-scroll tyai-timeline" id="tyai-timeline"></div>' +
      '    </div>' +

      // ---------- 快捷 ----------
      '    <div class="tyai-view tyai-view-quick" id="tyai-view-quick">' +
      '      <div class="tyai-scroll tyai-quickwrap">' +
      '        <div class="tyai-scenes">' +
      SCENE_LIST.map(function (s) {
        return '<button class="tyai-scene" data-scene="' + s.id + '">' +
          '<span class="tyai-scene-ic">' + icon(s.icon, 17) + '</span>' +
          '<b>' + s.label + '</b><i>' + s.desc + '</i></button>';
      }).join('') +
      '        </div>' +
      '        <div class="tyai-ctx" id="tyai-ctx"></div>' +
      '        <div class="tyai-quick-result" id="tyai-quick-result"></div>' +
      '      </div>' +
      '    </div>' +

      '  </div>' +

      // ---------- 输入区 ----------
      '  <div class="tyai-foot">' +
      '    <div class="tyai-actions" id="tyai-actions">' +
      '      <button data-act="copy">' + icon('copy', 14) + '复制</button>' +
      '      <button data-act="insert">' + icon('insert', 14) + '插入文档</button>' +
      '      <button data-act="redo">' + icon('redo', 14) + '重新生成</button>' +
      '    </div>' +
      '    <div class="tyai-box" id="tyai-box">' +
      '      <textarea id="tyai-input" rows="1" placeholder="问点什么…"></textarea>' +
      '      <div class="tyai-boxbar">' +
      '        <button class="tyai-pill" id="tyai-model-pill" title="切换模型">' +
      '          <span class="tyai-pill-ic">' + icon('model', 14) + '</span>' +
      '          <span id="tyai-model-name">deepseek-chat</span><i class="tyai-caret"></i>' +
      '        </button>' +
      '        <button class="tyai-icobtn" id="tyai-cfg-btn" title="配置模型与 API Key">' + icon('gear', 16) + '</button>' +
      '        <span class="tyai-grow"></span>' +
      '        <button class="tyai-send" id="tyai-send" title="发送（Enter）">' + icon('send', 17) + '</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      // ---------- 弹层：模型 / 会话 ----------
      '  <div class="tyai-pop" id="tyai-pop-model" hidden></div>' +
      '  <div class="tyai-pop" id="tyai-pop-sess" hidden></div>' +

      // ---------- 设置抽屉 ----------
      '  <div class="tyai-sheet" id="tyai-sheet" hidden>' +
      '    <div class="tyai-mask" id="tyai-sheet-mask"></div>' +
      '    <div class="tyai-sheet-panel">' +
      '      <div class="tyai-sheet-head"><b>模型与配置</b><span class="tyai-x" id="tyai-sheet-close">' + icon('x', 15) + '</span></div>' +
      '      <div class="tyai-sheet-body tyai-scroll">' +
      '        <label class="tyai-field"><span>服务商</span><select id="tyai-f-provider"></select></label>' +
      '        <label class="tyai-field"><span>Base URL</span><input id="tyai-f-baseurl" spellcheck="false" placeholder="https://api.deepseek.com"></label>' +
      '        <label class="tyai-field"><span>模型</span><input id="tyai-f-model" spellcheck="false" list="tyai-model-list" placeholder="deepseek-chat"><datalist id="tyai-model-list"></datalist></label>' +
      '        <label class="tyai-field"><span>API Key</span><span class="tyai-keywrap"><input id="tyai-f-key" type="password" spellcheck="false" placeholder="sk-..."><button class="tyai-icobtn" id="tyai-f-eye" title="显示/隐藏">' + icon('eye', 15) + '</button></span></label>' +
      '        <label class="tyai-field"><span>温度 <i id="tyai-f-tempv">0.7</i></span><input id="tyai-f-temp" type="range" min="0" max="1.5" step="0.1"></label>' +
      '        <label class="tyai-field"><span>上下文上限（字符）</span><input id="tyai-f-maxctx" type="number" min="1000" max="200000" step="1000"></label>' +
      '        <p class="tyai-note">Key 只保存在本机 Typora 的本地存储里，不会上传到任何服务器；换一台电脑需要重新填一次。</p>' +
      '        <div class="tyai-testbox" id="tyai-testbox"></div>' +
      '      </div>' +
      '      <div class="tyai-sheet-foot">' +
      '        <button class="tyai-btn" id="tyai-f-test">测试连接</button>' +
      '        <button class="tyai-btn primary" id="tyai-f-save">保存</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      '</div>';

    document.body.appendChild(root);

    ball = $('tyai-ball');
    panel = $('tyai-panel');
    bubble = $('tyai-bubble');
    statusEl = $('tyai-status');
    composerInput = $('tyai-input');
    els.msgs = $('tyai-msgs');
    els.timeline = $('tyai-timeline');
    els.quickResult = $('tyai-quick-result');
    els.ctx = $('tyai-ctx');
    els.actions = $('tyai-actions');
    els.modelName = $('tyai-model-name');
    els.popModel = $('tyai-pop-model');
    els.popSess = $('tyai-pop-sess');
    els.sheet = $('tyai-sheet');

    bindUI();
    loadSessions();
    syncModelUI();
    renderChat();
    updateStatus();
    updateActions();
    switchTab(state.tab);
  }

  /* ---------------------------- 事件绑定 ---------------------------- */

  function bindUI() {
    ball.addEventListener('mousedown', startDrag);
    ball.addEventListener('click', function () {
      if (ball.dataset.dragged === '1') { ball.dataset.dragged = '0'; return; }
      togglePanel();
    });

    $('tyai-close').addEventListener('click', function () { togglePanel(false); });

    // 选中浮窗
    bubble.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var scene = btn.getAttribute('data-scene');
      hideBubble();
      if (scene) runScene(scene, state.lastSelection);
      else if (btn.getAttribute('data-act') === 'chat') {
        switchTab('chat');
        composerInput.value = '关于我选中的这段内容：\n「' + (state.lastSelection || '').slice(0, 500) + '」\n';
        autoGrow();
        togglePanel(true);
        setTimeout(function () { composerInput.focus(); }, 150);
      }
    });

    // 模式切换
    $('tyai-seg').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-tab]');
      if (btn) switchTab(btn.getAttribute('data-tab'));
    });

    // 首页卡片
    els.msgs.addEventListener('click', function (e) {
      var card = e.target.closest('.tyai-card');
      if (card) switchTab(card.getAttribute('data-go'));
    });

    // 输入区
    $('tyai-send').addEventListener('click', onPrimaryAction);
    composerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onPrimaryAction(); }
    });
    composerInput.addEventListener('input', autoGrow);

    // 模型 / 配置
    $('tyai-model-pill').addEventListener('click', function (e) { e.stopPropagation(); toggleModelPop(); });
    $('tyai-cfg-btn').addEventListener('click', function () { openSheet(); });
    $('tyai-f-eye').addEventListener('click', function () {
      var el = $('tyai-f-key');
      var pw = el.type === 'password';
      el.type = pw ? 'text' : 'password';
      this.innerHTML = icon(pw ? 'eyeoff' : 'eye', 15);
    });
    $('tyai-f-provider').addEventListener('change', onProviderChange);
    $('tyai-f-temp').addEventListener('input', function () { $('tyai-f-tempv').textContent = this.value; });
    $('tyai-f-test').addEventListener('click', doTestConnection);
    $('tyai-f-save').addEventListener('click', saveSheet);
    $('tyai-sheet-close').addEventListener('click', closeSheet);
    $('tyai-sheet-mask').addEventListener('click', closeSheet);

    // 会话
    $('tyai-sess-btn').addEventListener('click', function (e) { e.stopPropagation(); toggleSessPop(); });

    // 结果操作
    els.actions.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'copy') copyText(currentResultText());
      else if (act === 'insert') insertToDoc(currentResultText());
      else if (act === 'redo') redoCurrent();
    });

    // 智能体快捷词
    $('tyai-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.tyai-chip');
      if (chip) { composerInput.value = chip.textContent; composerInput.focus(); autoGrow(); }
    });

    // 快捷场景
    $('tyai-view-quick').querySelector('.tyai-scenes').addEventListener('click', function (e) {
      var btn = e.target.closest('.tyai-scene');
      if (btn) runScene(btn.getAttribute('data-scene'));
    });

    // 点空白关闭弹层
    document.addEventListener('mousedown', function (e) {
      if (!els.popModel.hidden && !els.popModel.contains(e.target) && !$('tyai-model-pill').contains(e.target)) els.popModel.hidden = true;
      if (!els.popSess.hidden && !els.popSess.contains(e.target) && !$('tyai-sess-btn').contains(e.target)) els.popSess.hidden = true;
      if (bubble.classList.contains('on') && !bubble.contains(e.target)) hideBubble();
    });

    // 快捷键
    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        togglePanel();
      }
      if (e.key === 'Escape') {
        if (bubble.classList.contains('on')) hideBubble();
        else if (!els.popModel.hidden || !els.popSess.hidden) { els.popModel.hidden = true; els.popSess.hidden = true; }
        else if (!els.sheet.hidden) closeSheet();
        else if (state.open) togglePanel(false);
      }
    }, true);

    // 选中浮窗触发
    document.addEventListener('selectionchange', onSelectionChange);

    // 跟随 Typora 主题
    new MutationObserver(function () {
      var t = detectTheme();
      if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function autoGrow() {
    composerInput.style.height = 'auto';
    composerInput.style.height = Math.min(composerInput.scrollHeight, 140) + 'px';
  }

  /* ---------------------------- 模型切换弹层 ---------------------------- */

  function toggleModelPop() {
    if (!els.popModel.hidden) { els.popModel.hidden = true; return; }
    els.popSess.hidden = true;
    renderModelPop();
    els.popModel.hidden = false;
  }

  function renderModelPop() {
    var html = '<div class="tyai-pop-title">选择模型</div>';
    PROVIDERS.forEach(function (p) {
      if (!p.models.length) return;
      html += '<div class="tyai-pop-group">' + esc(p.name) + '</div>';
      p.models.forEach(function (m) {
        var on = (CFG.model === m) ? ' on' : '';
        html += '<button class="tyai-pop-item' + on + '" data-model="' + esc(m) + '" data-prop="' + p.id + '" data-base="' + esc(p.baseUrl) + '">' +
          '<span>' + esc(m) + '</span>' + (on ? icon('check', 14) : '') + '</button>';
      });
    });
    html += '<div class="tyai-pop-sep"></div>' +
      '<button class="tyai-pop-item" data-open-cfg="1">' + icon('gear', 15) + '<span>配置模型与 API Key</span></button>';

    els.popModel.innerHTML = html;
    els.popModel.querySelectorAll('.tyai-pop-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-open-cfg')) { els.popModel.hidden = true; openSheet(); return; }
        CFG.model = btn.getAttribute('data-model');
        var prop = btn.getAttribute('data-prop');
        var base = btn.getAttribute('data-base');
        if (prop && providerOf(prop).baseUrl) { CFG.provider = prop; CFG.baseUrl = base; }
        saveCfg();
        syncModelUI();
        updateStatus();
        els.popModel.hidden = true;
        flash('已切换到 ' + CFG.model);
      });
    });
  }

  function syncModelUI() {
    els.modelName.textContent = CFG.model || '未配置模型';
    var pill = $('tyai-model-pill');
    var needKey = (MODE === 'direct') && !hasKey();
    pill.classList.toggle('warn', needKey);
    pill.title = needKey ? '还没填 API Key，点右侧齿轮配置' : ('当前模型：' + CFG.model + '（点击切换）');
  }

  /* ---------------------------- 设置抽屉 ---------------------------- */

  function openSheet() {
    els.popModel.hidden = true;
    els.popSess.hidden = true;

    var sel = $('tyai-f-provider');
    sel.innerHTML = PROVIDERS.map(function (p) {
      return '<option value="' + p.id + '">' + esc(p.name) + '</option>';
    }).join('');
    sel.value = providerOf(CFG.provider).id;

    $('tyai-f-baseurl').value = CFG.baseUrl || '';
    $('tyai-f-model').value = CFG.model || '';
    $('tyai-f-key').value = CFG.apiKey || '';
    $('tyai-f-key').type = 'password';
    $('tyai-f-eye').innerHTML = icon('eye', 15);
    $('tyai-f-temp').value = Number(CFG.temperature) || 0.7;
    $('tyai-f-tempv').textContent = Number(CFG.temperature) || 0.7;
    $('tyai-f-maxctx').value = Number(CFG.maxContextChars) || 12000;
    $('tyai-testbox').innerHTML = '';
    refreshModelList();
    els.sheet.hidden = false;
  }

  function closeSheet() { els.sheet.hidden = true; }

  function refreshModelList() {
    var p = providerOf($('tyai-f-provider').value);
    $('tyai-model-list').innerHTML = p.models.map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
  }

  function onProviderChange() {
    var p = providerOf(this.value);
    if (p.baseUrl) $('tyai-f-baseurl').value = p.baseUrl;
    if (p.models.length && !p.models.some(function (m) { return m === $('tyai-f-model').value; })) {
      $('tyai-f-model').value = p.models[0];
    }
    refreshModelList();
  }

  function sheetCfg() {
    return {
      provider: $('tyai-f-provider').value,
      baseUrl: String($('tyai-f-baseurl').value || '').trim(),
      model: String($('tyai-f-model').value || '').trim(),
      apiKey: String($('tyai-f-key').value || '').trim(),
      temperature: Number($('tyai-f-temp').value),
      maxContextChars: Number($('tyai-f-maxctx').value) || 12000,
    };
  }

  function saveSheet() {
    var c = sheetCfg();
    if (!c.baseUrl) { testNote('请填写 Base URL', 'err'); return; }
    if (!c.model) { testNote('请填写模型名', 'err'); return; }
    CFG = c;
    saveCfg();
    syncModelUI();
    updateStatus();
    closeSheet();
    flash('配置已保存');
  }

  function testNote(msg, kind) {
    $('tyai-testbox').innerHTML = '<div class="tyai-testnote' + (kind ? ' is-' + kind : '') + '">' + esc(msg) + '</div>';
  }

  function doTestConnection() {
    var c = sheetCfg();
    if (!c.baseUrl || !c.model) return testNote('请先填 Base URL 和模型名', 'err');
    if (!c.apiKey) return testNote('请先填 API Key', 'err');
    testNote('正在连接…');
    testConnection(c, function (err) {
      if (err) testNote('连接失败：' + String(err.message || err), 'err');
      else testNote('连接成功，模型可用 ✔', 'ok');
    });
  }

  function testConnection(cfg, cb) {
    var reqnode = window.reqnode;
    if (!reqnode) return cb(new Error('当前环境不支持直连测试'));
    var url;
    try { url = new URL(String(cfg.baseUrl).replace(/\/+$/, '') + '/chat/completions'); }
    catch (e) { return cb(new Error('Base URL 不合法')); }

    var body = JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
      stream: false,
    });
    var transport = url.protocol === 'http:' ? reqnode('http') : reqnode('https');
    var done = false;
    function fin(err) { if (done) return; done = true; cb(err); }

    var req = transport.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Length': byteLength(body),
      },
    }, function (res) {
      var raw = '';
      res.setEncoding && res.setEncoding('utf8');
      res.on('data', function (d) { raw += d; });
      res.on('end', function () {
        if (res.statusCode >= 200 && res.statusCode < 300) return fin(null);
        var hint = res.statusCode === 401 ? '（API Key 无效或未授权）'
          : res.statusCode === 404 ? '（模型名或 Base URL 可能不对）' : '';
        fin(new Error('HTTP ' + res.statusCode + hint + ' ' + briefApiError(raw)));
      });
    });
    req.setTimeout(20000, function () { fin(new Error('测试超时')); try { req.destroy(); } catch (e) {} });
    req.on('error', function (e) { fin(e); });
    req.write(body);
    req.end();
  }

  /* ---------------------------- 会话弹层 ---------------------------- */

  function toggleSessPop() {
    if (!els.popSess.hidden) { els.popSess.hidden = true; return; }
    els.popModel.hidden = true;
    renderSessPop();
    els.popSess.hidden = false;
  }

  function renderSessPop() {
    els.popSess.innerHTML =
      '<div class="tyai-pop-title">历史会话<button class="tyai-pop-new" id="tyai-sess-new">＋ 新建</button></div>' +
      '<div class="tyai-sess-list">' + state.sessions.map(function (s) {
        return '<div class="tyai-sess-item' + (s.id === state.curId ? ' on' : '') + '" data-id="' + s.id + '">' +
          '<span>' + esc(s.title) + '</span><i>' + new Date(s.ts).toLocaleDateString() + '</i></div>';
      }).join('') + '</div>' +
      '<div class="tyai-pop-sep"></div>' +
      '<button class="tyai-pop-item" id="tyai-sess-del">' + icon('x', 14) + '<span>删除当前会话</span></button>';

    $('tyai-sess-new').addEventListener('click', function (e) {
      e.stopPropagation();
      var s = newSession('新对话');
      state.sessions.unshift(s);
      state.curId = s.id;
      saveSessions();
      renderChat();
      els.popSess.hidden = true;
      composerInput.focus();
    });
    $('tyai-sess-del').addEventListener('click', function () {
      if (state.sessions.length <= 1) state.sessions = [newSession('新对话')];
      else state.sessions = state.sessions.filter(function (s) { return s.id !== state.curId; });
      state.curId = state.sessions[0].id;
      saveSessions();
      renderChat();
      els.popSess.hidden = true;
    });
    els.popSess.querySelectorAll('.tyai-sess-item').forEach(function (item) {
      item.addEventListener('click', function () {
        state.curId = item.getAttribute('data-id');
        saveSessions();
        renderChat();
        els.popSess.hidden = true;
      });
    });
  }

  /* ---------------------------- 选中浮窗 ---------------------------- */

  var bubbleTimer = null;

  function onSelectionChange() {
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    bubbleTimer = setTimeout(function () {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hideBubble(); return; }
      var range = sel.getRangeAt(0);
      var editor = getEditor();
      if (!editor || !editor.contains(range.commonAncestorContainer)) { hideBubble(); return; }
      var text = String(sel).trim();
      if (!text) { hideBubble(); return; }
      state.lastSelection = text;
      state.lastRange = range.cloneRange();
      showBubble(range);
    }, 250);
  }

  function showBubble(range) {
    bubble.innerHTML = SCENE_LIST.slice(0, 4).map(function (s) {
      return '<button data-scene="' + s.id + '" title="' + s.desc + '">' + s.label + '</button>';
    }).join('') + '<button data-act="chat" title="拿去问 AI">' + icon('chat', 13) + '</button>';
    bubble.classList.add('on');
    var bw = bubble.offsetWidth || 240;
    var x = clamp(range.getBoundingClientRect().left + range.getBoundingClientRect().width / 2 - bw / 2, 8, window.innerWidth - bw - 8);
    var y = range.getBoundingClientRect().top - 46;
    if (y < 8) y = range.getBoundingClientRect().bottom + 10;
    bubble.style.left = x + 'px';
    bubble.style.top = y + 'px';
  }

  function hideBubble() { bubble.classList.remove('on'); }

  /* ---------------------------- 面板与标签 ---------------------------- */

  function togglePanel(force) {
    state.open = typeof force === 'boolean' ? force : !state.open;
    panel.classList.toggle('on', state.open);
    root.classList.toggle('panel-on', state.open);
    if (state.open) {
      hideBubble();
      els.popModel.hidden = true;
      els.popSess.hidden = true;
      composerInput.focus();
      // 首次使用且确实没有可用 Key 时，主动弹出配置（桥接模式下 Key 在服务端，不需要）
      if (MODE === 'direct' && !hasKey() && !localStorage.getItem('tyai.onboarded')) {
        try { localStorage.setItem('tyai.onboarded', '1'); } catch (e) {}
        setTimeout(openSheet, 260);
      }
    }
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('#tyai-seg button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.tyai-view').forEach(function (v) {
      v.classList.toggle('on', v.id === 'tyai-view-' + tab);
    });
    if (tab === 'chat') composerInput.placeholder = '问点什么…（Enter 发送）';
    else if (tab === 'agent') composerInput.placeholder = '描述你的学习任务，例如：把这篇文档整理成复习笔记';
    else composerInput.placeholder = '针对选中内容追问…';
    if (tab === 'quick') renderContext();
    updateActions();
  }

  function updateStatus() {
    if (MODE === 'direct') {
      if (!hasKey()) return setStatus('未配置 Key', 'warn');
      return setStatus(CFG.model + ' · 就绪', 'ok');
    }
    rawRequest('GET', '/health', null, function (err, text) {
      if (err) {
        if (hasKey()) { MODE = 'direct'; return updateStatus(); }
        return setStatus('桥接未启动', 'err');
      }
      try {
        var h = JSON.parse(text);
        setStatus(h.configured ? h.model : '未配置 Key', h.configured ? 'ok' : 'warn');
      } catch (e) { setStatus('桥接异常', 'err'); }
    });
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'tyai-status' + (kind ? ' is-' + kind : '');
  }

  /* ---------------------------- 结果动作 ---------------------------- */

  function currentResultText() {
    if (state.tab === 'agent') return agentAllText();
    if (state.tab === 'quick') return state.lastResult;
    var s = curSession();
    for (var i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === 'assistant' && s.messages[i].content) return s.messages[i].content;
    }
    return '';
  }

  function redoCurrent() {
    if (state.busy) return;
    if (state.tab === 'agent') {
      if (state.lastAgentTask) runAgent(state.lastAgentTask);
      else flash('还没有任务可重跑');
      return;
    }
    if (state.tab === 'quick') {
      if (state.lastScene) runScene(state.lastScene);
      else flash('还没有可重答的内容');
      return;
    }
    var s = curSession();
    for (var i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === 'user') {
        // 去掉这条提问与之后的回答，重新发一次
        var q = s.messages[i].content;
        s.messages = s.messages.slice(0, i);
        saveSessions();
        renderChat();
        composerInput.value = q;
        sendChat();
        return;
      }
    }
    flash('还没有可重新生成的回答');
  }

  function updateActions() {
    els.actions.classList.toggle('on', !!currentResultText());
  }

  /* ---------------------------- 对话模式 ---------------------------- */

  function renderChat() {
    var s = curSession();
    if (!s.messages.length) {
      els.msgs.innerHTML = homeHTML();
      updateActions();
      return;
    }
    els.msgs.innerHTML = s.messages.map(function (m, i) { return msgHTML(m.role, m.content, i); }).join('');
    scrollBottom(els.msgs);
    updateActions();
  }

  function msgHTML(role, content, idx) {
    var isUser = role === 'user';
    return '<div class="tyai-msg tyai-msg-' + (isUser ? 'user' : 'assistant') + '" data-idx="' + idx + '">' +
      '<div class="tyai-msg-avatar">' + (isUser ? '你' : logoMark(24)) + '</div>' +
      '<div class="tyai-msg-body"><div class="tyai-msg-text">' +
      (isUser ? '<p>' + esc(content).replace(/\n/g, '<br>') + '</p>' : mdToHtml(content)) +
      '</div></div></div>';
  }

  function scrollBottom(el) { el.scrollTop = el.scrollHeight; }

  function sendChat() {
    var q = composerInput.value.trim();
    if (!q || state.busy) return;
    var s = curSession();
    s.messages.push({ role: 'user', content: q });
    if (s.messages.length === 1) s.title = q.slice(0, 18) || '新对话';
    if (s.messages.length > MAX_TURNS) s.messages = s.messages.slice(-MAX_TURNS);
    saveSessions();

    if (els.msgs.querySelector('.tyai-home')) els.msgs.innerHTML = '';
    els.msgs.insertAdjacentHTML('beforeend', msgHTML('user', q, s.messages.length - 1));
    composerInput.value = '';
    composerInput.style.height = 'auto';
    scrollBottom(els.msgs);

    var idx = s.messages.length;
    els.msgs.insertAdjacentHTML('beforeend',
      '<div class="tyai-msg tyai-msg-assistant" data-idx="' + idx + '"><div class="tyai-msg-avatar">' + logoMark(24) + '</div>' +
      '<div class="tyai-msg-body"><div class="tyai-msg-text"><div class="tyai-loading"><span></span><span></span><span></span></div></div></div></div>');
    var textEl = els.msgs.querySelector('[data-idx="' + idx + '"] .tyai-msg-text');
    scrollBottom(els.msgs);
    updateActions();

    setBusy(true);
    var acc = '';

    state.abort = aiPost('/chat', {
      messages: s.messages.map(function (m) { return { role: m.role, content: m.content }; }),
      selection: state.lastSelection || '',
      context: currentContext(),
    }, {
      onFinish: function () { setBusy(false); updateActions(); },
      onDelta: function (d) {
        acc += d;
        textEl.innerHTML = mdToHtml(acc);
        scrollBottom(els.msgs);
      },
      onError: function (err) {
        if (needsSetup(err)) { textEl.innerHTML = '<div class="tyai-err">' + esc(errText(err)) + '<button class="tyai-inline-btn" data-open-cfg="1">去配置</button></div>'; }
        else textEl.innerHTML = '<div class="tyai-err">' + esc(errText(err)) + '</div>';
        if (acc) s.messages.push({ role: 'assistant', content: acc });
        saveSessions();
      },
      onEnd: function () {
        if (acc) s.messages.push({ role: 'assistant', content: acc });
        else if (!textEl.querySelector('.tyai-err')) textEl.innerHTML = '<p class="tyai-empty">模型没有返回内容。</p>';
        saveSessions();
        updateActions();
      },
    });
  }

  /* ---------------------------- 智能体模式 ---------------------------- */

  function agentAllText() {
    var task = state.lastAgentTask;
    if (!task && !state.agentResult.length) return '';
    var out = ['> **智能体任务：' + (task || '') + '**', ''];
    state.agentResult.forEach(function (r, i) {
      if (!r) return;
      out.push('**第 ' + (i + 1) + ' 步**', '', r, '');
    });
    return out.join('\n').trim();
  }

  function runAgent(task) {
    if (state.busy || !task) return;
    state.lastAgentTask = task;
    state.agentResult = [];
    els.timeline.innerHTML = '';
    $('tyai-agent-hint').textContent = '';
    setBusy(true);

    var stepCards = {};
    var currentTextEl = null;

    state.abort = aiPost('/agent', {
      task: task,
      selection: state.lastSelection || '',
      context: currentContext(),
    }, {
      onPlan: function (plan) {
        $('tyai-agent-hint').textContent = '拆成 ' + plan.steps.length + ' 步：' + plan.steps.join(' → ');
      },
      onStepStart: function (s) {
        els.timeline.insertAdjacentHTML('beforeend',
          '<div class="tyai-step" data-step="' + s.i + '">' +
          '<div class="tyai-step-head"><span class="tyai-step-dot"></span><b>' + (s.i + 1) + '/' + s.total + ' · ' + esc(s.title) + '</b>' +
          '<i class="tyai-step-goal">' + esc(s.goal || '') + '</i></div>' +
          '<div class="tyai-step-body"><div class="tyai-loading"><span></span><span></span><span></span></div></div></div>');
        stepCards[s.i] = els.timeline.querySelector('[data-step="' + s.i + '"]');
        currentTextEl = stepCards[s.i].querySelector('.tyai-step-body');
        scrollBottom(els.timeline);
      },
      onDelta: function (d, step) {
        if (currentTextEl && step != null) {
          state.agentResult[step] = (state.agentResult[step] || '') + d;
          currentTextEl.innerHTML = mdToHtml(state.agentResult[step]);
          scrollBottom(els.timeline);
        }
      },
      onStepEnd: function (s) {
        var card = stepCards[s.i];
        if (card) card.querySelector('.tyai-step-dot').classList.add('done');
      },
      onError: function (err) {
        if (needsSetup(err)) {
          els.timeline.insertAdjacentHTML('beforeend', '<div class="tyai-err">' + esc(errText(err)) + '<button class="tyai-inline-btn" data-open-cfg="1">去配置</button></div>');
          return;
        }
        if (currentTextEl) currentTextEl.insertAdjacentHTML('beforeend', '<div class="tyai-err">' + esc(errText(err)) + '</div>');
      },
      onFinish: function () { setBusy(false); updateActions(); },
      onEnd: function () {
        if (!els.timeline.querySelector('.tyai-step')) {
          els.timeline.innerHTML = '<div class="tyai-err">任务没有产出，请重试。</div>';
        }
        updateActions();
      },
    });
  }

  /* ---------------------------- 快捷模式 ---------------------------- */

  function renderContext() {
    var sel = state.lastSelection || '';
    var file = getTitle();
    var doc = getDocText();
    var bits = [];
    bits.push(file ? esc(file) + '（' + doc.length + ' 字）' : '未打开文档');
    if (sel) bits.push('已选中 ' + sel.length + ' 字');
    els.ctx.innerHTML = '<div class="tyai-ctx-line">' + bits.join(' · ') + '</div>' +
      (sel ? '<div class="tyai-ctx-sel">' + esc(sel.slice(0, 200)) + (sel.length > 200 ? '…' : '') + '</div>' : '');
  }

  function runScene(scene, forcedText) {
    if (state.busy) return;
    switchTab('quick');
    var sel = forcedText || state.lastSelection || getSelectionText() || '';
    state.lastSelection = sel;
    var docText = getDocText();
    if (!sel && !docText) { showQuickError('没有可用的内容。请先选中一段文字，或打开一篇文档。'); return; }
    if (!sel && scene !== 'summarize' && scene !== 'outline') {
      showQuickError('请先选中一段文字，再点「' + sceneLabel(scene) + '」。');
      return;
    }

    state.lastScene = scene;
    state.lastResult = '';
    renderContext();
    els.quickResult.innerHTML = '<div class="tyai-loading"><span></span><span></span><span></span></div>';
    setBusy(true);

    state.abort = aiPost('/ask', {
      scene: scene,
      text: (scene === 'summarize' || scene === 'outline') ? docText : sel,
      question: '',
      history: [],
      context: currentContext(),
    }, {
      onFinish: function () { setBusy(false); updateActions(); },
      onDelta: function (d) {
        state.lastResult += d;
        els.quickResult.innerHTML = mdToHtml(state.lastResult) || '<p class="tyai-empty">…</p>';
        els.quickResult.scrollTop = els.quickResult.scrollHeight;
        updateActions();
      },
      onError: function (err) { showQuickError(errText(err)); },
      onEnd: function () {
        if (!state.lastResult && !els.quickResult.querySelector('.tyai-err')) showQuickError('模型没有返回内容，请重试。');
        updateActions();
      },
    });
  }

  function showQuickError(msg) {
    var extra = /还没有配置|NO_CONFIG/.test(msg) ? '<button class="tyai-inline-btn" data-open-cfg="1">去配置</button>' : '';
    els.quickResult.innerHTML = '<div class="tyai-err">' + esc(msg) + extra + '</div>';
  }

  function needsSetup(err) {
    return /NO_CONFIG/.test(String((err && err.message) || err));
  }

  function errText(err) {
    var msg = String((err && err.message) || err);
    if (/NO_CONFIG/.test(msg)) return '还没有配置 API Key。点「去配置」填上你自己的 Key（本机保存，不上传），或启动桥接服务。';
    if (/ECONNREFUSED|Failed to fetch|socket hang up|桥接/i.test(msg) && MODE === 'bridge') {
      return '连不上桥接服务，也没有可直连的配置。请在设置里填 API Key，或双击 bin\\start-bridge.bat。';
    }
    if (/401|Unauthorized|invalid_api_key|Authentication/i.test(msg)) return 'API Key 无效或已过期：' + msg;
    return msg;
  }

  /* ---------------------------- 统一发送 ---------------------------- */

  function onPrimaryAction() {
    if (state.busy) { stopGen(); return; }
    var text = composerInput.value.trim();
    if (state.tab === 'chat') return sendChat();
    if (state.tab === 'agent') {
      if (!text) { flash('先描述一下学习任务'); return; }
      composerInput.value = '';
      composerInput.style.height = 'auto';
      runAgent(text);
      return;
    }
    // quick：针对选中的内容追问
    if (!text) { flash('先写一句想问的话'); return; }
    var sel = state.lastSelection || getSelectionText() || '';
    if (!sel) { flash('请先在正文里选中一段内容'); return; }
    composerInput.value = '';
    autoGrow();
    state.lastScene = 'ask';
    state.lastResult = '';
    renderContext();
    els.quickResult.innerHTML = '<div class="tyai-loading"><span></span><span></span><span></span></div>';
    setBusy(true);
    state.abort = aiPost('/ask', { scene: 'ask', text: sel, question: text, history: [], context: currentContext() }, {
      onFinish: function () { setBusy(false); updateActions(); },
      onDelta: function (d) {
        state.lastResult += d;
        els.quickResult.innerHTML = mdToHtml(state.lastResult);
        els.quickResult.scrollTop = els.quickResult.scrollHeight;
        updateActions();
      },
      onError: function (err) { showQuickError(errText(err)); },
    });
  }

  /* ---------------------------- 忙碌与停止 ---------------------------- */

  function setBusy(busy) {
    state.busy = busy;
    var btn = $('tyai-send');
    btn.classList.toggle('stop', busy);
    btn.innerHTML = icon(busy ? 'stop' : 'send', 17);
    btn.title = busy ? '停止生成' : '发送（Enter）';
    if (!busy) state.abort = null;
  }

  function stopGen() {
    if (state.abort) { try { state.abort(); } catch (e) {} }
    state.abort = null;
    setBusy(false);
    flash('已停止');
  }

  /* ---------------------------- 输出落地 ---------------------------- */

  function copyText(text) {
    if (!text) { flash('没有可复制的内容'); return; }
    if (window.reqnode) {
      try { window.reqnode('electron').clipboard.writeText(text); return flash('已复制'); } catch (e) {}
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { flash('已复制'); }, function () { fallbackCopy(text); });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flash('已复制'); } catch (e) { flash('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  function insertToDoc(text) {
    if (!text) { flash('没有可插入的内容'); return; }
    var editor = getEditor();
    if (!editor) { flash('找不到编辑区，已改为复制'); return copyText(text); }
    try {
      editor.focus();
      var sel = window.getSelection();
      sel.removeAllRanges();
      if (state.lastRange) { try { sel.addRange(state.lastRange); } catch (e) {} }
      if (sel.rangeCount === 0) {
        var range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.addRange(range);
      }
      var block = '\n\n> **AI 助手**\n>\n' + text.trim().replace(/\n/g, '\n> ') + '\n\n';
      var ok = document.execCommand('insertText', false, block);
      flash(ok ? '已插入到文档' : '插入失败，请用复制');
    } catch (e) {
      flash('插入失败，请用复制');
    }
  }

  function flash(msg) {
    var tip = document.createElement('div');
    tip.className = 'tyai-flash';
    tip.textContent = msg;
    root.appendChild(tip);
    setTimeout(function () { tip.classList.add('off'); }, 1200);
    setTimeout(function () { if (tip.parentNode) tip.remove(); }, 1700);
  }

  /* ---------------------------- 拖动 ---------------------------- */

  function startDrag(e) {
    var sx = e.clientX, sy = e.clientY;
    var rect = ball.getBoundingClientRect();
    var ox = rect.left, oy = rect.top;
    var moved = false;

    function onMove(ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      ball.style.left = clamp(ox + dx, 0, window.innerWidth - rect.width) + 'px';
      ball.style.top = clamp(oy + dy, 0, window.innerHeight - rect.height) + 'px';
      ball.style.right = 'auto';
      ball.style.bottom = 'auto';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (moved) {
        ball.dataset.dragged = '1';
        try { localStorage.setItem('tyai.ball.pos', JSON.stringify({ x: ball.style.left, y: ball.style.top })); } catch (err) {}
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function restoreBallPos() {
    try {
      var p = JSON.parse(localStorage.getItem('tyai.ball.pos') || 'null');
      if (p && p.x && p.y) {
        ball.style.left = p.x;
        ball.style.top = p.y;
        ball.style.right = 'auto';
        ball.style.bottom = 'auto';
      }
    } catch (e) {}
  }

  /* ======================================================================
   * 启动
   * ==================================================================== */

  function boot() {
    buildUI();
    restoreBallPos();

    // 错误提示里的「去配置」按钮（事件委托）
    root.addEventListener('click', function (e) {
      var b = e.target.closest('.tyai-inline-btn[data-open-cfg]');
      if (b) openSheet();
    });

    // 测试台 / 调试：带 #open 直接展开面板
    if (String(location.hash || '').indexOf('open') >= 0) togglePanel(true);

    window.__tyai = {
      version: VERSION,
      open: function () { togglePanel(true); },
      tab: switchTab,
      runScene: runScene,
      chat: function (text) { switchTab('chat'); composerInput.value = text; sendChat(); },
      agent: function (text) { switchTab('agent'); runAgent(text); },
      cfg: function () { return CFG; },
      mode: function () { return MODE; },
      sheet: openSheet,
      modelPop: toggleModelPop,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
