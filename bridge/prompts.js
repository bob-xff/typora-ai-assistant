'use strict';

const BASE_SYSTEM = `你是一位严谨、耐心的学习助手，嵌入在用户的 Markdown 阅读器（Typora）里。
用户正在阅读或整理一篇文档，希望你能帮他真正读懂，而不是替他读完。

硬性要求：
1. 默认用简体中文回答；用户明确要求其他语言时才切换。
2. 先给结论，再给推理。开篇不要寒暄，不要复述用户的原文。
3. 出现专业术语时，顺手用一句话解释清楚。
4. 用 Markdown 排版（标题、列表、表格）；数学公式用 $...$ 或 $$...$$。
5. 材料不足以回答时，直说缺什么，禁止编造事实、数据或引用。
6. 不要输出「希望这对你有帮助」这类填充语句。`;

function docBlock(ctx) {
  if (!ctx) return '';
  const parts = [];
  if (ctx.filePath) parts.push(`当前文件：${ctx.filePath}`);
  if (ctx.title) parts.push(`文档标题：${ctx.title}`);
  if (ctx.docText) {
    parts.push(`文档全文（可能被截断，仅供理解上下文）：\n<<<DOC\n${ctx.docText}\nDOC>>>`);
  }
  return parts.length ? `\n\n【上下文】\n${parts.join('\n')}` : '';
}

const SCENES = {
  explain: {
    title: '解释',
    hint: '把选中内容讲清楚',
    build: (req) =>
      `请解释下面这段内容：\n\n<<<\n${req.text}\n>>>\n\n` +
      `按这个结构回答：\n` +
      `1. **一句话**说清它在讲什么。\n` +
      `2. 分点展开关键概念（每个概念配一句白话解释）。\n` +
      `3. 给一个贴近生活的类比或例子。\n` +
      `4. 如果这是某个更大知识体系的一环，指出它和相邻概念的关系。`,
  },

  translate: {
    title: '翻译',
    hint: '中英互译并保留格式',
    build: (req) =>
      `把下面的内容翻译一下：\n\n<<<\n${req.text}\n>>>\n\n` +
      `规则：内容主要是中文就译成英文，主要是英文就译成中文。` +
      `保留原有的 Markdown 结构、公式和代码块。先给译文，` +
      `最后另起一段用「术语对照」列出 3-5 个值得记的词。`,
  },

  plain: {
    title: '说人话',
    hint: '用大白话重讲一遍',
    build: (req) =>
      `把下面这段内容用大白话重讲一遍，让完全没接触过这个领域的人也能听懂：\n\n<<<\n${req.text}\n>>>\n\n` +
      `要求：不许堆术语；必须保留原意，不许为了简单而失真。` +
      `讲完后再补一句「严谨版本」的精确表述。`,
  },

  summarize: {
    title: '总结',
    hint: '提炼全文要点',
    build: (req) =>
      `请总结下面这篇文档：\n\n<<<\n${req.text}\n>>>\n\n` +
      `输出格式：\n` +
      `- **一句话主旨**\n` +
      `- **核心要点**（3-7 条，每条不超过 30 字）\n` +
      `- **关键结论/数据**（有就列，没有就跳过）\n` +
      `- **读后应该能回答的问题**（2-3 个）`,
  },

  outline: {
    title: '大纲',
    hint: '生成结构化提纲',
    build: (req) =>
      `请为下面的文档生成一份层级大纲：\n\n<<<\n${req.text}\n>>>\n\n` +
      `用 Markdown 多级列表表示层次，标题要精炼。` +
      `大纲之后，另起一段指出原文结构中「逻辑跳跃或缺失」的地方（如果有）。`,
  },

  quiz: {
    title: '考考我',
    hint: '出题检验掌握程度',
    build: (req) =>
      `请基于下面这段内容出 3 道题来检测我是否真的读懂了：\n\n<<<\n${req.text}\n>>>\n\n` +
      `要求：\n` +
      `- 题型混合：1 道概念题、1 道应用题、1 道「判断对错并说明理由」。\n` +
      `- **先只给题目**，不要泄露答案。\n` +
      `- 题目全部写完后，另起一段用 <details><summary>查看答案</summary> ... </details> 包住答案与解析。`,
  },

  ask: {
    title: '追问',
    hint: '自由提问',
    build: (req) =>
      (req.text ? `选中的内容：\n<<<\n${req.text}\n>>>\n\n` : '') +
      `我的问题：${req.question || ''}`,
  },
};

function buildMessages(scene, req) {
  const def = SCENES[scene] || SCENES.ask;
  const messages = [{ role: 'system', content: BASE_SYSTEM + docBlock(req.context) }];

  const history = Array.isArray(req.history) ? req.history.slice(-10) : [];
  for (const turn of history) {
    if (!turn || !turn.role || !turn.content) continue;
    messages.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content) });
  }

  messages.push({ role: 'user', content: def.build(req) });
  return messages;
}

