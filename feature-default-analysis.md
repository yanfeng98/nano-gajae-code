# Gajae-Code 功能默认状态完整分析

> 分析日期: 2026-06-21 | 分支: 260613-v0.5.0-dev | 代码基线: 0.5.0
>
> **已执行移除（27 轮）**:
> - 第一轮: macOS 电源管理 (~350 行)
> - 第二轮: 全平台死代码清理 (~1,120 行)
> - 第三轮: Hindsight 远程记忆系统 (~2,600 行)
> - 第四轮: ACP IDE 集成协议 (~3,300 行 + 13 测试文件)
> - 第五轮: OpenTelemetry 可观测性系统 (~2,660 行 + 4 测试文件 + 3 个 npm 包)
> - 第六轮: DAP 调试器配置精简 (14 个调试器 → 1 个，~190 行 JSON + 文档)
> - 第七轮: Autoresearch 死代码模块 (~4,039 行 TS + 1,547 行测试)
> - 第八轮: orchestration-token-benchmark 基准测试包 (~2,313 行 TS)
> - 第九轮: typescript-edit-benchmark 基准测试包 (~6,932 行 TS)
> - 第十轮: 清理由前九轮移除产生的残留（~4,300 行：6 个 hindsight 测试 + bench + 3 个 prompt + 配置/注释/文档）
> - 第十一轮: 过时 provider 测试文件清理（5 个文件删除 + 30 个测试文件清洗）
> - 第十二轮: Provider 残留深度清理（ai/stats/agent 包：~200 行源码 + 14 个测试文件）
> - 第十三轮: RPC 模式移除（~2,100 行源码 + 18 个测试文件）
> - 第十四轮: bridge-client 包移除（~1,150 行，独立 npm 包，零 import）
> - 第十五轮: Python 目录移除（~30,000 行：gjc-rpc + robogjc，RPC 已删导致的死代码）
> - 第十六轮: Harness Control Plane 移除（~12,200 行：RPC 已删导致的死代码）
> - 第十七轮: exa/ MCP 工具集移除（~1,200 行：零消费者死代码）
> - 第十八轮: MCP 交互式管理界面移除（~4,000 行：被隔离的 TUI 死代码链）
> - 第十九轮: Slash Command Helper 死代码清理（~800 行：未接入的 ACP 命令处理）
> - 第二十轮: MCP Protocol 死代码清理（~500 行：未注册的 URL 协议处理器 + 残留 package.json 条目）
> - 第二十一轮: Codex Discovery 死代码清理（~330 行：未激活的 provider + 12 个 package.json 死条目）
> - 第二十二轮: 死设置与死类型清理（~97 行：9 个死设置键 + 3 个死接口 + SOURCE_PATHS 条目）
> - 第二十三轮: 未注册 CLI 命令链清理（~4,157 行：12 个死命令 + 11 个 helper + 2 个测试文件）
> - 第二十四轮: 死模块与死依赖链清理（~3,594 行：14 个死源文件 + 3 个死测试 + 1 个测试编辑 + 1 个 barrel 修复）
> - 第二十五轮: 死 commit/ 子系统完整移除（~3,740 行：44 个死源文件 + 2 个死测试，commit/ 从 ~50 文件缩减到 3 文件）
> - 第二十六轮: 4 个死配置 Provider 移除（~540 行：venice/xiaomi/zenmux/lm-studio，10 文件）
> - 第二十七轮: LiteLLM Provider 完整移除（~16,338 行：810 个垃圾模型 + OAuth + descriptor，models.json 21,430→5,197 行）
> - 总计减少 ~113,400+ 行，仅 Linux/WSL2 + 本地记忆 + 交互模式 + Python 调试运行。
>
> **生态激活**:
> - Claude Code 配置发现：激活 `discovery/claude.ts` + `discovery/claude-plugins.ts`，支持从 `~/.claude/` 和项目 `.claude/` 导入技能/命令/钩子/工具/MCP/设置
> - 用户级扫描：`claude.ts` 新增 `~/.claude/` 用户 home 目录扫描（原仅项目级）
> - 技能过滤器修复：`extensibility/skills.ts` 的 `isSourceEnabled()` 从硬杀非 native provider 改为按 provider 分别判断（native/claude/claude-plugins 三分支，均支持 user/project 级别）
> - 默认值修正：`enableClaudeUser`/`enableClaudeProject` 函数默认值 `false`（保守策略，需用户显式开启）
> - 测试同步：2 个 skills.test.ts + default-gjc-definitions 测试已更新以反映新行为
> - 配置方式：`gjc config set skills.enabled true` + `skills.enableClaudeUser true`

本文档对 Gajae-Code 项目中所有功能的默认启用/关闭状态、代码体量、可选性和移除影响进行全面分析，为魔改裁剪提供决策依据。

---

## 概览

| 维度 | 数据 |
|------|------|
| TypeScript 源文件数 | ~834 个 (仅 coding-agent) |
| TypeScript 总行数 | ~252,800 行 |
| Rust crate 数 | 5 个 (含 2 个 vendored) |
| `models.json` 大小 | 454 KB, ~21,666 行, 1030 个模型 |
| AI Provider 数 | 14 个 (含 models.json 定义的) |
| 已知 Provider 类型 | 19 个 |
| 内置 Tool 数 | 31 个 (BUILTIN_TOOLS) + 3 个 (HIDDEN_TOOLS) |
| Settings 配置项 | ~95 个 (已移除 4 power + 32 hindsight + 9 dead keys) |
| 已移除代码行数 | ~113,400+ 行 (二十七轮) |
| 运行模式 | 3 种 (interactive, print, bridge) |
| CLI 子命令 | 14 个 |

---

## 一、Settings 中默认关闭的功能

以下是 `packages/coding-agent/src/config/settings-schema.ts` 中所有 `default: false` 或 `default: "off"` 的配置项，按功能分类。

### 1.1 语音输入 (`stt.*`)

| 配置项 | 默认值 | 代码位置 | 行数 |
|--------|--------|---------|------|
| `stt.enabled` | `false` | `packages/coding-agent/src/stt/` | ~6 文件 + Python 脚本 |
| `stt.language` | `"en"` | 同上 | |
| `stt.modelName` | `"base.en"` | Whisper 模型选择 | |

**依赖**: whisper.cpp 本地模型下载（首次使用时）、Python `transcribe.py`
**移除影响**: 无，默认关闭。删除 `stt/` 目录即可。

### 1.2 记忆系统 (`memory.*` / `memories.*`)

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `memory.backend` | `"off"` | 记忆后端选择器：off/local |
| `memories.enabled` | `false` | 旧版本地记忆流水线（已隐藏，仅用于迁移兼容） |

> **Hindsight 远程记忆已于第三轮移除。**

`memory.backend` 是整个记忆系统的总开关，默认 `"off"` 意味着：
- **本地记忆流水线** (`memory.backend: "local"`) — 不启动

相关代码目录（均保留）：
| 目录 | 功能 | 行数（估算） |
|------|------|-------------|
| `packages/coding-agent/src/memories/` | 本地记忆流水线 (Phase 1+2) | ~1,700 行 |
| `packages/coding-agent/src/memory-backend/` | 记忆后端抽象 (off/local) | ~200 行 |

### 1.3 可选工具（默认关闭）

| 配置项 | 默认值 | 代码位置 | 主要依赖 |
|--------|--------|---------|---------|
| `renderMermaid.enabled` | `false` | `tools/render-mermaid.ts` | `@gajae-code/utils` (轻量) |
| `calc.enabled` | `false` | `tools/calculator.ts` | 纯 JS 表达式求值 |
| `inspect_image.enabled` | `false` | `tools/inspect-image.ts` | `@gajae-code/ai` (调 vision 模型) |
| `checkpoint.enabled` | `false` | `tools/checkpoint.ts` | 纯状态管理 |
| `github.enabled` | `false` | `tools/gh.ts` + `github-cache.ts` | 系统 `gh` CLI, `bun:sqlite` |
| `async.enabled` | `false` | `tools/job.ts`, `tools/monitor.ts`, `tools/cron.ts`, `tools/subagent.ts` | `AsyncJobManager` |
| `bash.autoBackground.enabled` | `false` | bash 自动后台化 | `AsyncJobManager` |
| `bashInterceptor.enabled` | `false` | bash 命令拦截 | 无额外依赖 |

**移除影响**: 这些都是通过 settings gated 的 tool，默认不会出现在 agent 的工具列表中。删除对应的 tool 文件和 settings 定义即可。

### 1.4 上下文管理（默认关闭）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `contextPromotion.enabled` | `false` | 上下文溢出时自动切换更大窗口的模型 |
| `compaction.idleEnabled` | `false` | 空闲时自动压缩上下文 |
| `branchSummary.enabled` | `false` | 切换分支时自动生成摘要 |

这些是上下文管理的高级功能，默认关闭以节省 token。移除不影响核心对话循环。

