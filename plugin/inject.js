/* ==========================================================================
   xff助手一号 · 注入引导脚本 v2.8.2
   唯一需要写进 Typora 安装目录的文件。负责把界面加载起来：

   通道 A（可选增强）：本地桥接服务在跑 → 从它拉最新界面代码（支持热更新）
   通道 B（默认主干）：从本目录读取 client.js / client.css / config.json，
          由 Typora 渲染进程直连 AI API —— 不需要任何后台进程。

   即：打开 Typora，插件立即可用；桥接服务只是锦上添花。
   ========================================================================== */

(function () {
  'use strict';

  if (window.__TYPORA_AI_INJECTED__ === '2.8.2') return;
  window.__TYPORA_AI_INJECTED__ = '2.8.2';

  var PORT = 8765;
  var BASE = 'http://127.0.0.1:' + PORT;

  // 解析本脚本所在目录（file:///C:/Program%20Files/.../typora-ai-bridge/inject.js）
  var APP_DIR = (function () {
    try {
      var el = document.currentScript;
      if (!el || !el.src) return '';
      var p = decodeURIComponent(el.src.replace(/^file:\/\/\//i, '').split('?')[0]);
      p = p.replace(/[\/\\]inject\.js$/i, '');
      return p.replace(/\//g, '\\');
    } catch (e) { return ''; }
  })();

  var loaded = false;
  var hint = null;

  function log() {
    try { console.log.apply(console, ['[xff助手]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  /* ---------------- 提示点 ---------------- */

  function setHint(text) {
    if (loaded) return;
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'tyai-hint';
      hint.style.cssText =
        'position:fixed;right:30px;bottom:30px;width:14px;height:14px;border-radius:50%;' +
        'background:#e0567d;opacity:.45;cursor:pointer;z-index:2147483000;' +
        'animation:tyai-hint-blink 1.4s ease-in-out infinite;';
      var st = document.createElement('style');
      st.textContent = '@keyframes tyai-hint-blink{50%{opacity:.15}}';
      document.head.appendChild(st);
      hint.addEventListener('click', function () {
        if (typeof alert === 'function') alert(hint.title);
      });
      document.body.appendChild(hint);
    }
    hint.title = text;
  }

  function removeHint() {
    if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
    hint = null;
  }

  /* ---------------- 工具 ---------------- */

  function fetchText(url, timeoutMs, cb) {
    var reqnode = window.reqnode;
    if (reqnode) {
      try {
        var http = reqnode('http');
        var req = http.get(url, function (res) {
          if (res.statusCode !== 200) return cb(new Error('HTTP ' + res.statusCode));
          res.setEncoding('utf8');
          var body = '';
          res.on('data', function (c) { body += c; });
          res.on('end', function () { cb(null, body); });
        });
        req.on('error', cb);
        req.setTimeout(timeoutMs || 4000, function () { req.destroy(new Error('timeout')); });
        return;
      } catch (e) { return cb(e); }
    }
    if (typeof fetch === 'function') {
      fetch(url).then(function (r) { return r.text(); }).then(function (t) { cb(null, t); }).catch(cb);
      return;
    }
    cb(new Error('无可用的请求方式'));
  }

  function readLocalFile(name, cb) {
    var reqnode = window.reqnode;
    if (!reqnode || !APP_DIR) return cb(new Error('无 Node 能力或目录未知'));
    try {
      var fs = reqnode('fs');
      var full = APP_DIR + '\\' + name;
      if (!fs.existsSync(full)) return cb(new Error('文件不存在：' + full));
      cb(null, fs.readFileSync(full, 'utf8'));
    } catch (e) { cb(e); }
  }

  function injectCssText(css) {
    if (document.getElementById('tyai-css')) return;
    var st = document.createElement('style');
    st.id = 'tyai-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function runClient(code, mode, config) {
    window.__TYAI_MODE__ = mode;
    if (config) window.__TYAI_CONFIG__ = config;
    (0, eval)(code);
    loaded = true;
    removeHint();
    log('界面已加载（' + (mode === 'direct' ? '直连模式' : '桥接模式') + '）');
  }

  /* ---------------- 通道 A：桥接服务（可选，热更新） ---------------- */

  function probeBridge(cb) {
    fetchText(BASE + '/health', 1500, function (err, body) {
      if (err || !body) return cb(false);
      try { cb(JSON.parse(body).ok === true); } catch (e) { cb(false); }
    });
  }

  function loadFromBridge() {
    fetchText(BASE + '/client.js?t=' + Date.now(), 4000, function (err, code) {
      if (err || !code) return loadFromLocal('桥接拉取失败：' + ((err && err.message) || '空响应'));
      try {
        var link = document.createElement('link');
        link.id = 'tyai-css';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = BASE + '/client.css?t=' + Date.now();
        document.head.appendChild(link);
        runClient(code, 'bridge', null);
      } catch (e) {
        log('桥接代码执行出错：' + e.message);
        loadFromLocal('桥接代码执行失败');
      }
    });
  }

  /* ---------------- 通道 B：本地文件 + 渲染进程直连（默认主干） ---------------- */

  function loadFromLocal(reason) {
    if (reason) log(reason + '，改用本地直连模式');
    readLocalFile('client.js', function (errJs, code) {
      if (errJs || !code) return onAllFailed('读取本地 client.js 失败：' + ((errJs && errJs.message) || ''));
      readLocalFile('client.css', function (errCss, css) {
        if (errCss) css = '';
        readLocalFile('config.json', function (errCfg, cfgText) {
          var config = null;
          if (!errCfg && cfgText) {
            try { config = JSON.parse(cfgText); } catch (e) { log('config.json 解析失败：' + e.message); }
          }
          try {
            if (css) injectCssText(css);
            runClient(code, 'direct', config);
          } catch (e) {
            onAllFailed('本地代码执行出错：' + e.message);
          }
        });
      });
    });
  }

  function onAllFailed(msg) {
    log(msg);
    setHint('xff助手一号加载失败：' + msg + '\n\n请重新运行安装包里的 install.bat 修复。');
    // 兜底重试：桥接可能稍后被启动，本地文件也可能刚被修复
    var tries = 0;
    var iv = setInterval(function () {
      if (loaded) { clearInterval(iv); return; }
      if (++tries > 12) { clearInterval(iv); return; }
      probeBridge(function (ok) {
        if (loaded) { clearInterval(iv); return; }
        if (ok) { clearInterval(iv); loadFromBridge(); return; }
        loadFromLocal(null);
      });
    }, 5000);
  }

  /* ---------------- 启动 ---------------- */

  function tryBoot(quiet) {
    if (loaded) return;
    if (!quiet) log('引导脚本已加载（目录：' + (APP_DIR || '未知') + '）');
    probeBridge(function (ok) {
      if (loaded) return;
      if (ok) {
        loadFromBridge();
      } else {
        loadFromLocal(null);
      }
    });
  }

  function boot() {
    setHint('xff助手一号：正在加载…');
    tryBoot(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