/* ------------------------------------------------------------------ *
 * 对话模式（多轮）
 * ------------------------------------------------------------------ */

const CHAT_SYSTEM =
  BASE_SYSTEM +
  `\n7. 当前处于「对话模式」：保持上下文连贯，用户追问时直接回应，不必每次都长篇大论。
8. 用户引用「选中的内容」时，优先围绕它回答。`;

function buildChatMessages({ history, context, selection }) {
  const ctx = Object.assign({}, context || {});
  if (selection && !ctx.selection) ctx.selection = selection;
  const sys = CHAT_SYSTEM + docBlock(ctx) +
    (ctx.selection ? `\n\n【选中的内容】\n<<<\n${String(ctx.selection).slice(0, 4000)}\n>>>` : '');

  const messages = [{ role: 'system', content: sys }];
  const hist = Array.isArray(history) ? history.slice(-40) : [];
  for (const turn of hist) {
    if (!turn || !turn.role || !turn.content) continue;
    messages.push({ role: turn.role === 'assistant' ? 'assistant' : 'user', content: String(turn.content).slice(0, 16000) });
  }
  return messages;
}

/* ------------------------------------------------------------------ *
 * 智能体模式（计划 → 分步执行）
 * ------------------------------------------------------------------ */

const AGENT_PLAN_SYSTEM = `你是「学习智能体」，运行在用户本地的学习助手里。用户会给你一个学习任务和一份文档上下文。
你的第一步是把任务拆解成 2~4 个可执行的步骤。

硬性要求：
1. 只输出一个 JSON 对象，禁止输出 JSON 以外的任何文字（包括解释、代码块围栏）。
2. 格式：{"steps":[{"title":"步骤短标题（不超过12字）","goal":"这一步具体做什么，一句话"}]}
3. 步骤通常依次为：梳理讲解 → 深入举例 → 检验总结；按任务需要调整。
4. 不要编造文档里不存在的知识。文档不足以完成任务时，在对应步骤的 goal 里写明「基于通用知识」。`;

const AGENT_STEP_SYSTEM =
  BASE_SYSTEM +
  `\n6. 当前处于「智能体模式」：你正在执行多步骤任务中的一步。直接输出这一步的成果，不要复述步骤名，不要说「接下来我们」。
7. 若这不是最后一步，结尾不要对整个任务做总结；最后一步需要给出收束性的小结。`;

function agentPlanPrompt({ task, selection, docText }) {
  return [
    `学习任务：${task}`,
    selection ? `\n用户选中的内容（优先围绕它）：\n<<<\n${selection.slice(0, 4000)}\n>>>` : '',
    docText ? `\n文档上下文（可能截断）：\n<<<DOC\n${docText}\nDOC>>>` : '',
    '\n请输出拆解步骤的 JSON。',
  ].filter(Boolean).join('\n');
}

function agentStepPrompt({ task, step, index, total, prevResults, selection, docText }) {
  const prev = prevResults
    .map((r, i) => `【步骤${i + 1} · 已完成】\n${String(r).slice(0, 3000)}`)
    .join('\n\n');
  return [
    `总任务：${task}`,
    step ? `当前是第 ${index + 1}/${total} 步：${step.title} —— ${step.goal}` : '',
    selection ? `\n用户选中的内容：\n<<<\n${selection.slice(0, 4000)}\n>>>` : '',
    docText ? `\n文档上下文（可能截断）：\n<<<DOC\n${docText}\nDOC>>>` : '',
    prev ? `\n\n前面步骤的成果（供衔接，不要重复）：\n${prev}` : '',
    '\n现在直接输出这一步的成果。',
  ].filter(Boolean).join('\n\n');
}

// 从模型输出里稳健地抠出计划 JSON；失败返回 null
function parsePlan(text) {
  if (!text) return null;
  let t = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  try {
    const obj = JSON.parse(t.slice(start, end));
    const steps = Array.isArray(obj.steps) ? obj.steps : [];
    const clean = steps
      .filter((s) => s && (s.title || s.goal))
      .slice(0, 5)
      .map((s) => ({ title: String(s.title || s.goal).slice(0, 30), goal: String(s.goal || s.title).slice(0, 200) }));
    return clean.length ? clean : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  SCENES,
  buildMessages,
  BASE_SYSTEM,
  CHAT_SYSTEM,
  buildChatMessages,
  AGENT_PLAN_SYSTEM,
  AGENT_STEP_SYSTEM,
  agentPlanPrompt,
  agentStepPrompt,
  parsePlan,
};