### 1.5 任务/计划相关（默认关闭）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `task.eager` | `false` | 自动倾向委托子 agent |
| `task.enableLsp` | `false` | 子 agent 中启用 LSP |
| `task.forkContext.enabled` | `false` | 子 agent fork 父上下文 |
| `tools.todo.eager` | `false` | 自动创建 todo 列表 |

这些是 agent 自动行为的偏好设置，关闭时 agent 行为更保守。

### 1.6 安全/认证（默认关闭）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `secrets.enabled` | `false` | 发送给 AI 前混淆密钥 |
| `mcp.enableProjectConfig` | `false` | MCP 项目级配置 |
| `mcp.discoveryMode` | `false` | MCP 自动发现 |
| `mcp.notifications` | `false` | MCP 工具变更通知 |

### 1.7 命令/技能发现（默认关闭）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `skills.enabled` | `false` | **整个技能发现系统**的总开关 |
| `skills.enableCodexUser` | `false` | 发现 Codex 用户级技能 |
| `skills.enableClaudeUser` | `false` | 发现 Claude 用户级技能 ✅ 已接线（`isSourceEnabled()` 读取） |
| `skills.enableClaudeProject` | `false` | 发现 Claude 项目级技能 ✅ 已接线（`isSourceEnabled()` 读取） |
| `skills.enablePiUser` | `false` | 发现 GJC 用户级技能 |
| `skills.enablePiProject` | `false` | 发现 GJC 项目级技能 |
| `commands.enableClaudeUser` | `false` | Claude 用户级自定义命令 |
| `commands.enableClaudeProject` | `false` | Claude 项目级自定义命令 |
| `commands.enableOpencodeUser` | `false` | OpenCode 用户级自定义命令 |
| `commands.enableOpencodeProject` | `false` | OpenCode 项目级自定义命令 |

**关键结论**: `skills.enabled: false` 意味着开箱即用时，外部技能发现完全不会运行。只有内置的 4 个默认工作流技能（`deep-interview`, `ralplan`, `ultragoal`, `team`）通过 `install:defaults` 安装后可用。

### 1.10 其他默认关闭项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `autoResume` | `false` | 自动恢复上次会话 |
| `startup.quiet` | `false` | 静默启动 |
| `collapseChangelog` | `false` | 折叠 changelog |
| `colorBlindMode` | `false` | 色盲模式 |
| `read.toolResultPreview` | `false` | Read 工具内联预览 |
| `lsp.formatOnWrite` | `false` | 写入后自动格式化 |
| `lsp.diagnosticsOnEdit` | `false` | 编辑后运行诊断 |
| `display.showTokenUsage` | `false` | 显示 Token 用量 |
| `clearOnShrink` | `false` | 缩小时清除空行 |
| `read.summarize.prose` | `false` | Markdown/纯文本摘要 |
| `edit.streamingAbort` | `false` | 补丁预览失败时中止 |
| `edit.hashlineAutoDropPureInsertDuplicates` | `false` | Hashline 去重 |
| `readLineNumbers` | `false` | Read 工具默认显示行号 |
| `task.eager` | `false` | 倾向任务委托 |
| `compaction.handoffSaveToDisk` | `false` | Handoff 文档存盘 |
| `statusLine.showHookStatus` | `false` | 状态栏显示 hook 状态 |
| `statusLine.sessionAccent` | `true` | (这个是 true，仅对比) |

### 1.17 ~~Provider 残留深度清理~~（✅ 第十一、十二轮）

> **状态**: 已完成。第十一轮清理 coding-agent 中残留的过时 provider 测试文件和引用（删除 5 个测试/fixture 文件、清理 30 个测试文件中的 `openai-codex`/`google-antigravity`/`xai` 引用）。第十二轮深度清理 `packages/ai/`、`packages/stats/`、`packages/agent/` 中的过时 provider 源码引用（删除 `auth-storage.ts` 中 3 个 stub 函数及 6 个调用点、清理 `auth-gateway/server.ts` 死代码分支、删除 `cli.ts` help text、删除 `package.json` 死 exports）。共清理 14 个测试文件，消除 ~38 个类型错误。

验证: 四个包 (`ai`, `agent`, `stats`, `coding-agent`) 均零新增错误 ✅ | 全代码库零过时 provider 引用 ✅

### 1.18 ~~RPC 模式~~（✅ 第十三轮 — JSON stdin/stdout 协议）

> **状态**: 已删除。RPC 模式 (`--mode rpc` / `--mode rpc-ui`) 是 JSON stdin/stdout 协议，供外部程序（IDE/CI/服务端）远程驱动 agent。交互模式完全不依赖此能力。`rpc-types.ts`（协议类型定义，603 行）迁至 `modes/shared/agent-wire/`，因为 bridge 模式共享同一套 agent-wire 协议类型。

删除清单：
| 文件 | 操作 |
|------|------|
| `modes/rpc/rpc-mode.ts` (583 行) | 删除 — `runRpcMode()` 入口 |
| `modes/rpc/rpc-types.ts` (603 行) | 迁至 `modes/shared/agent-wire/rpc-types.ts` |
| `modes/rpc/rpc-client.ts` (915 行) | 删除 — 编程式 RPC 客户端 |
| `modes/rpc/host-tools.ts` + `host-uris.ts` | 删除 — re-exports |
| 18 个 RPC 测试文件 + `test/rpc/` 目录 | 删除 |
| `modes/index.ts` | 移除 19 行 RPC 导出 |
| `main.ts` | 删除 RPC dispatch 分支；`RPC_DEFAULTED_*` → `BRIDGE_DEFAULTED_*`；简化 mode 条件 |
| `cli/args.ts` | `Mode` 类型去掉 `"rpc" \| "rpc-ui"` |
| `cli.ts` + `commands/launch.ts` | `--mode` options 去掉 rpc/rpc-ui |

保留（bridge 仍需要）：
- `agent-session.ts` 中 `#rpcHostToolNames` / `refreshRpcHostTools()` — 被 bridge 经由 command-dispatch 使用
- `modes/shared/agent-wire/` 全部文件 — bridge 共享

验证: `tsgo --noEmit -p packages/coding-agent` 仅 2 个 pre-existing 错误，零新增 ✅

### 1.19 ~~bridge-client 包~~（✅ 第十四轮 — 独立 npm SDK）

> **状态**: 已删除。`@gajae-code/bridge-client` 是独立的 TypeScript SDK 包，供外部程序通过 HTTP 远程控制 gjc bridge 模式。gj c 源码全代码库零 import，纯死代码。

删除清单：
| 文件 | 操作 |
|------|------|
| `packages/bridge-client/` (8 文件: 4 src + 4 test) | 删除 |
| `test/bridge/bridge-conformance.test.ts` | 删除（唯一引用已删除包） |
| `docs/rpc.md` | 删除（RPC 已移除，文档过时） |
| `docs/bridge.md` | 移除 SDK Usage 节和 bridge-client 引用 |
| 根 `package.json` | 移除 catalog 条目 |
| `scripts/ci-release-publish.ts` | 移除发布配置 |
| `bun.lock` | `bun install` 自动更新 |
| `docs-index.generated.ts` | 自动重新生成 |

验证: 全代码库零 `bridge-client` 引用 ✅ | 4 个包均零新增错误 ✅

### 1.20 ~~Python 目录~~（✅ 第十五轮 — gjc-rpc + robogjc）

> **状态**: 已删除。第十三轮 RPC 移除后，`python/` 目录变成纯死代码：`gjc-rpc` (Python RPC 客户端库) spawn `gjc --mode rpc`，`robogjc` (GitHub 自动修 bug 机器人) 同样依赖 RPC 模式。

删除清单：
| 文件 | 操作 |
|------|------|
| `python/` 目录 (~30,000 行) | 删除 — gjc-rpc + robogjc + web UI + 测试 |
| 根 `package.json` | 移除 `python/robogjc/web` workspace + 18 个 robogjc/lint/test:py 脚本 |
| `scripts/ci-dev-affected.ts` | 移除 python/web 路径检测和 CI 任务 |
| `scripts/check-node20-baseline.test.ts` | 替换测试 fixture (robogjc → generic) |
| `docs/onboarding-packet.md` | 移除 3 处 python/ 引用 |
| `docs/codebase-overview.md` | 移除 "Python packages" 整节 |
| `docs/natives-build-release-debugging.md` | 移除 robogjc 缓存章节 |
| `bun.lock` + docs-index | 自动更新 |

验证: 全代码库零 `python/gjc-rpc` / `python/robogjc` 引用 ✅ | 4 包零新增错误 ✅

### 1.21 ~~Harness Control Plane~~（✅ 第十六轮 — 批量 AI 任务编排系统）

> **状态**: 已删除。Harness Control Plane (`gjc harness <verb>`) 是批量 AI 任务编排系统，用于 CI/自动化流水线。其核心机制 spawn `gjc --mode rpc` 子进程并通过 JSONL 协议控制 gjc。第十三轮 RPC 移除后，所有 harness 动词 (start/submit/observe/recover/finalize/retire/operate) 均无法工作。

