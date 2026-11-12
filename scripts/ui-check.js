/* ==========================================================================
   xff助手一号 · 交互回归（真实浏览器驱动，走 mock 测试台）
   --------------------------------------------------------------------------
   覆盖 v2.9.0 新交互的「行为」而不只是「长什么样」：
     1. 流式期间上滑 → 不被拽回底部，出现「回到底部」
     2. 停止 → 已生成内容保留 + 标「已停止」+ 「继续」常驻
     3. 继续 → 在同一气泡里接着长
     4. 换 md 文件 → 自动开/切到该文件自己的会话，旧会话留在侧栏
     5. Esc 分层：先收起会话栏，再关面板
     6. 编辑重发 → 覆盖其后回答
     7. 页面无 JS 报错
   用法：node scripts/ui-check.js [--shots]
   依赖：playwright-core（驱动本机 Edge，不下载浏览器）
   ========================================================================== */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT = 8766;
const BASE = 'http://127.0.0.1:' + PORT;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SHOTS = path.join(ROOT, 'shots');
const WANT_SHOTS = process.argv.indexOf('--shots') >= 0;

const { chromium } = require('playwright-core');

let fails = 0;
function ok(name, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (WANT_SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 520, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  async function shot(name) {
    if (WANT_SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  }

  async function waitIdle(ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (!(await page.evaluate(() => window.__tyai.busy()))) return true;
      await sleep(120);
    }
    return false;
  }

  /* ---------- 1+2+3：流式阅读 / 停止 / 继续 ---------- */
  console.log('\n[1] 流式期间上滑 + 停止 + 继续');
  await page.goto(BASE + '/?slowstream=55&long=1&tab=chat#open');
  await page.waitForFunction(() => window.__tyai && document.getElementById('tyai-panel'));
  await page.evaluate(() => window.__tyai.chat('讲讲梯度下降'));
  await sleep(5200);      // 先让内容溢出可视区（否则"上滑"没有意义）

  const before = await page.evaluate(() => {
    const el = document.querySelector('.tyai-msgs');
    el.scrollTop = 0;
    el.dispatchEvent(new Event('scroll'));
    return { sh: el.scrollHeight, ch: el.clientHeight, top: el.scrollTop };
  });
  await sleep(1200);                                    // 期间仍有 delta 进来
  const after = await page.evaluate(() => ({
    top: document.querySelector('.tyai-msgs').scrollTop,
    jump: document.getElementById('tyai-jump').classList.contains('on'),
  }));
  ok('上滑后视口没有被拽回底部', after.top <= 2, '(scrollTop=' + after.top + ')');
  ok('出现「回到底部」按钮', after.jump === true);
  await shot('10-scroll-jump');

  await page.click('#tyai-jump');
  const jumped = await page.evaluate(() => {
    const el = document.querySelector('.tyai-msgs');
    return el.scrollHeight - el.scrollTop - el.clientHeight < 4;
  });
  ok('点「回到底部」能真的到底', jumped === true);

  const midLen = await page.evaluate(() => {
    const m = window.__tyai.current().messages;
    return (m[m.length - 1] || {}).content.length;
  });
  await page.evaluate(() => window.__tyai.stop());
  await sleep(300);
  const stopped = await page.evaluate(() => {
    const m = window.__tyai.current().messages;
    const last = m[m.length - 1];
    return {
      len: last.content.length,
      stopped: last.stopped === true,
      busy: window.__tyai.busy(),
      badge: !!document.querySelector('.tyai-msg-stopped'),
      acts: !!document.querySelector('.tyai-msg-acts.is-pinned [data-msg-act="continue"]'),
    };
  });
  ok('停止后已生成内容全部保留', stopped.len >= midLen && stopped.len > 20, '(' + midLen + '→' + stopped.len + ' 字)');
  ok('消息被标记为「已停止」并落库', stopped.stopped === true);
  ok('界面出现「已停止生成」', stopped.badge === true);
  ok('「继续」按钮常驻可见', stopped.acts === true);
  ok('停止后不再 busy', stopped.busy === false);
  await shot('11-stopped');

  await page.click('[data-msg-act="continue"]');
  await sleep(1500);
  await page.evaluate(() => window.__tyai.stop());
  await sleep(200);
  const contLen = await page.evaluate(() => {
    const m = window.__tyai.current().messages;
    return { n: m.length, len: m[m.length - 1].content.length };
  });
  ok('「继续」在同一气泡里接着写（不新增消息）', contLen.n === 2, '(消息数=' + contLen.n + ')');
  ok('继续后内容变长', contLen.len > stopped.len, '(' + stopped.len + '→' + contLen.len + ')');

  /* ---------- 4：换文档 → 换会话 ---------- */
  console.log('\n[2] 切换 md 文件');
  await page.evaluate(() => window.__tyai.chat('关于 alpha 的问题'));
  await sleep(800);
  await page.evaluate(() => window.__tyai.stop());
  await waitIdle();
  const before4 = await page.evaluate(() => ({
    n: window.__tyai.sessions().length,
    msgs: window.__tyai.current().messages.length,
    doc: window.__tyai.current().doc,
  }));
  ok('会话已绑定当前文档 alpha', /alpha\.md$/.test(before4.doc || ''), '(' + before4.doc + ')');

  await page.evaluate(() => { window.__mockDoc = '/mock/beta.md'; window.__tyai.checkDoc(); });
  await sleep(400);
  const after4 = await page.evaluate(() => ({
    n: window.__tyai.sessions().length,
    msgs: window.__tyai.current().messages.length,
    doc: window.__tyai.current().doc,
    apx: document.querySelectorAll('#tyai-side-list .tyai-side-item').length,
  }));
  ok('换文件后新建了会话', after4.n === before4.n + 1, '(' + before4.n + '→' + after4.n + ')');
  ok('新会话里没有上一篇的对话', after4.msgs === 0, '(msgs=' + after4.msgs + ')');
  ok('新会话绑定到 beta', /beta\.md$/.test(after4.doc || ''));
  await shot('12-doc-switch');

  await page.evaluate(() => { window.__mockDoc = '/mock/alpha.md'; window.__tyai.checkDoc(); });
  await sleep(400);
  const back4 = await page.evaluate(() => ({
    doc: window.__tyai.current().doc,
    msgs: window.__tyai.current().messages.length,
  }));
  ok('切回 alpha 时回到原来那段对话（不是新建）', /alpha\.md$/.test(back4.doc || '') && back4.msgs > 0,
    '(msgs=' + back4.msgs + ')');

  /* ---------- 5：侧栏快捷关闭 ---------- */
  console.log('\n[3] 侧栏快捷关闭');
  await page.evaluate(() => window.__tyai.side(true));
  ok('侧栏已展开', await page.evaluate(() => document.getElementById('tyai-panel').classList.contains('side-on')));
  await shot('13-side-open');

  // 生成中按 Esc 应该先停止生成（主流约定），而不是关面板
  await page.evaluate(() => window.__tyai.chat('Esc 应该停止生成'));
  await sleep(600);
  await page.keyboard.press('Escape');
  await sleep(400);
  const escStop = await page.evaluate(() => ({
    busy: window.__tyai.busy(),
    side: document.getElementById('tyai-panel').classList.contains('side-on'),
    open: document.getElementById('tyai-panel').classList.contains('on'),
  }));
  ok('生成中 Esc = 停止生成（面板与侧栏都留着）', escStop.busy === false && escStop.side === true && escStop.open === true);
  await waitIdle();

  await page.keyboard.press('Escape');
  await sleep(150);
  const esc1 = await page.evaluate(() => ({
    side: document.getElementById('tyai-panel').classList.contains('side-on'),
    open: document.getElementById('tyai-panel').classList.contains('on'),
  }));
  ok('空闲时 Esc 收起侧栏但面板还在', esc1.side === false && esc1.open === true);
  await page.keyboard.press('Escape');
  await sleep(150);
  ok('再按 Esc 关掉面板', await page.evaluate(() => !document.getElementById('tyai-panel').classList.contains('on')));

  await page.evaluate(() => window.__tyai.open());
  await page.evaluate(() => window.__tyai.side(true));
  await page.click('#tyai-side-fold');
  await sleep(150);
  ok('侧栏 × 能收起侧栏', await page.evaluate(() => !document.getElementById('tyai-panel').classList.contains('side-on')));

  /* ---------- 6：编辑重发 ---------- */
  console.log('\n[4] 编辑重发');
  await page.evaluate(() => window.__tyai.side(false));
  await waitIdle();
  const idx = await page.evaluate(() => {
    const m = window.__tyai.current().messages;
    for (let i = m.length - 1; i >= 0; i--) if (m[i].role === 'user') return i;
    return -1;
  });
  await page.evaluate((i) => {
    const btn = document.querySelector('.tyai-msg[data-idx="' + i + '"] [data-msg-act="edit"]');
    if (btn) btn.click();
  }, idx);
  const editing = await page.evaluate(() => ({
    bar: !document.getElementById('tyai-editbar').hidden,
    val: document.getElementById('tyai-input').value,
  }));
  ok('点「编辑」进入编辑态并回填原文', editing.bar === true && editing.val.length > 0);
  await page.fill('#tyai-input', '改过的问题');
  await page.press('#tyai-input', 'Enter');
  await sleep(900);
  await page.evaluate(() => window.__tyai.stop());
  await waitIdle();
  const edited = await page.evaluate(() => {
    const m = window.__tyai.current().messages;
    return { n: m.length, lastUser: (m.filter((x) => x.role === 'user').pop() || {}).content };
  });
  ok('编辑重发后提问被替换', edited.lastUser === '改过的问题', '(' + edited.lastUser + ')');

  /* ---------- 7：Markdown 嵌套列表 ---------- */
  console.log('\n[5] 渲染');
  const md = await page.evaluate(() => {
    const html = window.__tyai.renderMd
      ? window.__tyai.renderMd('- a\n  - b\n  - c\n- d\n- [x] 完成\n- [ ] 待办')
      : '';
    return html;
  });
  if (md) {
    ok('嵌套列表结构正确', /<ul><li>a<ul><li>b<\/li><li>c<\/li><\/ul><\/li><li>d/.test(md), md.replace(/\n/g, ''));
    ok('任务清单有勾选框', /tyai-task done/.test(md) && /tyai-task"/.test(md));
  }

  /* ---------- 7：智能体中途停止 ---------- */
  console.log('\n[6] 智能体中途停止');
  await page.goto(BASE + '/?tab=agent&slowstream=45#open');
  await page.waitForFunction(() => window.__tyai && window.__tyai.version);
  await page.evaluate(() => window.__tyai.agent('整理成复习笔记'));
  await sleep(2600);
  await page.evaluate(() => window.__tyai.stop());
  await sleep(400);
  const ag = await page.evaluate(() => {
    const a = window.__tyai.current().agent;
    return {
      status: a && a.status,
      stepStatus: a && a.steps[0] && a.steps[0].status,
      textLen: a && a.steps[0] ? (a.steps[0].text || '').length : 0,
      resume: !!document.querySelector('[data-agent-resume]'),
      busy: window.__tyai.busy(),
    };
  });
  ok('停止后智能体状态为 stopped', ag.status === 'stopped');
  ok('被打断的步骤保留已生成内容', ag.textLen > 0, '(' + ag.textLen + ' 字)');
  ok('该步骤标记为 stopped', ag.stepStatus === 'stopped', '(' + ag.stepStatus + ')');
  ok('出现「继续」按钮', ag.resume === true);
  ok('停止后不再 busy', ag.busy === false);

  /* ---------- 8：面板外点击策略 ---------- */
  console.log('\n[7] 面板外点击');
  await page.evaluate(() => { window.__tyai.tab('chat'); window.__tyai.open(); });
  await page.mouse.click(40, 60);
  await sleep(200);
  ok('默认点面板外不收起（读文档时面板要留得住）',
    await page.evaluate(() => document.getElementById('tyai-panel').classList.contains('on')));
  await page.evaluate(() => { window.__tyai.cfg().closeOnOutside = true; });
  await page.mouse.click(40, 60);
  await sleep(200);
  ok('开关打开后点面板外会收起',
    await page.evaluate(() => !document.getElementById('tyai-panel').classList.contains('on')));

  /* ---------- 9：草稿按会话隔离 ---------- */
  console.log('\n[8] 输入草稿');
  await page.evaluate(() => { window.__tyai.cfg().closeOnOutside = false; window.__tyai.open(); });
  const draftBefore = await page.evaluate(() => window.__tyai.current().id);
  await page.fill('#tyai-input', '这段草稿属于会话 A');
  await page.evaluate(() => document.getElementById('tyai-side-new').click());
  await sleep(250);
  const draftSwitched = await page.evaluate(() => document.getElementById('tyai-input').value);
  ok('新建会话后输入框清空', draftSwitched === '', '(' + draftSwitched + ')');
  await page.evaluate((id) => {
    const list = document.querySelectorAll('#tyai-side-list .tyai-side-item');
    for (let i = 0; i < list.length; i++) if (list[i].getAttribute('data-id') === id) list[i].click();
  }, draftBefore);
  await sleep(250);
  ok('切回原会话时草稿还在', (await page.evaluate(() => document.getElementById('tyai-input').value)) === '这段草稿属于会话 A');

  console.log('\n[9] 运行时错误');
  const real = errors.filter((e) => !/favicon|net::ERR_|Failed to load resource/i.test(e));
  ok('页面无 JS 报错', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n' + (fails ? '✗ 失败 ' + fails + ' 项' : '✓ 全部通过'));
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error('运行出错：', e);
  process.exit(2);
});
