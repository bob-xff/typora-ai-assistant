# 安全自检清单 · xff助手一号

> 适用版本：**v2.6.0** ｜ 最近审计：2026-10-12 ｜ 审计范围：仓库全部文件 + 运行时行为

本文件既是**本次安全审计结论**，也是一份**可反复执行的检查清单**。
每次改动代码、重新打包、或准备把安装包发给别人之前，照单过一遍即可。

---

## 0. 一句话结论

**当前版本未发现高危漏洞。** 历次审计修复过 2 处渲染层注入问题（模型输出 → HTML），
其余敏感面（API Key 存储、分发、桥接服务）均已按最小暴露原则处理。
下面列出的 3 条“需要在意的点”属于**设计权衡**，不是缺陷，但你应该知道它们。

v2.6 本轮改动：修复划词浮窗不唤出侧栏的 bug；新增 Typora 内嵌内核自适应
（运行时探测 + 安装脚本探测，`config.json` 的 `kernel` 字段仅作兜底提示，不含任何敏感信息）；
桥接服务 `/client.js` 与 `/` 增加 Origin 白名单（该响应内嵌访问令牌，此前可被本机页面读取）；
SSE 客户端断开时销毁上游连接。未发现新的安全问题。

---

## 1. 本次审计结果速览

| 检查项 | 结论 |
| --- | --- |
| 仓库是否含真实 API Key | ✅ 无（`bridge/config.json` 已被 `.gitignore` 排除，未入库、远端无） |
| git 全历史是否泄露过密钥 | ✅ 无（两次提交的文件树均不含敏感文件） |
| 分发包是否含私钥 | ✅ 无（打包脚本内置 `sk-` 泄漏检查，检测到即中止） |
| 代码中是否硬编码密钥 | ✅ 无（仅存在于被忽略的本地配置） |
| API Key 是否发往非用户指定地址 | ✅ 否（仅随用户自配的 `baseUrl` 发出） |
| 桥接服务监听范围 | ✅ 仅 `127.0.0.1`（不对外网开放） |
| 桥接服务跨站防护 | ✅ 有 Origin 白名单（防 CSRF / DNS rebinding）+ token 鉴权 |
| 安装脚本是否联网下载执行 | ✅ 否（纯本地复制，无 `Invoke-WebRequest`/`curl`） |
| 安装是否覆盖用户配置 | ✅ 否（`config.json` 已存在则保留） |
| 是否存在 `exec`/`spawn`/后门 | ✅ 无 |
| 第三方依赖 | ✅ 无（仅用 Node 内置模块，无 `node_modules`） |
| 模型输出渲染的 XSS 防护 | ⚠️ 本次发现并**已修复**（见 §3） |
| 运行时清理（残留进程/临时文件） | ✅ 无（8765 无监听，临时文件已清） |

---

## 2. 本次修复的问题

| # | 位置 | 问题 | 修复 |
| --- | --- | --- | --- |
| 1 | `plugin/client.js` → `inline()` | Markdown 链接未做协议白名单，`[x](javascript:alert%28…%29)`、`[x](data:text/html,…)` 会生成可执行的 `href` | 新增 `safeHref()`，只放行 `http(s):`/`mailto:`/`tel:`/相对路径/锚点，其余一律降级为 `#`；并补 `rel="noopener"` |
| 2 | `plugin/client.js` → `mdToHtml()` | `<details>`/`<summary>` 标签被原样放回，属性未过滤（`<details open ontoggle="…">` 可自动触发脚本） | 仅保留开合标签本身，剥离全部属性 |
| 3 | `installer/install.ps1` | 版本号残留 `2.3`（非安全问题，一致性） | 更正为 `2.4` |

> 说明：`<script>`、`<img onerror>`、`<svg onload>` 等输入**本来就已被正确转义**（先 `esc()` 再渲染），
> 属于误报，不在修复范围内。

---

## 3. 需要在意的点（设计权衡，非缺陷）

### 3.1 API Key 以明文保存在本机
- **位置**：Typora 渲染进程的 `localStorage`（键名 `tyai.cfg.v3`），落在 Typora 的用户数据目录里。
- **影响**：本机上任何能读取该目录的程序都能拿到 Key。
- **建议**：不要在公共/共享电脑上使用；换 Key 时直接在插件面板里覆盖（不要用旧 Key 继续）；卸载后如需彻底清除，可在 Typora 里执行 `localStorage.clear()`（卸载脚本也会提示）。

### 3.2 桥接服务：注入脚本会 `eval` 桥接返回的代码
- **机制**：注入脚本启动时**优先探测**本地桥接（`127.0.0.1:8765`）；一旦探测成功，会把桥接返回的 JS 交给 `eval` 执行（热更新设计）。
- **风险**：若本机上存在恶意程序抢占了 8765 端口，理论上可向 Typora 注入代码。前提是**本机已被入侵**，属“已经被攻破后”的二次利用。
- **缓解**：`/client.js`、`/` 已加 Origin 白名单（只放行本机来源与无 Origin 的 Node 请求），`/ask`、`/chat`、`/agent` 另有 token 鉴权。
- **建议**：日常使用完全不需要桥接——插件默认靠渲染进程直连 AI，**保持 8765 无人监听即可消除此面**；桥接仅在需要热更新/调试时临时启动，用完 `stop-bridge.bat` 关掉。