删除清单：
| 文件 | 操作 |
|------|------|
| `src/harness-control-plane/` (16 文件, ~5,176 行) | 删除 — types, state-machine, storage, receipts, rpc-adapter, owner, session-lease, operate, finalize, classifier, control-endpoint, phase-rollup, preserve, receipt-ingest, receipt-spool, seams |
| `src/commands/harness.ts` (~1,203 行) | 删除 — CLI 命令入口 |
| `test/harness-control-plane/` (27 测试文件 + 1 fixture + 1 utility, ~6,398 行) | 删除 |
| `test/agent-wire/command-contract.redteam.test.ts` (~105 行) | 删除 — 扫描已删除目录 |
| `bench/context-optimization.bench.ts` (~585 行) | 删除 — 引用 harness 收据类型 |
| `test/bench/context-optimization-effectiveness.test.ts` (~45 行) | 删除 — 引用上述 bench |
| `src/cli.ts` | 移除 harness 命令注册 |
| `test/cli-command-surface.test.ts` | 移除 `"harness"` 预期值 |
| `package.json` | 移除 `bench:context` 脚本 |
| `docs-index.generated.ts` | 自动重新生成 |

保留（非 harness 专用）：
- `src/gjc-runtime/tmux-common.ts` — 也被 team-runtime.ts / tmux-sessions.ts / launch-tmux.ts 使用，保留
- `tui/test/replay-harness.ts` — TUI 测试工具，"harness" 意为 "测试夹具"，与 Harness Control Plane 无关

验证: 全代码库零 `harness-control-plane` 引用 ✅ | 构建零新增错误 ✅ | 四个核心能力完好 ✅

### 1.22 ~~exa/ MCP 工具集~~（✅ 第十七轮 — 零消费者死代码）

> **状态**: 已删除。`src/exa/` 包含 22 个硬编码 Exa MCP 工具（搜索、深度研究、数据集），通过 `https://mcp.exa.ai/mcp` API 调用。工具已完整实现但从未接入工具系统：导出的 `exaTools` 数组零 import，不在 `package.json` exports 中，不在 `tool-discovery` 注册表中。

删除清单：
| 文件 | 操作 |
|------|------|
| `src/exa/` (8 文件, ~1,192 行) | 删除 — index.ts, factory.ts, mcp-client.ts, render.ts, researcher.ts, search.ts, types.ts, websets.ts |

保留（同名不同物）：
- `web/search/providers/exa.ts` — 活的 Exa web search provider，被 `web/search/provider.ts` 动态加载，继续使用

验证: 全代码库零 `src/exa/` 引用 ✅ | 构建零新增错误 ✅ | web 搜索功能完好 ✅

### 1.23 ~~MCP 交互式管理界面~~（✅ 第十八轮 — 被隔离的 TUI 死代码链）

> **状态**: 已删除。一套完整的 MCP 服务器管理 TUI 界面（`/mcp add/search/login/list/remove` 等 15 种子命令），从 OMP 基线迁移时带入但从未启用。`package.json` 明确将入口文件设为 `null`，隔离测试禁止导入，交互模式仅显示 "MCP commands are not available" 占位符。

删除清单：
| 文件 | 操作 |
|------|------|
| `src/modes/controllers/runtime-mcp-command-controller.ts` (~1,934 行) | 删除 — `/mcp` 命令 TUI 控制器 |
| `src/modes/components/runtime-mcp-add-wizard.ts` (~1,341 行) | 删除 — 多步骤添加向导 |
| `src/runtime-mcp/oauth-discovery.ts` (~349 行) | 删除 — OAuth 端点自动发现 |
| `src/runtime-mcp/smithery-connect.ts` (~145 行) | 删除 — Smithery 云平台连接管理 |
| `src/runtime-mcp/json-rpc.ts` (~84 行) | 删除 — 一次性 JSON-RPC 调用（唯一消费者 exa/ 已删） |
| `src/runtime-mcp/loader.ts` (~124 行) | 删除 — MCP 工具加载器（被隔离测试禁止） |
| `test/issue-956-repro.test.ts` | 删除 |
| `test/oauth-discovery.test.ts` | 删除 |
| `src/runtime-mcp/index.ts` | 移除 3 行死 re-export |
| `package.json` | 移除 2 行 null 导出 |

保留（manager.ts 依赖）：
- `src/runtime-mcp/oauth-flow.ts` — MCP OAuth token 刷新，`manager.ts` 在用，保留

验证: 隔离测试 3/3 通过 ✅ | 构建零错误 ✅ | 活 runtime-mcp 文件完好 ✅

### 1.24 ~~Slash Command Helper 死代码~~（✅ 第十九轮 — 未接入的 ACP 命令处理）

> **状态**: 已删除。两个 ACP 模式斜杠命令 helper 从 OMP 迁移后从未接入 `builtin-registry.ts`，全代码库零消费者。AI 的 `todo_write` 工具（`tools/todo-write.ts`）独立运作，不受影响。

删除清单：
| 文件 | 操作 |
|------|------|
| `src/slash-commands/helpers/mcp.ts` (~532 行) | 删除 — ACP `/mcp` 命令处理 |
| `src/slash-commands/helpers/todo.ts` (~279 行) | 删除 — ACP `/todo` 命令处理 |
| `package.json` | 移除 `./slash-commands/helpers/mcp: null` 条目 |

保留（活着的 5 个 helper）：
- `context-report.ts`, `format.ts`, `parse.ts`, `ssh.ts`, `usage-report.ts` — 均被 `builtin-registry.ts` 导入

验证: 全代码库零引用 ✅ | 构建零错误 ✅ | AI todo_write 工具正常 ✅

### 1.25 ~~MCP Protocol 死代码清理~~（✅ 第二十轮 — 未注册的 URL 协议处理器）

> **状态**: 已删除。`src/internal-urls/mcp-protocol.ts` 实现了 `mcp://` URL 协议处理器（`McpProtocolHandler`），可从 MCP 服务器读取资源。但从未在 `internal-urls/index.ts` barrel 中注册，隔离测试明确禁止。同时清理了 12 个指向已删除文件的 `package.json` null 条目。

删除清单：
| 文件 | 操作 |
|------|------|
| `src/internal-urls/mcp-protocol.ts` (~151 行) | 删除 — 未注册的 mcp:// 协议处理器 |
| `test/internal-urls/mcp-protocol.test.ts` (~345 行) | 删除 — 只测试上述死文件 |
| `package.json` | 移除 13 行死 null 条目 |

保留（MCP 核心引擎）：
- `runtime-mcp/manager.ts` + 其他 15 个 runtime-mcp 文件 — 被 `sdk.ts`, `agent-session.ts` 使用，支持 `.mcp.json` 配置和 MCP 工具发现

验证: 构建零错误 ✅ | MCP 核心功能完好 ✅

### 1.26 生态激活：Claude Code 配置发现

> **状态**: 已激活。原本 `discovery/claude.ts` 和 `discovery/claude-plugins.ts` 是 OMP 迁移带入但从未注册的死 provider。现已在 `discovery/index.ts` 中注册，并修复了两道闸门使其真正可用。

#### 1.26.1 激活的 Provider

| Provider | 扫描目录 | 导入内容 |
|----------|---------|---------|
| `claude` (priority 80) | 项目 `.claude/` + `~/.claude/` | 技能、命令、钩子、工具、MCP 服务器、CLAUDE.md、SYSTEM.md、settings.json、扩展 |
| `claude-plugins` (priority 70) | 项目 `.claude/plugins/` + 用户级 | GJC 市场插件（技能/命令/钩子/工具） |

#### 1.26.2 修复的代码

| 文件 | 修改 |
|------|------|
| `discovery/index.ts` | 新增 `import "./claude"` + `import "./claude-plugins"` |
| `discovery/claude.ts` | 重写：新增 `getUserClaude()` 和所有 `load*` 函数的用户级扫描（原仅项目级） |
| `extensibility/skills.ts` | `isSourceEnabled()` 从硬杀非 native → 按 provider 判断；`enableClaude*` 默认值改为 `false` |
| `test/skills.test.ts` | 2 个测试更新："should ignore Codex skills but load Claude skills" + "registers the Claude skill provider by default" |

#### 1.26.3 使用方式

```sh
gjc config set skills.enabled true              # 技能发现总开关
gjc config set skills.enableClaudeUser true     # 允许 ~/.claude/skills/
gjc config set skills.enableClaudeProject true  # 允许 项目/.claude/skills/
gjc config get skills.enabled                   # 验证
```

> 注：`skills.enableClaudeUser` 和 `skills.enableClaudeProject` 原本是死旋钮（存在但从未被读取），本次修复后 `isSourceEnabled()` 真正读取它们。函数级默认值为 `false`（保守），需用户通过 `gjc config set` 显式开启。

