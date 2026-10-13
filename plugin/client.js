/* ==========================================================================
   xff助手一号 · 前端 v2.8
   --------------------------------------------------------------------------
   兼容性（重要）：目标是 Typora 1.8.3 自带的 Electron 1.8.3 / Chromium 59（2017）。
   禁止使用该内核不认识的东西，否则界面会「错乱」：
     · CSS 不要用 inset 简写、flex 容器的 gap、grid 的 gap 简写（用 grid-gap）、
       :focus-within、backdrop-filter、aspect-ratio；
     · JS 不要用箭头函数 / 可选链 / ?? / Object spread，新 API 一律先特性检测。
   间距统一由 client.css 末尾的「Chromium 59 兼容层」用 margin 实现。
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

  var VERSION = '2.8';
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
    chevron: '<path d="M9 6l6 6-6 6"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    trash: '<path d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z"/><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12"/><path d="M10 11v6M14 11v6"/>',
    sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>',
    save: '<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
    file: '<path d="M6.5 3.5h7l4 4v13a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z"/><path d="M13.5 3.5v4h4"/>',
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
   * 运行环境适配：结合本机 Typora 的内核版本决定运行形态
   * ----------------------------------------------------------------------
   * 不同电脑上的 Typora 内嵌内核差别很大（老版 Electron 1.8 = Chromium 59，
   * 新版已到 Chromium 120+）。策略是「一套代码，两级形态」：
   *   · 基线（所有内核通用）：CSS/JS 只用老内核也认识的写法，保证不错乱；
   *   · 增强（探测到新内核时）：给 #tyai-root 加 .tyai-k-modern，
   *     CSS 里只有该形态下才出现现代化观感（毛玻璃遮罩等）。
   * 探测结果同时暴露在设置面板与 __tyai.kernel()，出问题时好定位。
   * ==================================================================== */

  // 极老内核兜底：NodeList.forEach（Chrome 51+）/ Element.remove（Chrome 41+）
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }
  if (window.Element && !Element.prototype.remove) {
    Element.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
  }

  function detectKernel() {
    var ua = (navigator && navigator.userAgent) || '';
    var chrome = 0, electron = '';
    var m = ua.match(/Chrome\/(\d+)/);
    if (m) chrome = parseInt(m[1], 10) || 0;
    m = ua.match(/Electron\/([\d.]+)/);
    if (m) electron = m[1];

    // 安装脚本探测到的版本作为兜底（UA 被改写认不出时用它）
    var hint = 0;
    try { hint = parseInt((window.__TYAI_CONFIG__ && window.__TYAI_CONFIG__.kernel) || 0, 10) || 0; } catch (e) {}
    if (!chrome && hint > 0) chrome = hint;

    function cssOk(prop, val) {
      try { return !!(window.CSS && CSS.supports && CSS.supports(prop, val)); } catch (e) { return false; }
    }

    var feats = {
      // 布局关键特性：缺任何一项都退回保守基线
      inset: chrome >= 87 || cssOk('inset', '0'),
      flexGap: chrome >= 84 || cssOk('gap', '8px'),
      gridGap: chrome >= 66 || cssOk('gap', '8px'),
      focusWithin: chrome >= 60,
      blur: chrome >= 76 || cssOk('backdrop-filter', 'blur(2px)') || cssOk('-webkit-backdrop-filter', 'blur(2px)')
    };
    var modern = chrome >= 87 && feats.inset && feats.flexGap && feats.focusWithin;

    return {
      chrome: chrome,
      electron: electron,
      modern: !!modern,
      feats: feats,
      label: chrome > 0
        ? ('Chromium ' + chrome + (electron ? ' · Electron ' + electron : ''))
        : '未能识别（按保守模式运行）'
    };
  }

  var KERNEL = detectKernel();

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
  };

  var root, ball, panel, statusEl, bubble, composerInput;
  var els = {};
  var sheetProvider = '';   // 设置抽屉里当前选中的服务商

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

  // 链接协议白名单：模型输出不可信，拦截 javascript:/data:/vbscript: 等可执行协议
  function safeHref(u) {
    return /^(?:https?:\/\/|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(String(u)) ? u : '#';
  }

  /* ------------------------------------------------------------------
   * 轻量 LaTeX → HTML：把常见符号/上下标/分数转成可读形式。
   * 不引外部渲染器（KaTeX 体积大且对老内核不友好），纯字符串替换，
   * 所有文本都过 esc()，只放行 <sup>/<sub> 两个标签。
   * ---------------------------------------------------------------- */
  var LATEX_SYMBOLS = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
    theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
    pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ',
    phi: 'φ', varphi: 'ϕ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    nabla: '∇', partial: '∂', infty: '∞', sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮',
    pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', star: '⋆', circ: '∘', bullet: '∙',
    approx: '≈', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥', ll: '≪', gg: '≫',
    to: '→', rightarrow: '→', longrightarrow: '→', leftarrow: '←', longleftarrow: '←',
    leftrightarrow: '↔', longleftrightarrow: '↔', Rightarrow: '⇒', Longrightarrow: '⇒',
    Leftarrow: '⇐', Leftrightarrow: '⇔', Longleftrightarrow: '⇔', mapsto: '↦', gets: '←', hookrightarrow: '↪',
    in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅',
    forall: '∀', exists: '∃', nexists: '∄', neg: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨',
    ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dots: '…',
    prime: '′', angle: '∠', deg: '°', prop: '∝', propto: '∝', perp: '⊥', parallel: '∥',
    sim: '∼', simeq: '≃', cong: '≅', equiv: '≡', asymp: '≍', doteq: '≐',
    Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', hbar: 'ℏ', ell: 'ℓ', wp: '℘',
    sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
    log: 'log', ln: 'ln', lg: 'lg', exp: 'exp', lim: 'lim', max: 'max', min: 'min',
    arg: 'arg', det: 'det', dim: 'dim', deg2: 'deg', gcd: 'gcd', mod: 'mod',
    mathrm: '', mathit: '', mathbf: '', mathsf: '', mathtt: '', mathcal: '', mathbb: '', mathfrak: '',
    text: '', textnormal: '', textrm: '', mbox: '', operatorname: '', mathop: '',
    left: '', right: '', big: '', Big: '', bigg: '', Bigg: '', bigl: '', bigr: '', biggl: '', biggr: '',
    displaystyle: '', limits: '', nolimits: '', textstyle: '',
    quad: ' ', qquad: '  ', thinspace: ' ', hspace: ' ', enspace: ' '
  };

  function latexToHtml(src) {
    var s = String(src || '');
    s = s.replace(/\\([%$&#_{}])/g, '$1');                       // 转义的普通字符
    s = s.replace(/\\[,;:!>]/g, ' ');                            // 间距命令
    var guard = 0;
    while (guard++ < 4 && /\\[dt]?frac\s*\{/.test(s)) {          // 分数 → (a)/(b)
      s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (m, a, b) {
        var A = a.length > 1 ? '(' + a + ')' : a;
        var B = b.length > 1 ? '(' + b + ')' : b;
        return A + '/' + B;
      });
    }
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, function (m, x) { return '√(' + x + ')'; });
    s = s.replace(/\\sqrt\s*([0-9a-zA-Z])/g, '√$1');
    s = s.replace(/\\([a-zA-Z]+)/g, function (m, name) {         // 符号 / 未知命令去反斜杠
      return LATEX_SYMBOLS.hasOwnProperty(name) ? LATEX_SYMBOLS[name] : '';
    });
    var tags = [];
    function T(h) { tags.push(h); return '\u0003' + (tags.length - 1) + '\u0003'; }
    s = s.replace(/\^\{([^{}]*)\}/g, function (m, x) { return T('<sup>' + x + '</sup>'); });
    s = s.replace(/\^([0-9a-zA-Z+\-])/g, function (m, x) { return T('<sup>' + x + '</sup>'); });
    s = s.replace(/_\{([^{}]*)\}/g, function (m, x) { return T('<sub>' + x + '</sub>'); });
    s = s.replace(/_([0-9a-zA-Z])/g, function (m, x) { return T('<sub>' + x + '</sub>'); });
    s = s.replace(/[{}]/g, '');
    s = s.replace(/\\/g, '');
    s = esc(s);
    return s.replace(/\u0003(\d+)\u0003/g, function (_, n) { return tags[+n]; });
  }

  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, text, url) {
        return '<a href="' + safeHref(url) + '" target="_blank" rel="noreferrer noopener">' + text + '</a>';
      });
  }

  function splitRow(line) {
    return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function mdToHtml(src) {
    var slots = [];
    function slot(html) { slots.push(html); return '\u0001' + (slots.length - 1) + '\u0001'; }

    var text = String(src);
    // 代码块：语言标签 + 复制按钮（代码先 esc 再进 data-code，读取时浏览器自动还原实体）
    text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, function (m, code) {
      var lang = (m.match(/```([^\n`]*)/) || [])[1].trim();
      var body = esc(code.replace(/\n$/, ''));
      return '\n' + slot(
        '<div class="tyai-code">' +
        '<div class="tyai-code-bar"><span>' + esc(lang || '代码') + '</span>' +
        '<button type="button" class="tyai-code-copy" data-code="' + body + '">复制</button></div>' +
        '<pre><code>' + body + '</code></pre></div>'
      ) + '\n';
    });
    // 数学公式：$$...$$ 块级、$...$ 行内（LaTeX 转成可读符号，样式化展示；
    // 行内公式要求含 LaTeX 特征字符，避免把「$5 到 $10」这类误判为公式）
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (m, f) {
      return '\n' + slot('<div class="tyai-math tyai-math-block">' + latexToHtml(f.trim()) + '</div>') + '\n';
    });
    text = text.replace(/\$([^$\n]+)\$/g, function (m, f) {
      return /[\\^_{}]/.test(f) ? slot('<span class="tyai-math">' + latexToHtml(f) + '</span>') : m;
    });
    // 仅保留 details/summary 的开合标签本身，剥离全部属性（防 ontoggle 等事件属性注入）
    text = text.replace(/<\/?(details|summary)[^>]*>/gi, function (m, name) {
      var closing = m.charAt(1) === '/';
      return slot((closing ? '</' : '<') + name.toLowerCase() + '>');
    });
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

  /* ------------------------------------------------------------------
   * 流式渲染节流：模型每个 delta 都全量重渲染长文本会越算越卡（O(n²)）。
   * 这里按 60ms 合批，收尾时必须用 flushStream 保证最终状态精确。
   * ---------------------------------------------------------------- */
  var streamPaint = { el: null, html: '', timer: null, last: 0 };

  function paintStream(el, html, scrollEl) {
    if (!el) return;
    var now = Date.now();
    if (el !== streamPaint.el) {           // 换了渲染目标（新的回答/新的步骤）：立即画
      if (streamPaint.timer) { clearTimeout(streamPaint.timer); streamPaint.timer = null; }
      streamPaint.el = el; streamPaint.html = html; streamPaint.last = now;
      el.innerHTML = html;
      if (scrollEl) scrollBottom(scrollEl);
      return;
    }
    streamPaint.html = html;
    if (now - streamPaint.last >= 60) {
      if (streamPaint.timer) { clearTimeout(streamPaint.timer); streamPaint.timer = null; }
      streamPaint.last = now;
      el.innerHTML = html;
      if (scrollEl) scrollBottom(scrollEl);
    } else if (!streamPaint.timer) {
      streamPaint.timer = setTimeout(function () {
        streamPaint.timer = null;
        streamPaint.last = Date.now();
        if (streamPaint.el) {
          streamPaint.el.innerHTML = streamPaint.html;
          if (scrollEl) scrollBottom(scrollEl);
        }
      }, 60 - (now - streamPaint.last));
    }
  }

  function flushStream(el, html) {
    if (streamPaint.timer) { clearTimeout(streamPaint.timer); streamPaint.timer = null; }
    streamPaint.el = el; streamPaint.html = html; streamPaint.last = Date.now();
    if (el) el.innerHTML = html;
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
      '你的第一步是理解目标，把任务拆解成 2~6 个可执行的步骤。\n\n' +
      '硬性要求：\n' +
      '1. 只输出一个 JSON 对象，禁止输出 JSON 以外的任何文字（包括解释、代码块围栏）。\n' +
      '2. 格式：{"steps":[{"title":"步骤短标题（不超过12字）","goal":"这一步具体做什么，一句话"}]}\n' +
      '3. 步骤通常依次为：梳理讲解 → 深入举例 → 检验总结；按任务需要调整。\n' +
      '4. 不要编造文档里不存在的知识。文档不足以完成任务时，在对应步骤的 goal 里写明「基于通用知识」。';

    function agentPlanPrompt(opts) {
      var parts = ['学习任务：' + opts.task];
      if (opts.selection) parts.push('\n用户选中的内容（优先围绕它）：\n<<<\n' + String(opts.selection).slice(0, 4000) + '\n>>>');
      if (opts.docText) parts.push('\n文档上下文（可能截断）：\n<<<DOC\n' + opts.docText + '\nDOC>>>');
      parts.push('\n请输出拆解步骤的 JSON。');
      return parts.join('\n');
    }

    var AGENT_LOOP_SYSTEM =
      '你是「学习智能体」，运行在用户本地的学习助手里，正在自主完成多步任务中的一步。\n' +
      '你可以调用工具：在回复的最末尾输出一个工具调用块（独占一段）：\n' +
      '```tool\n{"tool":"工具名","args":{...}}\n```\n' +
      '可用工具与参数：\n' +
      '- read_document — 重新读取当前文档全文。args: {}\n' +
      '- save_md — 把 Markdown 内容保存为 .md 文件（要交付文档时用）。args: {"content":"markdown 全文","name":"文件名.md"(可选)}\n' +
      '- clipboard — 复制文本到剪贴板。args: {"text":"..."}\n' +
      '- memory_save — 把要点存入长期记忆（跨任务保留，之后的任务能读到）。args: {"content":"..."}\n' +
      '- memory_load — 读取长期记忆。args: {}\n' +
      '- todo_set — 更新任务清单进度。args: {"items":[{"text":"...","status":"todo|doing|done"}]}\n' +
      '- plan_revise — 调整剩余计划。args: {"steps":[{"title":"短标题","goal":"一句话"}]}\n' +
      '- finish — 任务收束（提前完成时用）。args: {"summary":"一句话总结"}\n\n' +
      '规则：\n' +
      '1. 每轮最多一个工具调用，写在回复末尾；发出后会收到【工具结果】，再继续。\n' +
      '2. 不再需要工具时，直接输出给用户看的最终内容（不要工具块），本步即完成。\n' +
      '3. 面向用户的正文用 Markdown 排版；给用户的文字里不要出现工具调用块。\n' +
      '4. 禁止编造文档里没有的事实；材料不足就直说缺什么。\n' +
      '5. 产出长文档（笔记/测验卷）时，主动用 save_md 落成文件，不要只留在对话里。';

    // 从模型输出里解析工具调用块（取最后一个；容忍未闭合的流式半截块）
    function parseToolCall(text) {
      if (!text) return null;
      var blocks = String(text).match(/```tool\s*([\s\S]*?)(?:```|$)/g);
      if (!blocks || !blocks.length) return null;
      var last = blocks[blocks.length - 1];
      var start = last.indexOf('{');
      if (start < 0) return null;
      var depth = 0, end = -1, inStr = false, escCh = false;
      for (var i = start; i < last.length; i++) {
        var c = last[i];
        if (inStr) {
          if (escCh) escCh = false;
          else if (c === '\\') escCh = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end < 0) return null;
      try {
        var obj = JSON.parse(last.slice(start, end));
        var tool = String(obj.tool || '');
        var ok = { read_document: 1, save_md: 1, clipboard: 1, memory_save: 1, memory_load: 1, todo_set: 1, plan_revise: 1, finish: 1 };
        if (!ok[tool]) return null;
        return { tool: tool, args: (obj.args && typeof obj.args === 'object') ? obj.args : {} };
      } catch (e) { return null; }
    }

    // 去掉工具调用块，只留面向用户的正文：
    // 闭合块整块移除（保留块后的正文）；未闭合的尾块（流式半截）从标记处截断
    function stripToolBlocks(text) {
      var t = String(text || '');
      t = t.replace(/```tool[\s\S]*?```/g, '');
      var i = t.indexOf('```tool');
      if (i >= 0) t = t.slice(0, i);
      return t;
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
          .slice(0, 6)
          .map(function (s) { return { title: String(s.title || s.goal).slice(0, 30), goal: String(s.goal || s.title).slice(0, 200) }; });
        return clean.length ? clean : null;
      } catch (e) { return null; }
    }

    return {
      SCENES: SCENES,
      buildMessages: buildMessages,
      buildChatMessages: buildChatMessages,
      AGENT_PLAN_SYSTEM: AGENT_PLAN_SYSTEM,
      AGENT_LOOP_SYSTEM: AGENT_LOOP_SYSTEM,
      agentPlanPrompt: agentPlanPrompt,
      parsePlan: parsePlan,
      parseToolCall: parseToolCall,
      stripToolBlocks: stripToolBlocks,
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

  /* Agent 循环用的底层 LLM 调用：桥接走 /llm 透传（原样转发 messages），
     直连走 directRequest；桥接失败自动降级直连。 */
  function llmStream(opts, handlers) {
    if (MODE === 'direct') return directRequest(opts, handlers);

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
        state.abort = directRequest(opts, handlers);
        return;
      }
      handlers.onError && handlers.onError(err);
    };
    return request('POST', '/llm', { messages: opts.messages, temperature: opts.temperature }, wrapped);
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
    // 兜底：历史数据损坏（不是数组 / 缺字段）时重建，别让整个面板起不来
    if (!Array.isArray(state.sessions)) state.sessions = [];
    for (var i = 0; i < state.sessions.length; i++) {
      var s = state.sessions[i];
      if (!s || typeof s !== 'object') { state.sessions.splice(i--, 1); continue; }
      if (!Array.isArray(s.messages)) s.messages = [];
      if (!s.id) s.id = uid();
      if (!s.title) s.title = '新对话';
      if (!s.ts) s.ts = Date.now();
    }
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
      { tab: 'chat', icon: 'chat', title: 'Chat', desc: '选中正文随时提问，多轮记住上下文' },
      { tab: 'agent', icon: 'spark', title: 'Agent', desc: '拆解学习任务，多步执行再汇总' },
      { tab: 'quick', icon: 'bolt', title: 'Quick', desc: '解释 / 翻译 / 说人话 / 总结…' },
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

      // ---------- 左侧：历史会话栏（仿主流 AI：常驻、可搜索、可滚动） ----------
      '  <div class="tyai-main">' +
      '    <aside class="tyai-side" id="tyai-side">' +
      '      <div class="tyai-side-top">' +
      '        <button class="tyai-side-new" id="tyai-side-new">' + icon('plus', 14) + '<span>新对话</span></button>' +
      '        <button class="tyai-icobtn" id="tyai-side-fold" title="收起会话栏">' + icon('sidebar', 15) + '</button>' +
      '      </div>' +
      '      <div class="tyai-side-search">' + icon('search', 13) +
      '        <input id="tyai-side-q" type="text" placeholder="搜索历史会话" spellcheck="false">' +
      '      </div>' +
      '      <div class="tyai-scroll tyai-side-list" id="tyai-side-list"></div>' +
      '    </aside>' +

      '    <div class="tyai-content">' +

      '  <div class="tyai-head">' +
      '    <button class="tyai-icobtn" id="tyai-side-unfold" title="展开会话栏">' + icon('sidebar', 16) + '</button>' +
      '    <span class="tyai-logo">' + logoMark(26) + '</span>' +
      '    <span class="tyai-title">xff助手一号</span>' +
      '    <span class="tyai-status" id="tyai-status">连接中…</span>' +
      '    <span class="tyai-x" id="tyai-close" title="关闭">' + icon('x', 16) + '</span>' +
      '  </div>' +

      '  <div class="tyai-seg" id="tyai-seg">' +
      '    <button data-tab="chat" class="on">Chat</button>' +
      '    <button data-tab="agent">Agent</button>' +
      '    <button data-tab="quick">Quick</button>' +
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

      '    </div>' +   // /.tyai-content
      '  </div>' +     // /.tyai-main

      // ---------- 弹层：模型 ----------
      '  <div class="tyai-pop" id="tyai-pop-model" hidden></div>' +

      // ---------- 设置抽屉 ----------
      '  <div class="tyai-sheet" id="tyai-sheet" hidden>' +
      '    <div class="tyai-mask" id="tyai-sheet-mask"></div>' +
      '    <div class="tyai-sheet-panel">' +
      '      <div class="tyai-sheet-head"><b>模型与配置</b><span class="tyai-x" id="tyai-sheet-close">' + icon('x', 15) + '</span></div>' +
      '      <div class="tyai-sheet-body tyai-scroll">' +
      '        <div class="tyai-field"><span>服务商</span>' +
      '          <div class="tyai-opts" id="tyai-f-provider"></div>' +
      '        </div>' +
      '        <label class="tyai-field"><span>接口地址 Base URL</span><input id="tyai-f-baseurl" type="text" spellcheck="false" placeholder="https://api.deepseek.com"></label>' +
      '        <label class="tyai-field"><span>模型名</span><input id="tyai-f-model" type="text" spellcheck="false" placeholder="deepseek-chat"></label>' +
      '        <div class="tyai-suggests" id="tyai-model-suggest"></div>' +
      '        <label class="tyai-field"><span>API Key</span><span class="tyai-keywrap"><input id="tyai-f-key" type="password" spellcheck="false" placeholder="sk-..."><button class="tyai-icobtn" id="tyai-f-eye" title="显示 / 隐藏">' + icon('eye', 15) + '</button></span></label>' +
      '        <div class="tyai-field"><span>温度 <i id="tyai-f-tempv">0.7</i></span><input id="tyai-f-temp" type="range" min="0" max="1.5" step="0.1"></div>' +
      '        <label class="tyai-field"><span>上下文上限（字符）</span><input id="tyai-f-maxctx" type="number" min="1000" max="200000" step="1000"></label>' +
      '        <p class="tyai-note">Key 只保存在本机，不会上传；换一台电脑需重新填写。</p>' +
      '        <p class="tyai-note" id="tyai-kernel-note"></p>' +
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

    // 内核形态标记：新内核 -> tyai-k-modern（启用毛玻璃等增强）；老内核 -> tyai-k-legacy
    root.classList.add(KERNEL.modern ? 'tyai-k-modern' : 'tyai-k-legacy');
    if (KERNEL.chrome > 0) root.setAttribute('data-kernel', String(KERNEL.chrome));

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
    els.sheet = $('tyai-sheet');
    els.side = $('tyai-side');
    els.sideList = $('tyai-side-list');
    els.sideQ = $('tyai-side-q');
    // 会话栏展开状态（持久化；窄屏默认收起，避免主区被挤没）
    var sideSaved = null;
    try { sideSaved = localStorage.getItem('tyai.side'); } catch (e) {}
    var sideOn = sideSaved === null ? (window.innerWidth || 0) > 620 : sideSaved === '1';
    panel.classList.toggle('side-on', !!sideOn);
    $('tyai-kernel-note').textContent =
      '运行环境：' + KERNEL.label + '（' + (KERNEL.modern ? '完整形态' : '兼容形态') + '）';

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
      // 场景按钮：先把侧栏唤出，再执行 —— 否则面板关着时点了没反应
      if (scene) { togglePanel(true); runScene(scene, state.lastSelection); }
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

    // 兼容 Chromium 59：内核没有 :focus-within，用 class 模拟输入框聚焦高亮
    var boxEl = $('tyai-box');
    composerInput.addEventListener('focus', function () { boxEl.classList.add('focus'); });
    composerInput.addEventListener('blur', function () { boxEl.classList.remove('focus'); });

    // 模型 / 配置
    $('tyai-model-pill').addEventListener('click', function (e) { e.stopPropagation(); toggleModelPop(); });
    $('tyai-cfg-btn').addEventListener('click', function () { openSheet(); });
    $('tyai-f-eye').addEventListener('click', function () {
      var el = $('tyai-f-key');
      var pw = el.type === 'password';
      el.type = pw ? 'text' : 'password';
      this.innerHTML = icon(pw ? 'eyeoff' : 'eye', 15);
    });
    $('tyai-f-temp').addEventListener('input', function () { $('tyai-f-tempv').textContent = this.value; });
    $('tyai-f-test').addEventListener('click', doTestConnection);
    $('tyai-f-save').addEventListener('click', saveSheet);
    $('tyai-sheet-close').addEventListener('click', closeSheet);
    $('tyai-sheet-mask').addEventListener('click', closeSheet);

    // 结果操作
    els.actions.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'copy') copyText(currentResultText());
      else if (act === 'insert') insertToDoc(currentResultText());
      else if (act === 'redo') redoCurrent();
    });

    // 智能体快捷词：点一下就直接开跑（不再只填输入框，避免"点了没反应"）
    $('tyai-chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.tyai-chip');
      if (!chip) return;
      var text = chip.textContent;
      if (state.busy) { flash('正在生成中，先等当前任务完成或点停止'); return; }
      composerInput.value = '';
      composerInput.style.height = 'auto';
      runAgent(text);
    });

    // 时间线：工具卡展开/收起；中断后「继续」
    els.timeline.addEventListener('click', function (e) {
      var rs = e.target.closest('[data-agent-resume]');
      if (rs) { runAgent('', true); return; }
      var tc = e.target.closest('[data-tool-toggle]');
      if (tc) tc.classList.toggle('open');
    });

    // ---------- 历史会话栏 ----------
    $('tyai-side-new').addEventListener('click', function () {
      var s = newSession('新对话');
      state.sessions.unshift(s);
      state.curId = s.id;
      saveSessions();
      renderSideList();
      renderChat();
      if (state.tab !== 'chat') switchTab('chat');
      composerInput.focus();
    });
    $('tyai-side-fold').addEventListener('click', function () { setSideOpen(false); });
    $('tyai-side-unfold').addEventListener('click', function () { setSideOpen(true); });
    els.sideQ.addEventListener('input', renderSideList);
    els.sideQ.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { this.value = ''; renderSideList(); e.stopPropagation(); }
    });
    els.sideList.addEventListener('click', function (e) {
      var del = e.target.closest('.tyai-side-del');
      if (del) {
        e.stopPropagation();
        deleteSession(del.getAttribute('data-id'));
        return;
      }
      var item = e.target.closest('.tyai-side-item');
      if (!item) return;
      var id = item.getAttribute('data-id');
      if (id === state.curId) return;
      state.curId = id;
      saveSessions();
      renderSideList();
      renderChat();
    });

    // 消息流内嵌按钮：单条复制 + 代码块复制（独立类名 + 容器委托，避免被通用处理器误接）
    els.msgs.addEventListener('click', function (e) {
      var codeBtn = e.target.closest('.tyai-code-copy');
      if (codeBtn) { copyText(codeBtn.getAttribute('data-code') || ''); return; }
      var msgBtn = e.target.closest('.tyai-msg-copy');
      if (!msgBtn) return;
      var msg = msgBtn.closest('.tyai-msg');
      var textEl = msg && msg.querySelector('.tyai-msg-text');
      if (textEl) copyText(textEl.innerText || textEl.textContent || '');
    });
    els.timeline.addEventListener('click', function (e) {
      var codeBtn = e.target.closest('.tyai-code-copy');
      if (codeBtn) copyText(codeBtn.getAttribute('data-code') || '');
    });

    // 快捷场景
    $('tyai-view-quick').querySelector('.tyai-scenes').addEventListener('click', function (e) {
      var btn = e.target.closest('.tyai-scene');
      if (btn) runScene(btn.getAttribute('data-scene'));
    });

    // 点空白关闭弹层
    document.addEventListener('mousedown', function (e) {
      if (!els.popModel.hidden && !els.popModel.contains(e.target) && !$('tyai-model-pill').contains(e.target)) els.popModel.hidden = true;
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
        else if (!els.popModel.hidden) els.popModel.hidden = true;
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
    renderModelPop();
    els.popModel.hidden = false;
  }

  function renderModelPop() {
    var cur = providerOf(CFG.provider);
    var html = '<div class="tyai-pop-title">模型</div>';

    // —— 当前服务商（默认只展示它，不再一上来铺满所有厂商）
    html += '<div class="tyai-pop-group">' + esc(cur.name) + '</div>';
    var mine = cur.models.slice();
    if (!mine.length && CFG.model) mine = [CFG.model];
    if (!mine.length) {
      html += '<div class="tyai-pop-empty">还没有可选项，点最下面的「配置」填一次即可。</div>';
    } else {
      mine.forEach(function (m) {
        var on = (CFG.model === m) ? ' on' : '';
        html += '<button class="tyai-pop-item' + on + '" data-model="' + esc(m) + '" data-prop="' + cur.id + '" data-base="' + esc(cur.baseUrl) + '">' +
          '<span>' + esc(m) + '</span>' + (on ? icon('check', 14) : '') + '</button>';
      });
    }

    // —— 其他服务商：折叠起来，需要时才展开
    var others = PROVIDERS.filter(function (p) { return p.id !== cur.id; });
    if (others.length) {
      html += '<div class="tyai-pop-sep"></div>' +
        '<button class="tyai-pop-toggle" id="tyai-pop-toggle">' + icon('sliders', 15) +
        '<span>换用其他服务商</span><span class="tyai-pop-caret">' + icon('chevron', 14) + '</span></button>' +
        '<div class="tyai-pop-others" id="tyai-pop-others" hidden>';
      others.forEach(function (p) {
        html += '<div class="tyai-pop-group">' + esc(p.name) + '</div>';
        if (p.models.length) {
          p.models.forEach(function (m) {
            html += '<button class="tyai-pop-item" data-model="' + esc(m) + '" data-prop="' + p.id + '" data-base="' + esc(p.baseUrl) + '">' +
              '<span>' + esc(m) + '</span></button>';
          });
        } else {
          html += '<button class="tyai-pop-item" data-cfg-provider="' + p.id + '">' +
            '<span>去填写接口地址…</span>' + icon('chevron', 14) + '</button>';
        }
      });
      html += '</div>';
    }

    html += '<div class="tyai-pop-sep"></div>' +
      '<button class="tyai-pop-item" data-open-cfg="1">' + icon('gear', 15) + '<span>配置模型与 API Key</span></button>';

    els.popModel.innerHTML = html;

    var toggle = $('tyai-pop-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var box = $('tyai-pop-others');
        box.hidden = !box.hidden;
        toggle.classList.toggle('open', !box.hidden);
      });
    }

    els.popModel.querySelectorAll('.tyai-pop-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-open-cfg')) { els.popModel.hidden = true; openSheet(); return; }
        var preset = btn.getAttribute('data-cfg-provider');
        if (preset) { els.popModel.hidden = true; openSheet(preset); return; }
        var model = btn.getAttribute('data-model');
        if (!model) return;                        // 兜底：没有模型名的按钮不参与切换
        CFG.model = model;
        var prop = btn.getAttribute('data-prop');
        var base = btn.getAttribute('data-base');
        if (prop) {
          CFG.provider = prop;
          if (base) CFG.baseUrl = base;
        }
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

  function openSheet(presetProvider) {
    els.popModel.hidden = true;

    sheetProvider = presetProvider || CFG.provider || 'custom';
    renderProviderOpts();
    refreshModelSuggest();

    $('tyai-f-baseurl').value = CFG.baseUrl || '';
    $('tyai-f-model').value = CFG.model || '';
    $('tyai-f-key').value = CFG.apiKey || '';
    $('tyai-f-key').type = 'password';
    $('tyai-f-eye').innerHTML = icon('eye', 15);
    $('tyai-f-temp').value = Number(CFG.temperature) || 0.7;
    $('tyai-f-tempv').textContent = Number(CFG.temperature) || 0.7;
    $('tyai-f-maxctx').value = Number(CFG.maxContextChars) || 12000;
    $('tyai-testbox').innerHTML = '';
    els.sheet.hidden = false;
  }

  function closeSheet() { els.sheet.hidden = true; }

  // 服务商：按钮组（不用原生 select —— 在 Electron/Typora 下样式不可控）
  function renderProviderOpts() {
    var box = $('tyai-f-provider');
    box.innerHTML = PROVIDERS.map(function (p) {
      var on = (p.id === sheetProvider) ? ' on' : '';
      return '<button type="button" class="tyai-opt' + on + '" data-provider="' + p.id + '">' + esc(p.name) + '</button>';
    }).join('');
    box.querySelectorAll('.tyai-opt').forEach(function (b) {
      b.addEventListener('click', function () { selectProvider(b.getAttribute('data-provider')); });
    });
  }

  function selectProvider(id) {
    sheetProvider = id;
    var p = providerOf(id);
    if (p.baseUrl) $('tyai-f-baseurl').value = p.baseUrl;
    var cur = $('tyai-f-model').value;
    if (p.models.length && !p.models.some(function (m) { return m === cur; })) {
      $('tyai-f-model').value = p.models[0];
    }
    renderProviderOpts();
    refreshModelSuggest();
  }

  // 模型：输入框 + 常用模型快捷 chips（不用原生 datalist）
  function refreshModelSuggest() {
    var box = $('tyai-model-suggest');
    var p = providerOf(sheetProvider);
    if (!p.models.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<span class="tyai-sug-hint">常用</span>' + p.models.map(function (m) {
      return '<button type="button" class="tyai-sug" data-model="' + esc(m) + '">' + esc(m) + '</button>';
    }).join('');
    box.querySelectorAll('.tyai-sug').forEach(function (b) {
      b.addEventListener('click', function () { $('tyai-f-model').value = b.getAttribute('data-model'); });
    });
  }

  function sheetCfg() {
    return {
      provider: sheetProvider || 'custom',
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

  /* ---------------------------- 历史会话栏 ---------------------------- */

  function setSideOpen(on) {
    panel.classList.toggle('side-on', !!on);
    try { localStorage.setItem('tyai.side', on ? '1' : '0'); } catch (e) {}
    if (on) renderSideList();
  }

  function fmtTime(ts) {
    var d = new Date(ts || Date.now());
    var now = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    if (d.toDateString() === now.toDateString()) return p(d.getHours()) + ':' + p(d.getMinutes());
    if (d.getFullYear() === now.getFullYear()) return p(d.getMonth() + 1) + '-' + p(d.getDate());
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function renderSideList() {
    if (!els.sideList) return;
    var q = (els.sideQ && els.sideQ.value || '').trim().toLowerCase();
    var list = state.sessions.filter(function (s) {
      return !q || String(s.title || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) {
      els.sideList.innerHTML = '<div class="tyai-side-empty">' + (q ? '没有匹配的会话' : '还没有历史会话') + '</div>';
      return;
    }
    els.sideList.innerHTML = list.map(function (s) {
      return '<div class="tyai-side-item' + (s.id === state.curId ? ' on' : '') + '" data-id="' + s.id + '">' +
        '<div class="tyai-side-item-tx"><b>' + esc(s.title || '新对话') + '</b>' +
        '<i>' + fmtTime(s.ts) + ' · ' + (s.messages ? s.messages.length : 0) + ' 条</i></div>' +
        '<button type="button" class="tyai-side-del" data-id="' + s.id + '" title="删除会话">' + icon('trash', 12) + '</button>' +
        '</div>';
    }).join('');
  }

  function deleteSession(id) {
    var idx = -1;
    for (var i = 0; i < state.sessions.length; i++) if (state.sessions[i].id === id) { idx = i; break; }
    if (idx < 0) return;
    var wasCur = state.sessions[idx].id === state.curId;
    state.sessions.splice(idx, 1);
    if (!state.sessions.length) state.sessions.push(newSession('新对话'));
    if (wasCur || !curSession()) state.curId = state.sessions[0].id;
    saveSessions();
    renderSideList();
    if (wasCur) { renderChat(); if (state.tab !== 'chat') switchTab('chat'); }
    flash('已删除会话');
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
    if (tab === 'agent' && !state.busy) renderAgent();   // 恢复持久化的运行状态
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
      var a = agentState();
      if (a && a.task) runAgent(a.task);
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
    var has = !!currentResultText();
    els.actions.classList.toggle('on', has);
  }

  /* ---------- 导出 Markdown 文件 ---------- */

  function suggestMdName() {
    var base = 'AI助手';
    try {
      var p = getFilePath();
      if (p) base = String(p).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || base;
    } catch (e) {}
    return base + '-AI笔记.md';
  }

  function saveMarkdown(text, name) {
    if (!text) { flash('没有可保存的内容'); return; }
    name = name || 'AI助手笔记.md';
    var node = window.reqnode;
    // 1) Typora/Electron 环境：系统保存对话框 + fs 落盘
    if (node) {
      try {
        var electron = node('electron');
        var fs = node('fs');
        var dlg = (electron.remote && electron.remote.dialog) || electron.dialog;
        if (dlg && typeof dlg.showSaveDialog === 'function' && fs) {
          var onPicked = function (r) {
            var p = r && (r.filePath || (r.filePaths && r.filePaths[0]));
            if (!p) { flash('已取消保存'); return; }
            try {
              fs.writeFileSync(p, text, 'utf8');
              flash('已保存：' + p);
            } catch (e) { flash('保存失败：' + e.message); }
          };
          var ret = dlg.showSaveDialog({ title: '保存 Markdown', defaultPath: name });
          if (ret && typeof ret.then === 'function') ret.then(onPicked, function () { flash('已取消保存'); });
          else onPicked(ret);
          return;
        }
      } catch (e) {}
    }
    // 2) 降级：触发下载（a[download]）
    try {
      var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      flash('已触发下载：' + name);
      return;
    } catch (e) {}
    // 3) 再降级：复制
    copyText(text);
    flash('当前环境不能保存文件，已复制内容');
  }

  /* ---------------------------- 对话模式 ---------------------------- */

  function renderChat() {
    var s = curSession();
    renderSideList();
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
      '</div>' +
      '<button type="button" class="tyai-msg-copy" title="复制这条内容">' + icon('copy', 12) + '</button>' +
      '</div></div>';
  }

  function scrollBottom(el) { el.scrollTop = el.scrollHeight; }

  function sendChat() {
    var q = composerInput.value.trim();
    if (!q || state.busy) return;
    var s = curSession();
    s.messages.push({ role: 'user', content: q });
    var titled = false;
    if (s.messages.length === 1) { s.title = q.slice(0, 18) || '新对话'; titled = true; }
    if (s.messages.length > MAX_TURNS) s.messages = s.messages.slice(-MAX_TURNS);
    saveSessions();
    if (titled) renderSideList();

    if (els.msgs.querySelector('.tyai-home')) els.msgs.innerHTML = '';
    els.msgs.insertAdjacentHTML('beforeend', msgHTML('user', q, s.messages.length - 1));
    composerInput.value = '';
    composerInput.style.height = 'auto';
    scrollBottom(els.msgs);

    var idx = s.messages.length;
    els.msgs.insertAdjacentHTML('beforeend',
      '<div class="tyai-msg tyai-msg-assistant" data-idx="' + idx + '"><div class="tyai-msg-avatar">' + logoMark(24) + '</div>' +
      '<div class="tyai-msg-body"><div class="tyai-msg-text"><div class="tyai-loading"><span></span><span></span><span></span></div></div>' +
      '<button type="button" class="tyai-msg-copy" title="复制这条内容">' + icon('copy', 12) + '</button></div></div>');
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
        paintStream(textEl, mdToHtml(acc), els.msgs);
      },
      onError: function (err) {
        if (needsSetup(err)) { flushStream(textEl, '<div class="tyai-err">' + esc(errText(err)) + '<button class="tyai-inline-btn" data-open-cfg="1">去配置</button></div>'); }
        else flushStream(textEl, '<div class="tyai-err">' + esc(errText(err)) + '</div>');
        if (acc) s.messages.push({ role: 'assistant', content: acc });
        saveSessions();
        renderSideList();
      },
      onEnd: function () {
        if (acc) s.messages.push({ role: 'assistant', content: acc });
        else if (!textEl.querySelector('.tyai-err')) flushStream(textEl, '<p class="tyai-empty">模型没有返回内容。</p>');
        saveSessions();
        renderSideList();
        updateActions();
      },
    });
  }

  /* ---------------------------- 智能体模式 ---------------------------- */
  /* 自主 Agent 循环（全部在客户端驱动，直连/桥接共用）：
     目标理解 → 任务分解 → 逐步执行（模型可调用工具、反思纠错）→ 收束沉淀。
     运行状态持久化在会话里（s.agent），重开面板/重启 Typora 后可恢复与继续。 */

  var AGENT_MEM_KEY = 'tyai.agent.mem';
  var AGENT_MAX_STEPS = 6;
  var AGENT_MAX_TURNS = 5;    // 每步最多几轮工具往返
  var AGENT_MAX_CALLS = 24;   // 整个任务最多几次 LLM 调用（保护钱包）

  function agentMemoryLoad() {
    try { return JSON.parse(localStorage.getItem(AGENT_MEM_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function agentMemorySaveList(list) {
    try { localStorage.setItem(AGENT_MEM_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  }
  function agentMemoryAdd(task, content) {
    if (!content) return;
    var list = agentMemoryLoad();
    list.push({ ts: Date.now(), task: String(task || '').slice(0, 80), content: String(content).slice(0, 2000) });
    agentMemorySaveList(list);
  }
  function agentMemoryBlock() {
    var list = agentMemoryLoad();
    if (!list.length) return '';
    var from = Math.max(0, list.length - 5);
    var recent = list.slice(from).map(function (m, i) {
      return (from + i + 1) + '. [' + (m.task || '早前任务') + '] ' + String(m.content).slice(0, 300);
    }).join('\n');
    return '\n\n【长期记忆（早前任务存下的要点，可用 memory_save 增补）】\n' + recent;
  }

  function agentState() {
    var s = curSession();
    return s.agent || null;
  }

  function agentPersist() {
    var a = agentState();
    if (a) a.updated = Date.now();
    saveSessions();
  }

  // 复制/插入文档用的全文
  function agentAllText() {
    var a = agentState();
    if (!a) return '';
    var out = ['> **智能体任务：' + a.task + '**', ''];
    a.steps.forEach(function (st, i) {
      if (!st || !st.text) return;
      out.push('**第 ' + (i + 1) + ' 步 · ' + st.title + '**', '', st.text, '');
    });
    if (a.summary) out.push('**小结**', '', a.summary, '');
    return out.join('\n').trim();
  }

  function toolArgBrief(tool, args) {
    args = args || {};
    if (tool === 'save_md') return String(args.name || suggestMdName());
    if (tool === 'clipboard') return '复制 ' + String(args.text || '').length + ' 字';
    if (tool === 'memory_save') return String(args.content || '').slice(0, 40);
    if (tool === 'memory_load') return '读取长期记忆';
    if (tool === 'read_document') return '重读文档';
    if (tool === 'todo_set') return '更新任务清单（' + ((args.items || []).length) + ' 项）';
    if (tool === 'plan_revise') return '调整剩余计划（' + ((args.steps || []).length) + ' 步）';
    if (tool === 'finish') return String(args.summary || '').slice(0, 60);
    return '';
  }

  function toolCallHTML(call) {
    var brief = toolArgBrief(call.tool, call.args);
    return '<div class="tyai-toolcall' + (call.ok ? '' : ' fail') + '" data-tool-toggle="1" title="点开/收起工具结果">' +
      '<span class="tyai-tool-dot"></span>' +
      '<code>' + esc(call.tool) + '</code>' +
      (brief ? '<i>' + esc(brief) + '</i>' : '') +
      (call.result ? '<div class="tyai-tool-result">' + esc(String(call.result).slice(0, 600)) + '</div>' : '') +
      '</div>';
  }

  function toolChipsHTML(st) {
    return (st.calls || []).map(toolCallHTML).join('');
  }

  function agentStepHTML(i, st) {
    var cls = st.status === 'done' ? ' done' : st.status === 'fail' ? ' fail' : '';
    return '<div class="tyai-step" data-step="' + i + '">' +
      '<div class="tyai-step-head"><span class="tyai-step-dot' + cls + '"></span><b>第 ' + (i + 1) + ' 步 · ' + esc(st.title) + '</b>' +
      '<i class="tyai-step-goal">' + esc(st.goal || '') + '</i></div>' +
      '<div class="tyai-step-body">' +
      (st.status === 'doing' ? '<div class="tyai-loading"><span></span><span></span><span></span></div>' : '') +
      '</div></div>';
  }

  // 整条时间线重绘（恢复 / 切 tab / 计划调整后用；流式期间不要调，避免打断 paintStream）
  function renderAgent() {
    var a = agentState();
    els.timeline.innerHTML = '';
    if (!a) { $('tyai-agent-hint').innerHTML = ''; return; }
    for (var i = 0; i < a.steps.length; i++) {
      var st = a.steps[i];
      els.timeline.insertAdjacentHTML('beforeend', agentStepHTML(i, st));
      if (st.text || (st.calls && st.calls.length)) {
        var card = els.timeline.querySelector('[data-step="' + i + '"]');
        if (card) card.querySelector('.tyai-step-body').innerHTML = mdToHtml(st.text || '') + toolChipsHTML(st);
      }
    }
    renderAgentHint();
    scrollBottom(els.timeline);
  }

  function renderAgentHint() {
    var a = agentState();
    var hint = $('tyai-agent-hint');
    if (!a) { hint.innerHTML = ''; return; }
    var done = 0;
    for (var i = 0; i < a.steps.length; i++) if (a.steps[i] && a.steps[i].status === 'done') done++;
    var label = { running: '运行中', done: '已完成', error: '已出错', stopped: '已停止' }[a.status] || '';
    var todoBits = '';
    if (a.todo && a.todo.length) {
      var tdone = 0;
      for (var j = 0; j < a.todo.length; j++) if (a.todo[j].status === 'done') tdone++;
      todoBits = ' · 清单 ' + tdone + '/' + a.todo.length;
    }
    var resume = (a.status === 'stopped' || a.status === 'error')
      ? ' <button type="button" class="tyai-inline-btn" data-agent-resume="1">继续</button>' : '';
    hint.innerHTML = '任务：' + esc(String(a.task).slice(0, 40)) + ' · ' + label +
      '（' + done + '/' + a.steps.length + ' 步）' + todoBits + resume;
  }

  function runAgent(task, resume) {
    var a = agentState();
    if (state.busy) { flash('正在生成中，先等当前任务完成或点停止'); return; }
    if (resume && a && a.task) {
      task = a.task;
      for (var i = 0; i < a.steps.length; i++) {
        if (a.steps[i].status !== 'done') a.steps[i].status = 'todo';
      }
      a.status = 'running';
      a.calls = a.calls || 0;
    } else {
      if (!task) { flash('先描述一下学习任务'); return; }
      a = curSession().agent = { task: task, steps: [], status: 'running', calls: 0, todo: null, summary: '' };
    }
    els.timeline.innerHTML = '';
    setBusy(true);
    agentPersist();
    renderAgent();

    var aborted = { v: false };
    var abortFn = null;
    var currentIdx = -1;

    state.abort = function () {
      aborted.v = true;
      try { abortFn && abortFn(); } catch (e) {}
      var cur = agentState();
      if (cur && cur.status === 'running') {
        if (currentIdx >= 0 && cur.steps[currentIdx]) cur.steps[currentIdx].status = 'todo';
        cur.status = 'stopped';
        agentPersist();
        renderAgentHint();
      }
      setBusy(false);
      updateActions();
      flash('已停止，可点「继续」接着跑');
    };

    function callLLM(messages, temperature, onDone, onFail, onDelta) {
      if (a.calls >= AGENT_MAX_CALLS) {
        onFail(new Error('已达本任务调用上限（' + AGENT_MAX_CALLS + ' 次），任务到此为止'), '');
        return;
      }
      a.calls++;
      var acc = '';
      abortFn = llmStream({ messages: messages, temperature: temperature }, {
        onDelta: function (d) {
          if (aborted.v) return;
          acc += d;
          if (onDelta) onDelta(d, acc);
        },
        onEnd: function () { if (!aborted.v) onDone(acc); },
        onError: function (err) { if (!aborted.v) onFail(err, acc); },
      });
    }

    function stepBody(idx) {
      var card = els.timeline.querySelector('[data-step="' + idx + '"]');
      return card ? card.querySelector('.tyai-step-body') : null;
    }

    function finishAll(status) {
      a.status = status;
      if (status === 'done') {
        agentMemoryAdd(a.task, '任务「' + a.task + '」完成。' + (a.summary ? '小结：' + a.summary : ''));
      }
      agentPersist();
      renderAgent();          // 与（可能被 finish 截断过的）步骤列表同步
      renderAgentHint();
      setBusy(false);
      updateActions();
      scrollBottom(els.timeline);
    }

    function agentFail(idx, err) {
      var html = '<div class="tyai-err">' + esc(errText(err)) +
        (needsSetup(err) ? '<button class="tyai-inline-btn" data-open-cfg="1">去配置</button>' : '') + '</div>';
      if (idx != null && a.steps[idx]) {
        a.steps[idx].status = 'fail';
        var body = stepBody(idx);
        if (body) {
          body.insertAdjacentHTML('beforeend', html);
          var card = els.timeline.querySelector('[data-step="' + idx + '"]');
          var dot = card && card.querySelector('.tyai-step-dot');
          if (dot) dot.classList.add('fail');
        }
      } else {
        els.timeline.insertAdjacentHTML('beforeend', html);
      }
      a.status = 'error';
      agentPersist();
      renderAgentHint();
      setBusy(false);
      updateActions();
      scrollBottom(els.timeline);
    }

    function firstTodo() {
      for (var i = 0; i < a.steps.length; i++) {
        if (a.steps[i].status !== 'done') return i;
      }
      return -1;
    }

    function markStepDone(idx, note) {
      var st = a.steps[idx];
      if (note) st.text = (st.text ? st.text + '\n\n' : '') + note;
      st.status = 'done';
      var body = stepBody(idx);
      if (body) {
        var card = els.timeline.querySelector('[data-step="' + idx + '"]');
        var dot = card && card.querySelector('.tyai-step-dot');
        if (dot) dot.classList.add('done');
        flushStream(body, mdToHtml(st.text) + toolChipsHTML(st));
      }
      agentPersist();
      updateActions();
      scrollBottom(els.timeline);
    }

    function completeStep(idx, note) {
      markStepDone(idx, note);
      execFrom(firstTodo());
    }

    function execFrom(idx) {
      if (idx < 0) { finishAll('done'); return; }
      runStep(idx);
    }

    // ---- 工具执行（本地能力，全部同步完成） ----
    function execTool(call, cb) {
      var args = call.args || {};
      var name = call.tool;
      if (name === 'read_document') {
        var doc = getDocText();
        return cb(doc ? '文档全文（' + doc.length + ' 字）：\n' + doc : '（当前没有打开的文档）', !!doc);
      }
      if (name === 'save_md') {
        var content = String(args.content || agentAllText() || '');
        if (!content) return cb('没有可保存的内容', false);
        saveMarkdown(content, String(args.name || '') || suggestMdName());
        return cb('已执行保存（保存对话框/下载/剪贴板，视环境而定）。', true);
      }
      if (name === 'clipboard') {
        var t = String(args.text || '');
        if (!t) return cb('没有可复制的内容', false);
        copyText(t);
        return cb('已复制到剪贴板（' + t.length + ' 字）', true);
      }
      if (name === 'memory_save') {
        if (!args.content) return cb('没有要记的内容', false);
        agentMemoryAdd(a.task, String(args.content));
        return cb('已存入长期记忆（现有 ' + agentMemoryLoad().length + ' 条）', true);
      }
      if (name === 'memory_load') {
        var list = agentMemoryLoad();
        if (!list.length) return cb('（长期记忆为空）', true);
        return cb(list.slice(-8).map(function (m, i) {
          return (i + 1) + '. [' + (m.task || '') + '] ' + m.content;
        }).join('\n'), true);
      }
      if (name === 'todo_set') {
        var items = Array.isArray(args.items) ? args.items : [];
        if (!items.length) return cb('清单为空', false);
        a.todo = items.slice(0, 10).map(function (t) {
          return {
            text: String(t && t.text || '').slice(0, 60),
            status: (t && t.status === 'done') ? 'done' : (t && t.status === 'doing') ? 'doing' : 'todo',
          };
        });
        renderAgentHint();
        return cb('任务清单已更新', true);
      }
      if (name === 'plan_revise') {
        var ns = Array.isArray(args.steps) ? args.steps : [];
        var clean = [];
        for (var i = 0; i < ns.length && clean.length < AGENT_MAX_STEPS; i++) {
          var n = ns[i];
          if (!n || (!n.title && !n.goal)) continue;
          clean.push({
            title: String(n.title || n.goal).slice(0, 30),
            goal: String(n.goal || n.title).slice(0, 200),
            status: 'todo', text: '', calls: [],
          });
        }
        if (!clean.length) return cb('计划修订失败：没有有效步骤', false);
        a.steps = a.steps.slice(0, currentIdx + 1).concat(clean);
        renderAgent();
        return cb('剩余计划已调整为 ' + clean.length + ' 步', true);
      }
      return cb('未知工具：' + name, false);
    }

    function runStep(idx) {
      var st = a.steps[idx];
      currentIdx = idx;
      st.status = 'doing';
      st.text = st.text || '';
      st.calls = st.calls || [];
      agentPersist();
      renderAgent();          // 重建卡片（含 loading 态）
      scrollBottom(els.timeline);

      var turns = 0;
      var retried = false;
      var history = [];       // 本步内已完成的工具往返：{a: 模型输出, q: 工具结果}（反思纠错用）

      function stepMessages() {
        var prev = [];
        for (var i = 0; i < idx; i++) {
          if (a.steps[i].status === 'done' && a.steps[i].text) {
            prev.push('【第' + (i + 1) + '步 · ' + a.steps[i].title + '】\n' + String(a.steps[i].text).slice(0, 2000));
          }
        }
        var todoBits = '';
        if (a.todo && a.todo.length) {
          todoBits = '\n当前任务清单：' + a.todo.map(function (t) {
            return t.text + '(' + t.status + ')';
          }).join('、');
        }
        var user = '总任务：' + a.task +
          '\n当前执行第 ' + (idx + 1) + '/' + a.steps.length + ' 步：' + st.title + ' —— ' + st.goal +
          (state.lastSelection ? '\n用户选中的内容（优先围绕它）：\n<<<\n' + String(state.lastSelection).slice(0, 4000) + '\n>>>' : '') +
          '\n文档上下文（可能截断，可用 read_document 重读）：\n<<<DOC\n' + getDocText() + '\nDOC>>>' +
          (prev.length ? '\n\n前面步骤的成果（衔接即可，不要重复）：\n' + prev.join('\n\n') : '') +
          todoBits +
          '\n\n现在执行这一步。需要工具就调用（块放回复末尾），完成后直接输出给用户的最终内容。';
        var msgs = [{ role: 'system', content: DP.AGENT_LOOP_SYSTEM + agentMemoryBlock() }];
        msgs.push({ role: 'user', content: user });
        for (var k = 0; k < history.length; k++) {
          if (history[k].a) msgs.push({ role: 'assistant', content: history[k].a });
          msgs.push({ role: 'user', content: history[k].q });
        }
        return msgs;
      }

      // 流式期间：隐藏工具块（含未闭合半截），正文 + 已有工具卡一起重绘
      function paintBody(curAcc) {
        var body = stepBody(idx);
        if (!body) return;
        var shown = st.text;
        if (curAcc) shown = (shown ? shown + '\n\n' : '') + DP.stripToolBlocks(curAcc);
        paintStream(body, mdToHtml(shown) + toolChipsHTML(st) || '<p class="tyai-empty">…</p>', els.timeline);
      }

      function turn() {
        if (aborted.v) return;
        if (turns >= AGENT_MAX_TURNS) {
          completeStep(idx, '（本步工具轮次已达上限，继续下一步）');
          return;
        }
        turns++;
        callLLM(stepMessages(), 0.4, function (acc) {
          if (aborted.v) return;
          var call = DP.parseToolCall(acc);
          var prose = DP.stripToolBlocks(acc).trim();
          if (prose) st.text = (st.text ? st.text + '\n\n' : '') + prose;
          if (!call) return completeStep(idx);
          execTool(call, function (result, ok) {
            st.calls.push({ tool: call.tool, args: call.args, ok: ok, result: String(result).slice(0, 1500) });
            if (call.tool === 'finish') {
              a.summary = String((call.args && call.args.summary) || '').slice(0, 300);
              a.steps = a.steps.slice(0, idx + 1);   // 提前收束：丢弃剩余步骤
              markStepDone(idx);
              finishAll('done');
              return;
            }
            agentPersist();
            if (aborted.v) return;
            paintBody('');
            scrollBottom(els.timeline);
            history.push({
              a: acc,
              q: '【工具结果 · ' + call.tool + (ok ? '' : ' · 失败') + '】\n' + String(result).slice(0, 2000) +
                '\n（收到结果。若工具失败请换一种做法；不需要再调用工具时，直接输出给用户的最终内容）',
            });
            turn();
          });
        }, function (err) {
          if (!retried) {
            // 反思纠错：把错误喂回去，让模型换一种做法重试一次
            retried = true;
            history.push({ a: '', q: '【错误】上一次请求失败：' + errText(err) + '。请重试本步，必要时调整做法。' });
            turn();
            return;
          }
          agentFail(idx, err);
        }, function (d, acc) { paintBody(acc); });
      }

      turn();
    }

    // ---- 阶段 1：目标理解与任务分解（续跑时已有计划则跳过） ----
    function planPhase() {
      if (a.steps.length) { execFrom(firstTodo()); return; }
      var loading = '<div class="tyai-plan-loading"><div class="tyai-loading"><span></span><span></span><span></span></div></div>';
      els.timeline.innerHTML = loading;
      callLLM([
        { role: 'system', content: DP.AGENT_PLAN_SYSTEM },
        { role: 'user', content: DP.agentPlanPrompt({
            task: a.task,
            selection: state.lastSelection || '',
            docText: getDocText(),
          }) },
      ], 0.3, function (acc) {
        var steps = DP.parsePlan(acc) || [{ title: '执行任务', goal: a.task }];
        for (var i = 0; i < steps.length; i++) {
          a.steps.push({ title: steps[i].title, goal: steps[i].goal, status: 'todo', text: '', calls: [] });
        }
        agentPersist();
        renderAgent();
        execFrom(0);
      }, function (err) {
        agentFail(null, err);
      }, function () {});
    }

    planPhase();
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
    if (state.busy) { flash('正在生成中，先等当前回答完成或点停止'); return; }
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
        paintStream(els.quickResult, mdToHtml(state.lastResult) || '<p class="tyai-empty">…</p>', els.quickResult);
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
        paintStream(els.quickResult, mdToHtml(state.lastResult), els.quickResult);
        updateActions();
      },
      onError: function (err) { showQuickError(errText(err)); },
      onEnd: function () {
        if (!state.lastResult && !els.quickResult.querySelector('.tyai-err')) showQuickError('模型没有返回内容，请重试。');
        updateActions();
      },
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

    try {
      console.log('[xff助手一号] v' + VERSION + ' · ' + KERNEL.label + ' · ' +
        (KERNEL.modern ? '完整形态' : '兼容形态') + ' · ' + (MODE === 'direct' ? '直连' : '桥接') + '模式');
    } catch (e) {}

    // 错误提示里的「去配置」按钮（事件委托）
    root.addEventListener('click', function (e) {
      var b = e.target.closest('.tyai-inline-btn[data-open-cfg]');
      if (b) openSheet();
    });

    // 测试台 / 调试：带 #open 直接展开面板
    if (String(location.hash || '').indexOf('open') >= 0) togglePanel(true);

    window.__tyai = {
      version: VERSION,
      kernel: function () { return KERNEL; },
      open: function () { togglePanel(true); },
      tab: switchTab,
      runScene: function (scene, text) { togglePanel(true); return runScene(scene, text); },
      chat: function (text) { togglePanel(true); switchTab('chat'); composerInput.value = text; sendChat(); },
      agent: function (text) { togglePanel(true); switchTab('agent'); runAgent(text); },
      cfg: function () { return CFG; },
      mode: function () { return MODE; },
      sheet: openSheet,
      modelPop: toggleModelPop,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