### 3.3 注入 Typora 需要管理员权限
- 写 `Program Files` 下的 `window.html` 必然需要提权，这是正常行为。
- **建议**：只运行你自己下载/自己构建的安装包；拿到别人给的包时，先打开 `.ps1` 看一眼再做提权（脚本很短，一眼能读完）。

---

## 4. 安全自检清单（下次改动/发布前逐条勾）

### A. 凭据与密钥
- [ ] `bridge/config.json` 未被 `git add`（`git ls-files | grep config.json` 只应出现 `config.example.json`）
- [ ] 全仓库扫描无真实密钥：`grep -rniE "sk-[A-Za-z0-9]{20,}" .`（应无命中）
- [ ] `plugin/config.example.json` 的 `apiKey` 为空字符串
- [ ] 打包产物内无 `sk-` 开头串（`build-release.ps1` 会自动拦）
- [ ] 新增任何配置文件时，同步加入 `.gitignore`

### B. 分发与安装
- [ ] `dist/` 内只有 `installer/`、`plugin/`、`README.md`、`VERSION`、`LICENSE`
- [ ] `plugin/` 内只有 `inject.js`、`client.js`、`client.css`、`config.example.json`
- [ ] 安装脚本无任何联网下载行为
- [ ] 安装脚本不覆盖已存在的 `config.json`
- [ ] 卸载脚本优先用 `window.html.bak` 还原，且保留备份

### C. 网络与通信
- [ ] 桥接服务 `server.listen(...)` 第一参数是 `127.0.0.1`（不是 `0.0.0.0`）
- [ ] 桥接的写接口（`/ask` `/chat` `/agent`）都过了 `guard` / `sseGuard`
- [ ] `originAllowed()` 仍存在且只放行 `127.0.0.1` / `localhost`
- [ ] 内嵌令牌的响应（`/client.js`）与调试页（`/`）也过 `originAllowed()`
- [ ] SSE 在客户端断开时会销毁上游连接（`abortUpstream` 注册了 `close` 监听）
- [ ] AI 请求的 `Authorization: Bearer <key>` 只发往用户配置的 `baseUrl`
- [ ] 界面里的服务商预设 Base URL 均为 `https://`（非 http）

### D. 前端渲染（模型输出不可信）
- [ ] `mdToHtml()` 仍是“**先 `esc()` 再渲染**”的顺序
- [ ] 链接经 `safeHref()` 协议白名单（禁 `javascript:` / `data:` / `vbscript:`）
- [ ] 代码块内容经过 `esc()`
- [ ] 任何新增的 `innerHTML` 拼接，动态部分都过了 `esc()`
- [ ] 运行 `node scripts/xss-probe.js` → 输出 `风险用例数: 0`

### E. 代码执行与文件访问
- [ ] 无 `child_process` / `exec` / `spawn` / `Function(` 动态构造（`eval` 仅存在于注入器加载插件自身代码处）
- [ ] 文件读取路径由固定常量拼接，不含用户输入（无路径穿越）
- [ ] 新增 Node 能力调用前，确认确有必要

### F. 隐私与本地数据
- [ ] 会话/配置只存 `localStorage`，不外传
- [ ] 提交里不含个人绝对路径（`C:\Users\<名>`）、用户名、邮箱
- [ ] 截图 / 文档不含真实 Key 或隐私内容
- [ ] `.workbuddy/`（本地记忆）、`scripts/`、`dist/` 均在忽略清单内

### G. 依赖与供应链
- [ ] 未引入第三方 npm 包（如引入，需写明来源与版本并锁定）
- [ ] 分发包来源可追溯（自行构建或官方 Release）

### H. 发布前
- [ ] 三个 JS + 相关脚本通过语法检查
- [ ] `node scripts/compat-check.js` 通过（无致命项；增强层只含“不支持就被忽略”的属性）
- [ ] `node scripts/xss-probe.js` → 输出 `风险用例数: 0`
- [ ] 现代内核 / 模拟旧内核两套 CSS 各截一遍图，逐状态比对无布局差异
- [ ] `git status` 确认没有多出来的敏感文件
- [ ] 重新打包 `dist/`，并核对解压后的文件清单
- [ ] 版本号在 `VERSION`、脚本、注入标记三处一致

---

## 5. 一键自检（可选）

仓库内附了一个 PowerShell 自检脚本，双击或右键“使用 PowerShell 运行”即可：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\security-audit.ps1
```

它会自动跑完上面 A–D、F 的大部分条目并打印 `[OK]/[!!]`。
渲染层的专项回归测试：

```bash
node scripts/xss-probe.js
```

---

## 6. 报告安全问题

发现漏洞请勿公开提交 Issue，优先通过私下渠道反馈（仓库主页的联系方式）。
描述请包含：版本号、复现步骤、影响面。

---

*本清单随项目演进维护；每次涉及安全面的改动都应回来更新对应小节。*