### 1.27 ~~Codex Discovery Provider~~（✅ 第二十一轮 — 未激活的 provider）

> **状态**: 已删除。`discovery/codex.ts` 实现了 OpenAI Codex 配置发现（扫描 `.codex/` 目录），但从未在 `discovery/index.ts` 中注册，与其他 14 个 provider 不同（其中 claude 和 claude-plugins 已在本轮激活）。同时清理了 `package.json` 中 12 个指向已删除文件的 null 导出条目。

删除清单：
| 文件 | 操作 |
|------|------|
| `src/discovery/codex.ts` (~330 行) | 删除 — 零消费者，OMP 迁移带入但从未接线 |
| `package.json` | 移除 12 行死 null 条目（`./mcp`, `./autoresearch`, `./commands/ralph` 等） |

保留（已激活的 provider）：
- `discovery/claude.ts` — 1.26 已激活，扫描 `.claude/` + `~/.claude/`
- `discovery/claude-plugins.ts` — 1.26 已激活，GJC 市场插件
- `discovery/index.ts` 中其他 12 个 provider — 均为存活状态

验证: 构建零错误 ✅ | 全代码库零 `discovery/codex` 引用 ✅

### 1.28 ~~死设置与死类型~~（✅ 第二十二轮 — 零消费者的 schema 残留）

> **状态**: 已删除。9 个设置键在 `SETTINGS_SCHEMA` 中定义但全代码库零 `settings.get()` 调用，均为 OMP 迁移或已删功能残留。

删除清单：

**死设置键（`settings-schema.ts`，~56 行）：**

| 设置键 | 说明 |
|--------|------|
| `tasks.todoClearDelay` | agent-session.ts 明确注释为 inert，带完整 TUI 面板（7 个选项） |
| `extensions`（裸键） | 所有 `"extensions"` 引用均为目录路径，非设置读取 |
| `marketplace.autoUpdate` | 无 UI，零消费者 |
| `mcp.enableProjectConfig` | 零消费者（runtime-mcp 有同名局部属性，但通过函数参数传入） |
| `mcp.discoveryDefaultServers` | 零消费者 |
| `commands.enableClaudeUser` | 零消费者（对比：`commands.enableOpencodeUser` 由 opencode.ts 读取） |
| `commands.enableClaudeProject` | 同上 |
| `exa.enableResearcher` | exa/ 模块已在 R17 删除，该键成残留 |
| `exa.enableWebsets` | 同上 |

**死接口 + GroupTypeMap 条目（~33 行）：**

| 接口 | 说明 |
|------|------|
| `MemoriesSettings` + `memories: MemoriesSettings` | `getGroup("memories")` 零调用，所有 `memories.*` 键通过 `settings.get()` 直接读取 |
| `ExaSettings` + `exa: ExaSettings` | `getGroup("exa")` 零调用，含 2 个死字段 `enableResearcher`/`enableWebsets` |
| `SttSettings` + `stt: SttSettings` | `getGroup("stt")` 零调用，含 2 个死字段 `whisperPath`/`modelPath`（schema 中无对应键） |

**死 SOURCE_PATHS 条目（`helpers.ts`，~5 行）：**

| 条目 | 说明 |
|------|------|
| `SOURCE_PATHS.codex` | `discovery/codex.ts` 已在 R21 删除，无 provider 以 `"codex"` 调用 `getUserPath`/`getProjectPath` |

保留（活跃对照）：
- `exa.enabled` / `exa.enableSearch` — `web/search/providers/exa.ts:177` 直接读取，保留
- `stt.enabled` / `stt.language` / `stt.modelName` — `stt-controller.ts` 直接读取，保留
- `memories.*` 全部 — `memories/index.ts` 直接读取，保留
- `commands.enableOpencodeUser` / `commands.enableOpencodeProject` — `discovery/opencode.ts` 读取，保留

验证: 构建零错误 ✅ | 4803 测试通过 ✅ | `settings.get()` 全代码库无对已删键的引用 ✅

### 1.29 ~~未注册 CLI 命令链~~（✅ 第二十三轮 — cli.ts 未注册的死命令）

> **状态**: 已删除。12 个命令文件存在于 `commands/` 但从未在 `cli.ts` 注册，不可达。git log 追溯到 `a14c0cfb`（"Narrow GJC to the retained workflow utility surface"）——原始作者刻意将 gjc 命令表从 24 个收窄到 7 个核心工作流命令，但未同步删除源文件。

删除清单：

**死命令文件（`commands/`，12 文件，639 行）：**

| 文件 | 功能 | 删除原因 |
|------|------|---------|
| `auth-broker.ts` | OAuth 凭证保险库（serve/login/logout/import/migrate） | 单人 WSL2 开发，环境变量即可 |
| `auth-gateway.ts` | 凭证前置代理（依赖 broker） | 同上 |
| `agents.ts` | 导出内置 agent 定义到 `.gjc/agents/` | 直接改 `prompts/agents/` 源码更方便 |
| `commit.ts` | AI 生成 commit message + changelog | 与 `contribute-pr` 功能重叠 |
| `grep.ts` | 测试 ripgrep 工具参数 | 调试工具，直接 `rg` 更快 |
| `plugin.ts` | 插件市场（install/uninstall/discover/upgrade） | fork 已大量裁剪，插件生态无意义 |
| `read.ts` | 预览 read 工具输出 | 调试工具 |
| `shell.ts` | 交互式 shell 控制台 | tmux + bash 已覆盖 |
| `ssh.ts` | SSH 主机配置管理 | `~/.ssh/config` 直接管理 |
| `stats.ts` | 使用量统计 Web 仪表盘 | TUI 内已有实时统计 |
| `web-search.ts` | 测试搜索提供商 | 搜索在 TUI 内正常工作 |
| `worktree.ts` | 管理 `~/.gjc/wt/` 自动 worktree | 用户手动指定 worktree 路径 |

**死 CLI 辅助文件（`cli/`，11 文件，3,467 行）：**
`agents-cli.ts`(141), `auth-broker-cli.ts`(739), `auth-gateway-cli.ts`(411), `grep-cli.ts`(160), `plugin-cli.ts`(942), `read-cli.ts`(57), `shell-cli.ts`(176), `ssh-cli.ts`(179), `stats-cli.ts`(238), `web-search-cli.ts`(133), `worktree-cli.ts`(291)

**死测试文件（2 文件，51 行）：**
`commit-command-exit.test.ts`(35), `plugin-command.test.ts`(16)

保留（共享模块）：
- `session/auth-broker-config.ts` — `sdk.ts:82` 导入，保留
- `commit/` 模块 — `runCommitCommand` 仅被死 `commands/commit.ts` 导入，但模块本身保留

验证: 构建零错误 ✅ | 4795 测试通过 ✅ | cli.ts 注册表 15 命令完好 | 核心命令 deep-interview/ralplan/ultragoal/team 全部注册

---

### 1.30 ~~死模块与死依赖链~~（✅ 第二十四轮 — 零消费者死模块 + 级联清理）

> **状态**: 已删除。14 个源文件 + 3 个测试文件 + 1 个测试编辑 + 1 个 barrel 修复 = 19 文件，3,594 行。每个文件用 `grep -rn` 在 `src/` 下验证零生产代码引用。

**死源文件（14 文件，2,916 行）：**

| 文件 | 行数 | 说明 | 死亡证据 |
|------|------|------|---------|
| `task/name-generator.ts` | 1,577 | 任务名生成器（1202 形容词 + 355 动物名词表） | `generateTaskName` / `resetTaskNames` — `src/` 下零引用 |
| `runtime-mcp/smithery-registry.ts` | 477 | Smithery.dev 注册表搜索 API 客户端 | `searchSmitheryRegistry` / `SmitheryRegistryError` — 零引用 |
| `runtime-mcp/smithery-auth.ts` | 104 | Smithery.dev CLI 登录/轮询/API Key 管理 | `getSmitheryApiKey` / `createSmitheryCliAuthSession` — 零引用 |
| `commit/pipeline.ts` | 244 | Commit 命令主流水线 | `runCommitCommand` 入口函数 — 零引用，整个 commit 命令行无人调用 |
| `commit/map-reduce/map-phase.ts` | 193 | Map-Reduce 分析 Map 阶段 | 仅被已删除的 `map-reduce/index.ts` 导入 |
| `commit/map-reduce/index.ts` | 69 | Map-Reduce 分析入口 | 仅被已删除的 `pipeline.ts` 导入 |
| `commit/map-reduce/reduce-phase.ts` | 49 | Map-Reduce Reduce 阶段 + 引用已删除 `shared-llm` | 仅被已删除的 `map-reduce/index.ts` 导入 |
| `commit/analysis/conventional.ts` | 64 | 常规提交 LLM 分析 + 引用已删除 `shared-llm` | `src/` 下零引用 |
| `commit/shared-llm.ts` | 77 | 共享 Zod schema + 分析工具函数 | 仅被已删除的 `conventional.ts` / `reduce-phase.ts` 导入 |
| `commit/cli.ts` | 85 | `parseCommitArgs` / `printCommitHelp` | 零引用，CLI 从未注册 commit 子命令 |
| `commit/index.ts` | 5 | Barrel re-export `runCommitCommand` | 仅导出已删除函数 |
| `coordinator-mcp/safety.ts` | 80 | Coordinator MCP 安全策略包装器 | `createCoordinatorSafetyPolicy` — 零引用 |
| `exec/idle-timeout-watchdog.ts` | 126 | 进程空闲超时看门狗 | `IdleTimeoutWatchdog` 类 — 零引用 |
| `cli/classify-install-target.ts` | 50 | 插件市场安装目标分类器 | `classifyInstallTarget` — 零引用 |

**死测试文件（3 文件，373 行）：**

| 文件 | 行数 | 说明 |
|------|------|------|
| `test/auth-broker-import.test.ts` | 288 | R23 遗漏：导入已删除的 `auth-broker-cli`，无法运行 |
| `test/marketplace/cli.test.ts` | 52 | 测试已删除的 `classifyInstallTarget` |
| `test/commit-shared-llm.test.ts` | 33 | 测试已删除的 `shared-llm` |

**部分编辑（1 文件，-20 行）：**

| 文件 | 变更 | 说明 |
|------|------|------|
| `test/coordinator-mcp.test.ts` | -20 行 | 移除 `createCoordinatorSafetyPolicy` 导入和 1 个相关 it() 测试块 |

**Barrel 修复（1 文件，-1 行）：**

| 文件 | 变更 | 说明 |
|------|------|------|
| `commit/analysis/index.ts` | -1 行 | 移除 `export * from "./conventional"`，因 conventional.ts 已删除 |

**级联删除链：**

删除 `shared-llm.ts` 暴露了两个引用它的死文件，触发级联追溯：
```
shared-llm.ts (死)
  ├── analysis/conventional.ts (死, 零引用)
  └── map-reduce/reduce-phase.ts (死)
        └── map-reduce/index.ts (死)
              ├── map-phase.ts (死)
              └── pipeline.ts (死, runCommitCommand 零调用)
                    └── commit/index.ts (死 barrel)
```

**保留的活跃 commit 文件：** `types.ts`, `utils.ts`, `message.ts`, `model-selection.ts`, `git/diff.ts`, `changelog/` — 这些被 `utils/git.ts`, `tools/inspect-image.ts`, `utils/commit-message-generator.ts` 等活跃代码导入。

**R24 验证方法：** 每个函数/模块用 `grep -rn <functionName>` 在 `src/` 下搜索。结果为空的即确认为死代码。级联删除时额外验证：B 仅被 A 导入 + A 是死代码 → B 也是死代码。

验证: 构建零错误 ✅ | 4785 测试通过 (无新增失败) ✅ | `tsc --noEmit` 5 个预存错误与本次无关 | 核心命令全部存活

---

### 1.31 ~~死 commit/ 子系统完整移除~~（✅ 第二十五轮 — CLI 入口 `a14c0cfb` 移除导致的全链死亡）

> **状态**: 已删除。`a14c0cfb` 将 `commit` 从 CLI 移除 → `commands/commit.ts` 不可达（R23 删除）→ `runCommitCommand` 不可达（R24 删除 `pipeline.ts`）→ `runAgenticCommit` 不可达（本轮删除整个 agentic/ 子系统）。

**git log 关键时间线：**
- `19f8c1f4` — OMP 基线：`commit` 在 cli.ts 注册，`pipeline.ts:34` → `return runAgenticCommit(args)`
- `a14c0cfb` — "Narrow GJC"：`commit` 刻意从 CLI 移除，入口消失
- R23 → 删除 `commands/commit.ts`（死入口）
- R24 → 删除 `pipeline.ts`/`map-reduce/`/`cli.ts`/`shared-llm.ts`（第一层依赖）
- R25 → 删除 agentic/analysis/changelog/prompts（第二层依赖，本轮）

**删除清单（44 源文件 + 2 测试文件，3,740 行）：**

| 目录 | 文件数 | 行数 | 说明 |
|------|--------|------|------|
| `commit/agentic/` | 17 ts + 4 md | 2,290 | 完整 AI agent 会话 commit 工作流 |
| `commit/analysis/` | 4 | 416 | scope/summary/validation 分析工具 |
| `commit/changelog/` | 4 | 415 | CHANGELOG.md 自动检测/生成/写入 |
| `commit/prompts/` | 12 | 409 | 所有 commit AI 提示词模板 |
| `commit/message.ts` | 1 | 11 | `formatCommitMessage` 格式化 |
| `commit/model-selection.ts` | 1 | 51 | commit 场景双模型选择策略 |
| `commit/utils/exclusions.ts` | 1 | 42 | 文件排除过滤 |
| `commit/map-reduce/utils.ts` | 1 | 9 | R24 遗漏 |
| 死测试文件 | 2 | 97 | agentic + model-selection 测试 |

**级联删除链（完整）：**
```
a14c0cfb: commit 从 CLI 移除
  └── commands/commit.ts (R23)
        └── runCommitCommand = pipeline.ts (R24)
              ├── runAgenticCommit = agentic/index.ts (R25 本轮)
              │     ├── agentic/agent.ts, tools/, prompts/
              │     ├── changelog/ (4 文件)
              │     ├── analysis/ (4 文件)
              │     ├── message.ts
              │     └── model-selection.ts
              ├── map-reduce/ (R24)
              ├── cli.ts (R24)
              └── shared-llm.ts (R24)
                    └── prompts/ (12 文件)
```

**保留的 3 个活跃文件（324 行）：**

| 文件 | 行数 | 活跃引用 |
|------|------|---------|
| `commit/types.ts` | 118 | `utils/git.ts` → `FileDiff`, `NumstatEntry` 等类型 |
| `commit/git/diff.ts` | 148 | `utils/git.ts` → `parseNumstat`, `parseFileDiffs` |
| `commit/utils.ts` | 58 | `tools/inspect-image.ts` → `extractTextContent` |

commit/ 最终结构：
```
commit/
  types.ts       (活跃)
  git/diff.ts    (活跃)
  utils.ts       (活跃)
```

验证: 构建零错误 ✅ | 4783 测试通过 (-2 死测试) ✅ | 8 个关键词零残留引用 ✅ | 核心命令全部存活

---

### 1.32 ~~4 个死配置 Provider 移除~~（✅ 第二十六轮 — 从未完整接入的 Provider 配置）

> **状态**: 已删除。venice / xiaomi / zenmux / lm-studio 四个 provider，特征一致：models.json 中零自有模型（xiaomi/venice 仅在 litellm 中有代理条目）、PROVIDER_DESCRIPTORS 中仅 lm-studio 有默认模型映射但无 catalog discovery、无独立 OAuth 登录文件。仅有 `openai-compat.ts` 中的 ModelManagerOptions 配置函数、`types.ts` 中的 KnownProvider 条目、`stream.ts` 中的 env var 映射——纯粹的死配置重量。

**删除清单（10 文件，540 行）：**

| 文件 | 变更 | 说明 |
|------|------|------|
| `ai/src/types.ts` | -5 行 | KnownProvider 中移除 4 个 provider |
| `ai/src/stream.ts` | -3 行 | 移除 ZENMUX_API_KEY / VENICE_API_KEY / XIAOMI_API_KEY 映射 |
| `ai/src/cli.ts` | -1 行 | 移除 zenmux CLI 帮助条目 |
| `ai/src/models.json` | -236 行 | 移除 litellm 中的 venice (2) + xiaomi (9) 代理模型 |
| `ai/src/provider-models/openai-compat.ts` | -262 行 | 移除 zenmuxModelManagerOptions / lmStudioModelManagerOptions / veniceModelManagerOptions / xiaomiModelManagerOptions + 辅助函数 + 接口 + models.dev 描述符 |
| `ai/src/provider-models/descriptors.ts` | -1 行 | 移除 DEFAULT_MODEL_PER_PROVIDER 中 lm-studio 条目 |
| `ai/src/providers/openai-completions-compat.ts` | -9 行 | 移除 zenmux strictMode 检测 + isZenmuxHost 逻辑 |
| `coding-agent/src/config/model-profiles.ts` | -21 行 | 移除 3 个 mimo-* (xiaomi) 预设配置 |
| `coding-agent/src/config/models-config-schema.ts` | -1 行 | 移除 ProviderDiscoverySchema 中 lm-studio 枚举值 |

**各 Provider 分析：**

| Provider | models.json | DESCRIPTOR | OAuth | 实际状态 |
|----------|------------|------------|-------|---------|
| venice | litellm 中 2 个代理模型 | 无 | 无 | Venice.ai 不可审查 AI，从未独立接入 |
| xiaomi | litellm 中 9 个代理模型 | 无 (仅有 models.dev) | 无 | 小米 MIMO，仅通过 models.dev 描述符 + 预设配置 |
| zenmux | 零模型 | 无 (仅有 models.dev) | 无 | ZenMux 聚合器，仅通过 models.dev 描述符 |
| lm-studio | 零模型 | 仅有默认模型名 "llama-4" | 无 | 本地 LM Studio，仅 ProviderDiscoverySchema 枚举值 |

**models.json 变化：** 1,030 → 1,019 模型（litellm 内 venice/xiaomi 代理条目移除）

验证: 构建零错误 ✅ | 4783 测试通过 (无新增失败) ✅ | openai-compat.ts 零残留引用 ✅ | 核心命令全部存活

---

### 1.33 ~~LiteLLM Provider 完整移除~~（✅ 第二十七轮 — 用户不部署 LiteLLM 代理网关）

> **状态**: 已删除。LiteLLM 是需要用户自行部署的代理网关（`pip install litellm; litellm --port 4000`），用户未部署。但代码中有完整集成：`models.json` 中 810 个静态模型（~16,000 行，全指向 `http://localhost:4000`，元数据为 sentinel 占位值）、OAuth 登录流程、Provider descriptor、KnownProvider 条目。

**删除清单（11 文件，16,338 行）：**

| 文件 | 变更 | 说明 |
|------|------|------|
| `ai/src/models.json` | -16,233 行 | 删除 litellm provider 及其 810 个模型 |
| `ai/src/utils/oauth/litellm.ts` | -47 行 | 整文件删除 `loginLiteLLM` OAuth 登录 |
| `ai/src/provider-models/openai-compat.ts` | -32 行 | 删除 `litellmModelManagerOptions` + `LiteLLMModelManagerConfig` |
| `ai/test/kimi-tool-call-healing.test.ts` | +2/-12 行 | `getBundledModel("litellm", ...)` → 内联 model 对象 |
| `ai/src/provider-models/descriptors.ts` | -7 行 | 删除 litellm catalogDescriptor + import |
| `ai/src/auth-storage.ts` | -6 行 | 删除 `case "litellm"` OAuth 登录分支 |
| `ai/src/utils/oauth/index.ts` | -5 行 | 删除 builtInOAuthProviders 中 litellm 条目 |
| `ai/src/providers/openai-completions.ts` | -3 行 | 注释中 "LiteLLM/proxy" → "proxy" |
| `ai/src/types.ts` | -1 行 | KnownProvider 移除 `"litellm"` |
| `ai/src/stream.ts` | -1 行 | 移除 `LITELLM_API_KEY` env var 映射 |
| `ai/src/utils/oauth/types.ts` | -1 行 | OAuthProvider 移除 `"litellm"` |

**models.json 变化：** 21,430 行 → 5,197 行（-75%），1,019 模型 → 209 模型（-80%）

**测试改善：** AI 包测试 1005→1015 pass (+10)，46→36 fail (-10)。原依赖 litellm 垃圾元数据的测试改用内联模型后恢复正常。

验证: 构建零错误 ✅ | AI 1015 pass / coding-agent 4783 pass ✅ | litellm 源码零残留 ✅ | 核心命令全部存活

---

## 二、内置默认 Tool 完整清单

以下是从 `packages/coding-agent/src/tools/index.ts` 的 `BUILTIN_TOOLS` 和 `HIDDEN_TOOLS` 数组中提取的完整 tool 注册表。

### 2.1 核心工具（始终加载，无法禁用）

| Tool | 文件 | Settings Gate |
|------|------|---------------|
| `bash` | `tools/bash.ts` | 无 (始终可用) |
| `read` | `tools/read.ts` | 无 (始终可用) |
| `edit` | edit 模块 | 无 (始终可用) |
| `write` | `tools/write.ts` | 无 (始终可用) |
| `resolve` | `tools/resolve.ts` | Hidden, 有 deferrable tool 时才加载 |
| `yield` | `tools/yield.ts` | Hidden, 仅子进程使用 |
| `report_finding` | `tools/review.ts` | Hidden |

### 2.2 默认开启的工具（Settings 默认 true）

| Tool | 文件 | Settings Gate | 主要依赖 |
|------|------|---------------|---------|
| `task` | `tools/subagent.ts` | `task.maxRecursionDepth` (默认 2) | Async 系统 |
| `todo_write` | `tools/todo-write.ts` | `todo.enabled` (默认 true) | chalk |
| `find` | `tools/find.ts` | `find.enabled` (默认 true) | `@gajae-code/natives` |
| `search` | `tools/search.ts` | `search.enabled` (默认 true) | `@gajae-code/natives` |
| `ast_grep` | `tools/ast-grep.ts` | `astGrep.enabled` (默认 true) | `@gajae-code/natives` |
| `ast_edit` | `tools/ast-edit.ts` | `astEdit.enabled` (默认 true) | `@gajae-code/natives` |
| `web_search` | web/search/*.ts | `web_search.enabled` (默认 true) | 多个搜索提供商 API |
| `browser` | `tools/browser.ts` | `browser.enabled` (默认 true) | `puppeteer-core` (懒加载) |
| `lsp` | `tools/` → `lsp/` | `lsp.enabled` (默认 true) | LSP 客户端 |
| `debug` | `tools/debug.ts` | `debug.enabled` (默认 true) | DAP 调试器 |
| `eval` | `tools/eval.ts` | `eval.py` (默认 true) / `eval.js` (默认 true) | Python 内核 / Bun Worker |
| `skill` | `tools/skill.ts` | `skill.enabled` (默认 true) | 技能系统 |
| `recipe` | `tools/recipe/` | `recipe.enabled` (默认 true) | 纯 TS recipe runner |
| `irc` | `tools/irc.ts` | `irc.enabled` (默认 true) | Agent 间通信 |
| `fetch` (via read) | `tools/read.ts` | `fetch.enabled` (默认 true) | linkedom, markit-ai, readability |

### 2.3 默认关闭的工具（Settings 默认 false）

| Tool | Settings Gate | 移除建议 |
|------|---------------|---------|
| `github` | `github.enabled: false` | 不需要 GitHub CLI 操作可移除 |
| `render_mermaid` | `renderMermaid.enabled: false` | 轻量，按需保留 |
| `inspect_image` | `inspect_image.enabled: false` | 不需要图片理解可移除 |
| `calc` | `calc.enabled: false` | 轻量，按需保留 |
| `checkpoint` / `rewind` | `checkpoint.enabled: false` | 不需要上下文回滚可移除 |
| `image_gen` | 不在 BUILTIN_TOOLS，仅当 API key 存在时注入 | 不需要 AI 生图可移除 |
| `ssh` | 仅当 `~/.ssh/config` 有主机时加载 | 不需要 SSH 远程执行可移除 |
| `job` / `monitor` / `cron` | `async.enabled: false` | 不需要异步/后台任务可整体移除 |
| `subagent` | `async.enabled: false` (工厂检查) | 同上 |

### 2.4 "可发现"工具（默认隐藏，除非 model 主动搜索）

配置 `tools.discoveryMode` (默认 `"off"`):
- `browser` — `loadMode = "discoverable"` (在 tool 定义中声明)
- `inspect_image` — `loadMode = "discoverable"`
- `search_tool_bm25` — 仅当 discovery 激活时出现

---

## 三、运行模式分析

### 3.1 三种模式对比

| 模式 | CLI 触发 | 代码量 | 启动 TUI | 用途 |
|------|---------|--------|---------|------|
| **interactive** | 默认 (无 `-p`, 无 `--mode`) | ~20,000+ 行 (~70 文件) | 是 | 日常开发使用 |
| **print** | `-p` 或管道输入 | ~121 行 | 否 | CI/脚本集成 |
| **bridge** | `--mode bridge` | ~1,000 行 (6 文件) | 否 | HTTP 远程控制 |

> **RPC 模式已于第十三轮移除。** `--mode rpc` / `--mode rpc-ui` 不再可用。

**共享基础设施**:
- Bridge 使用 `modes/shared/`: ~4,376 行 (21 文件) — 命令分发、事件封装、无人值守控制、工作流门控
- Print 使用 `modes/runtime-init.ts`: ~117 行 — 无 TUI 的扩展初始化

### 3.2 如果你只用交互模式

可以安全移除的模式目录：

| 目录 | 行数 | 说明 |
|------|------|------|
| `modes/bridge/` | ~1,000 行 | HTTP 桥接服务器 |
| `modes/shared/` | ~4,376 行 | Bridge 共享基础设施 |
| `modes/print-mode.ts` | ~121 行 | 非交互单次模式 |

注意：`modes/shared/` 中有无人值守控制平面 (`unattended-*`)、工作流门控 (`workflow-gate-*`) 等，如果只用交互模式且不需要无人值守执行，这些都可以移除。

### 3.3 CLI 子命令

15 个子命令中，核心只有 `launch` (默认)。以下子命令服务于特定工作流：

| 子命令 | 用途 | 如果不用工作流可移除 |
|--------|------|---------------------|
| `setup` | 安装默认技能文件 | 保留 (首次安装需要) |
| `state` | 会话状态管理 | 可移除 |
| `session` | 会话管理 | 可移除 |
| `harness` | Agent harness 控制 | ✅ 已移除（第十六轮） |
| `coordinator` | 多 agent 协调 | 可移除 |
| `team` | 团队任务编排 | 可移除 |
| `ultragoal` | Ultragoal 工作流 | 可移除 |
| `ralplan` | RAL 计划 | 可移除 |
| `deep-interview` | 深度面谈 | 可移除 |
| `config` | 配置管理 | 建议保留 |
| `update` | 自更新 | 可移除 |
| `contribute-pr` | PR 贡献准备 | 可移除 |
| `mcp-serve` | MCP 服务器 | 取决于 MCP 需求 |

---

## 四、AI Provider 分析

### 4.1 Provider 代码体量

`packages/ai/src/providers/` 总大小: **528 KB** (28 文件)

| Provider 实现 | 大小 | 加载方式 |
|--------------|------|---------|
| `anthropic.ts` | 96 KB | 懒加载 (首次调用 ANTHROPIC API 时) |
| `openai-completions.ts` | 71 KB | 懒加载 |
| `openai-responses.ts` + shared/server | 105 KB | 懒加载 |
| `google-shared.ts` + `google.ts` | 35 KB | 懒加载 |
| `ollama.ts` | 19 KB | 懒加载 |
| `kimi.ts` | 1.7 KB | **立即加载** (`isKimiModel()` 需同步判断) |
| `mock.ts` | 16 KB | 测试用 |
| `register-builtins.ts` | 10 KB | 立即加载 (懒加载枢纽) |
| 其他辅助文件 | ~175 KB | 按需 |

**所有 5 个主要 provider (Anthropic, OpenAI Completions, OpenAI Responses, Google, Ollama) 都是懒加载的** — 只有实际调用对应 API 时才会 import。`register-builtins.ts` 使用 `||=` 缓存模式确保只加载一次。

### 4.2 models.json 中的 Provider

共 14 个 provider 定义了 1,030 个模型，文件大小 454 KB:

| Provider | 模型数 | API 协议 |
|----------|--------|---------|
| litellm | **821** | openai-completions (占文件的 80%) |
| opencode-zen | 58 | openai-completions, anthropic-messages, google-generative-ai |
| openai | 43 | openai-responses |
| google | 32 | google-generative-ai |
| anthropic | 19 | anthropic-messages |
| opencode-go | 15 | openai-completions |
| zai | 13 | anthropic-messages |
| minimax-cn | 8 | anthropic-messages |
| opencode | 5 | openai-completions |
| kimi-code | 5 | openai-completions |
| huggingface | 4 | openai-completions |
| ollama-cloud | 4 | ollama-chat |
| deepseek | 2 | openai-completions |
| moonshot | 1 | openai-completions |

**如果你只用 Anthropic + 1-2 个其他 provider，可以删除 models.json 中 90%+ 的模型定义，并删除对应 provider 实现文件。**

### 4.3 Provider 动态发现配置

`packages/ai/src/provider-models/openai-compat.ts` (1,553 行, 50 KB) 定义了每个 provider 的动态模型发现配置（base URL、API key 环境变量、模型映射函数）。这是第二大 provider 集成面。

---

## 五、Rust 层分析

### 5.1 Crate 结构

```
pi-natives (cdylib)  ← Node.js 加载的唯一入口
  ├── pi-ast      ← tree-sitter AST 解析 (19 默认语言 + 37 可选语言)
  ├── pi-iso      ← 文件系统隔离 (8 种后端)
  ├── pi-shell    ← Brush shell 执行 + 输出最小化器
  └── 独立 N-API 模块:
       grep, fd, clipboard, pty, sixel, highlight, tokens, text, ...
```

### 5.2 体积最大的依赖

| 依赖 | 配置 | 影响 | 移除可能性 |
|------|------|------|-----------|
| **brush-core + brush-builtins** | 完整 POSIX shell (~700 KB Rust) | 最大依赖树 | 如果不需要持久 shell 会话/输出最小化器，可整体移除 `pi-shell` |
| **tokio** | `features = ["full"]` | 编译大量无用特性 | 改为最小特性集: `rt-multi-thread, sync, process, io-util, time, macros` |
| **syntect** | `default-syntaxes, default-themes` | 嵌入 ~150 语法定义 + ~30 主题 (>2 MB) | 如果不需要语法高亮，移除 |
| **56 tree-sitter grammars** | 19 默认 + 37 full-langs | 每个 grammar 编译 C parser.c | 默认已裁剪 37 个。可进一步裁剪不用的语言 |
| **grep-* + ignore** | 完整 ripgrep 引擎 | 中高 | 可改为调用外部 `rg` 进程 |
| **tiktoken-rs** | o200k_base BPE 表 (~2 MB) | 中 | Token 计数可改为 JS 端近似 |
| **image** | png, jpeg, gif, webp | 中 | 如果只需 PNG，去掉 jpeg/gif/webp |
| **arboard** | wayland-data-control | 低 | 不需要剪贴板可移除 |
| **portable-pty** | - | 低 | 不需要交互式 PTY 可移除 |

### 5.3 `full-langs` Feature（默认关闭）

默认编译 19 种核心语言的 tree-sitter 解析器。`full-langs` feature 额外添加 37 种:

```
astro, clojure, cmake, dart, diff, dockerfile, elixir, erlang, graphql,
haskell, hcl, ini, just, julia, kotlin, lua, make, nix, objc, ocaml,
odin, perl, powershell, proto, r, regex, scala, solidity, sql, starlark,
svelte, swift, tlaplus, verilog, vue, xml, zig
```

如果只需要 Rust/TS/Python/Go 等核心语言，甚至可以进一步裁剪默认的 19 种。

### 5.4 各 N-API 模块独立性

`pi-natives/src/` 中的每个模块（`grep.rs`, `pty.rs`, `clipboard.rs`, `sixel.rs`, `tokens.rs` 等）相对独立。移除某个模块只需：
1. 删除 `pi-natives/src/<module>.rs`
2. 从 `lib.rs` 中移除对应的 `mod` 声明和 N-API 导出
3. 从 `Cargo.toml` 中移除对应的依赖（如果没有其他模块使用）
4. 从 `packages/natives/` 中移除对应的 JS 包装

**已移除的模块**: `power.rs` (macOS IOKit 电源断言), `appearance.rs` (macOS 外观检测), `pi-shell/src/windows.rs` (Windows PATH), `winreg` crate

---

## 六、大型可选模块清单（按代码量排序）

以下是可以整体移除的模块目录，按代码体量从大到小排列：

### 6.1 TypeScript 层

| 优先级 | 目录 | 功能 | 默认状态 | 估算行数 |
|--------|------|------|---------|---------|
| ✅ 已移除 | `modes/rpc/` | JSON-RPC 协议 | 已删除 (~2,100 行) | |
| ✅ 已移除 | `python/` | Python 后端 + RPC 客户端 | 已删除 (~30,000 行) |
| ✅ 已移除 | `harness-control-plane/` + `commands/harness.ts` | Harness 控制平面 | 已删除 (~12,200 行) |
| ✅ 已移除 | `exa/` | Exa MCP 工具集 | 已删除 (~1,200 行) |
| ✅ 已移除 | `modes/controllers/runtime-mcp-command-controller.ts` + 5 个 MCP 依赖 | MCP 交互式管理界面 | 已删除 (~4,000 行) |
| 🔴 高 | `modes/shared/` | Bridge 共享基础设施 | 仅 `--mode bridge` | ~4,400 |
| 🔴 高 | `modes/bridge/` | HTTP 桥接服务器 | 仅 `--mode bridge` | ~1,000 |
| 🔴 高 | `modes/print-mode.ts` | 非交互单次模式 | `-p` 标志 | ~120 |
| 🟡 中 | `stt/` | 语音转文字 | `stt.enabled: false` | ~300 |
| 🟡 中 | `memories/` + `memory-backend/` | 本地记忆流水线 | `memory.backend: "off"` | ~500 |
| 🟡 中 | `exa/` | Exa 搜索集成 | 需 API key | ~600 |
| 🟡 中 | `ssh/` | SSH 远程执行 | 需 SSH 配置 | ~300 |
| 🟡 中 | `tools/puppeteer/` | 浏览器反指纹脚本 (13个) | `browser.enabled: true` | ~200 |
| 🟡 中 | `tools/browser/` | 浏览器自动化 | `browser.enabled: true` | ~800 |
| 🟡 中 | `dap/` | Debug Adapter Protocol | `debug.enabled: true` | ~500 |
| 🟡 中 | `debug/` | 调试诊断工具集 | 开发诊断 | ~1,500 |
| 🟡 中 | `vim/` | Vim 编辑模式 | 取决于 edit.mode | ~1,500 |
| 🟢 低 | `tools/irc.ts` | Agent 间 IRC | `irc.enabled: true` | ~200 |
| 🟢 低 | `tools/recipe/` | Recipe runner | `recipe.enabled: true` | ~400 |
| 🟢 低 | `tools/calculator.ts` | 计算器 | `calc.enabled: false` | ~100 |

### 6.2 Package 级别

| 优先级 | Package/目录 | 功能 | 可移除? |
|--------|-------------|------|---------|
| ✅ 已移除 | `packages/bridge-client/` | 独立桥接客户端库 | 已删除 (~1,150 行) |
| ✅ 已移除 | `python/robogjc/` + `python/gjc-rpc/` | Python 后端 + RPC 客户端 | 已删除 (~30,000 行) |
| 🟡 中 | `packages/gajae-code/` | 顶层 npm 包 | 需调查用途 |
| 🟢 低 | `packages/stats/` | 本地可观测性仪表板 | 如果不用 `gjc stats` |

### 6.3 Rust 层

| 优先级 | 模块 | 功能 | 可移除? |
|--------|------|------|---------|
| 🔴 高 | `pi-shell` (整个 crate) | Brush shell + 输出最小化器 | ✅ 如果用外部 shell |
| 🔴 高 | `full-langs` feature | 37 种额外 tree-sitter 语言 | ✅ 已默认关闭 |
| 🟡 中 | syntect 嵌入数据 | 语法高亮数据 | ✅ 如果不需要高亮 |
| 🟡 中 | grep-* + ignore | ripgrep 引擎 | ✅ 可改为外部 rg |
| 🟡 中 | tiktoken-rs | Token 计数 | ✅ 可改为 JS 端 |
| 🟡 中 | individual tree-sitter grammars | 不用的编程语言 | ✅ 可逐个裁剪 |
| 🟢 低 | arboard | 剪贴板访问 | ✅ |
| 🟢 低 | portable-pty | 交互式 PTY | ✅ |
| 🟢 低 | icy_sixel | SIXEL 图片编码 | ✅ |
| 🟢 低 | html-to-markdown-rs | HTML 转 Markdown | ✅ |

---

## 七、推荐移除方案

### 方案 A: 最小裁剪（保守）

适合「只保留核心对话 + 编辑功能」：

**TypeScript 移除**:
- `modes/bridge/`, `modes/shared/`, `modes/print-mode.ts`
- `stt/`, `memories/`, `memory-backend/`
- `ssh/`
- `dap/`, `debug/`
- `tools/puppeteer/`, `tools/browser/`

> 注: `modes/acp/`、`hindsight/`、`autoresearch/`、两个 benchmark package、`modes/rpc/`、`bridge-client/`、`python/`、`harness-control-plane/`、`exa/`、MCP 管理界面、ACP helper、MCP protocol、`discovery/codex.ts` 等已在前二十一轮移除。

**Settings 清理**:
- 删除所有 `default: false` 且对应代码已移除的配置项

**Rust 清理**:
- 保持 `full-langs` 关闭
- 裁剪 tokio features

**预计减少**: ~11,000 行 TS + ~3 个 package

### 方案 B: 中度裁剪（推荐）

在方案 A 基础上：

**TypeScript 额外移除**:
- `vim/`, `tools/irc.ts`, `tools/recipe/`, `tools/calculator.ts`, `tools/checkpoint.ts`
- `lsp/` (如果不需要诊断), `debug/`
- `packages/stats/`
- 多余的 CLI 子命令 (team, ultragoal, ralplan, deep-interview, coordinator, harness等)

**AI Provider 清理**:
- 只保留你实际使用的 1-2 个 provider 实现
- 清理 `models.json` 中不用的 provider/model 条目
- 清理 `provider-models/openai-compat.ts` 中不用的 provider 配置

**Rust 清理**:
- 移除 `pi-shell` (改为调用系统 shell)
- 移除 syntect 嵌入数据
- 移除不用的 tree-sitter grammars（只保留你用的语言）
- 移除 grep-* + ignore（改为调用外部 rg）
- 移除 tiktoken-rs
- 移除 arboard, portable-pty, icy_sixel

**预计减少**: ~30,000 行 TS + ~500 KB models.json + ~500 KB Rust 依赖

### 方案 C: 激进裁剪

在方案 B 基础上：

**TypeScript 额外移除**:
- `packages/coding-agent/src/lsp/` — 如果不需要 LSP 诊断
- `tools/eval.ts` — 如果不需要 Python/JS 求值
- `tools/web/` — 如果不需要 web 搜索
- `tools/render-mermaid.ts` — 如果不需要 Mermaid 渲染
- `tools/inspect-image.ts`
- `tools/image-gen.ts` — 如果不需要 AI 生图
- 只保留 `bash`, `read`, `edit`, `write`, `search`, `find`, `todo_write`, `task` 8 个核心 tool

**Settings 清理**:
- 只保留核心配置（model, theme, compaction 基础, edit 基础），其余全部删除

**Rust 清理**:
- 移除 `pi-ast` (如果不需要 AST-grep 和代码摘要)
- 只保留 `pi-iso` (如果需要隔离) 或也移除
- 最小化 `pi-natives` 到只包含 edit_fuzzy, glob, text, utils

**预计减少**: ~50,000+ 行 TS + 大量 Rust 代码

---

## 八、关键代码路径索引

### 工具注册
- `packages/coding-agent/src/tools/index.ts` — BUILTIN_TOOLS / HIDDEN_TOOLS 定义 + `isToolAllowed()` 门控
- `packages/coding-agent/src/sdk.ts` — `createTools()` 工厂 + image_gen 注入 + discovery 控制

### Settings 体系
- `packages/coding-agent/src/config/settings-schema.ts` — 所有配置项定义 (2762 行)
- `packages/coding-agent/src/config/settings.ts` — Settings 单例实现
- `packages/coding-agent/src/config/skill-settings-defaults.ts` — 技能发现默认值

### AI Provider
- `packages/ai/src/providers/register-builtins.ts` — 懒加载枢纽
- `packages/ai/src/models.json` — 静态模型目录 (454 KB)
- `packages/ai/src/provider-models/openai-compat.ts` — Provider 动态发现配置 (50 KB)
- `packages/ai/src/model-manager.ts` — 模型管理器
- `packages/ai/src/stream.ts` — 流式调用主入口 (Kimi 同步导入)

### 运行模式
- `packages/coding-agent/src/cli.ts` — CLI 入口 + 子命令路由
- `packages/coding-agent/src/main.ts` — `runRootCommand()` 分发器
- `packages/coding-agent/src/modes/interactive-mode.ts` — 交互模式 (2653 行)
- `packages/coding-agent/src/modes/index.ts` — 模式注册表

### Rust 关键文件
- `crates/pi-natives/src/lib.rs` — N-API 模块注册
- `crates/pi-ast/Cargo.toml` — `full-langs` feature 定义
- `crates/pi-shell/src/minimizer/` — 输出最小化器 (70+ TOML 定义 + 20 filter)
- 根 `Cargo.toml` — workspace 依赖管理

---

## 九、注意事项

1. **懒加载不等于零成本**: 虽然 Anthropic/OpenAI/Google/Ollama 的 provider 实现是懒加载的，但 `register-builtins.ts` (立即加载) 和 `model-manager.ts` (立即加载) 会解析整个 `models.json`。如果你只用一个 provider，删除其他 provider 的 models.json 条目可以减少启动时的 JSON 解析开销。

2. **Tool 间的隐式依赖**:
   - `search` 启用 → `ast_grep` 自动加入 (如果 `astGrep.enabled`)
   - `edit` 启用 → `ast_edit` 自动加入 (如果 `astEdit.enabled`)
   - `bash` 启用 → `recipe` 自动加入 (如果 `recipe.enabled`)
   - `subagent`/`job`/`monitor`/`cron` → 都依赖 `AsyncJobManager` (`async.enabled`)

3. **Rust 模块间依赖**: `pi-natives` 的每个 N-API 模块相对独立，但 `pi-shell` 依赖 `brush-core` + `brush-builtins` 的整个依赖树。移除 `pi-shell` 可连带移除 15+ 个 Rust crate 依赖。

4. **Settings schema 中的死配置**: 很多配置项标记了 `ui` 元数据（在 TUI settings 面板显示），但有些没有（隐藏配置）。删除代码时需要同步清理 settings-schema.ts 中的定义，否则 `settings.get()` 会返回默认值但代码路径已被删除。

5. **生成文件警告**: `packages/ai/src/models.json` 不应该手动编辑（根据 AGENTS.md），而应该通过 `bun --cwd=packages/ai run generate-models` 重新生成。但如果你要魔改，直接编辑 JSON 也是可行的。
