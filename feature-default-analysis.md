# Gajae-Code 功能默认状态完整分析

> 分析日期: 2026-06-18 | 分支: 260613-v0.5.0-dev | 代码基线: 0.5.0
>
> **已执行移除**:
> - 第一轮: macOS 电源管理 (~350 行)
> - 第二轮: 全平台死代码清理 (~1,120 行)
> - 第三轮: Hindsight 远程记忆系统 (~2,600 行)
> - 第四轮: ACP IDE 集成协议 (~3,300 行 + 13 测试文件)
> - 第五轮: OpenTelemetry 可观测性系统 (~2,660 行 + 4 测试文件 + 3 个 npm 包)
> - 第六轮: DAP 调试器配置精简 (14 个调试器 → 1 个，~190 行 JSON + 文档)
> - 总计减少 ~10,220+ 行，仅 Linux/WSL2 + 本地记忆 + 交互模式 + Python 调试运行。

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
| Settings 配置项 | ~104 个 (已移除 4 power + 32 hindsight) |
| 已移除代码行数 | ~10,030+ 行 (五轮) |
| 运行模式 | 4 种 (interactive, print, bridge, rpc) |
| CLI 子命令 | 15 个 |

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

> **Hindsight 远程记忆已于第三轮移除。** 详见 Section 1.11。

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
| `skills.enableClaudeUser` | `false` | 发现 Claude 用户级技能 |
| `skills.enableClaudeProject` | `false` | 发现 Claude 项目级技能 |
| `skills.enablePiUser` | `false` | 发现 GJC 用户级技能 |
| `skills.enablePiProject` | `false` | 发现 GJC 项目级技能 |
| `commands.enableClaudeUser` | `false` | Claude 用户级自定义命令 |
| `commands.enableClaudeProject` | `false` | Claude 项目级自定义命令 |
| `commands.enableOpencodeUser` | `false` | OpenCode 用户级自定义命令 |
| `commands.enableOpencodeProject` | `false` | OpenCode 项目级自定义命令 |

**关键结论**: `skills.enabled: false` 意味着开箱即用时，外部技能发现完全不会运行。只有内置的 4 个默认工作流技能（`deep-interview`, `ralplan`, `ultragoal`, `team`）通过 `install:defaults` 安装后可用。

### 1.8 ~~macOS 电源管理~~（✅ 已移除 — 仅 WSL2/Linux 运行）

> **状态**: 已删除。此功能通过 macOS `IOKit` API (`caffeinate` 等效) 阻止 Mac 在 agent 会话期间休眠。在 Linux/WSL2 上是空操作。

删除清单：
| 文件 | 操作 |
|------|------|
| `crates/pi-natives/src/power.rs` | 删除 (~270 行 Rust) |
| `crates/pi-natives/src/lib.rs` | 移除 `pub mod power;` |
| `packages/coding-agent/src/config/settings-schema.ts` | 移除 4 个 `power.*` 配置项 |
| `packages/coding-agent/src/session/agent-session.ts` | 移除 `MacOSPowerAssertion` import、`#powerAssertion` 字段、`#acquirePowerAssertion()`/`#releasePowerAssertion()` 方法、4 个调用点 |
| `packages/natives/native/index.d.ts` | 移除 `MacOSPowerAssertion` 类和 `MacOSPowerAssertionOptions` 接口 |
| `packages/natives/test/native.test.ts` | 移除 import 和测试用例 |

验证: `cargo check -p pi-natives` ✅ | `bun check` 无新增错误 ✅

### 1.9 ~~平台专属死代码~~（✅ 已移除 — 仅 WSL2/Linux 运行）

> **状态**: 已删除。macOS 外观检测 + Windows 路径/PATH/ConPTY 相关代码在 Linux 上永远是空操作或不编译。

#### macOS 外观检测

删除清单：
| 文件 | 操作 |
|------|------|
| `crates/pi-natives/src/appearance.rs` | 删除 (452 行) |
| `crates/pi-natives/src/lib.rs` | 移除 `pub mod appearance;` |
| `packages/natives/native/index.d.ts` | 移除 `MacAppearanceObserver` 类、`detectMacOSAppearance()` 函数、`MacOSAppearance` 枚举 |
| `packages/coding-agent/src/modes/theme/theme.ts` | 移除 observer 函数 (start/stop)、`macOSReportedAppearance` 变量、`shouldUseMacOSAppearanceFallback`、Tier 3 回退逻辑 |
| `packages/coding-agent/test/theme-auto-detection.test.ts` | 移除 4 个 macOS 相关测试用例 + import |

#### Windows 死代码

删除清单：
| 文件 | 操作 |
|------|------|
| `crates/pi-shell/src/windows.rs` | 删除 (309 行) |
| `crates/pi-shell/src/lib.rs` | 移除 `pub mod windows;` |
| `crates/pi-shell/Cargo.toml` | 移除整个 `[target.'cfg(windows)'.dependencies]` 块 |
| `crates/pi-natives/src/pty.rs` | 移除 ~70 行 ConPTY/`#[cfg(windows)]` 分支，保留 Unix 路径 |
| `crates/pi-natives/src/fs_cache.rs` | 移除 `cfg!(windows)` 路径分隔符转换 |
| `crates/pi-shell/src/shell.rs` | 移除 `#[cfg(windows)]` normalize_env_key, merge_path_values, push_unique_paths, normalize_path_segment, PATH fallback, pipe 创建 |
| 根 `Cargo.toml` | 移除 `winreg = "0.56"` |

验证: `cargo check -p pi-natives -p pi-shell` ✅ | `bun check` 无新增错误 ✅

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

### 1.11 ~~Hindsight 远程记忆系统~~（✅ 已移除 — 保留本地记忆）

> **状态**: 已删除 Hindsight 远程记忆后端。本地记忆流水线 (`memories/` + `memory-backend/`) 完整保留。

Hindsight 是 Vectorize.io 提供的远程向量化记忆服务。需要外部 API token，提供 retain/recall/reflect 操作和 Mental Models 功能。

删除清单：
| 文件 | 操作 |
|------|------|
| `packages/coding-agent/src/hindsight/` | 删除整个目录 (10 文件: backend, bank, client, config, content, index, mental-models, seeds.json, state, transcript) |
| `packages/coding-agent/src/tools/hindsight-recall.ts` | 删除 |
| `packages/coding-agent/src/tools/hindsight-reflect.ts` | 删除 |
| `packages/coding-agent/src/tools/hindsight-retain.ts` | 删除 |
| `memory-backend/types.ts` | 移除 `"hindsight"` 类型值 + `parentHindsightSessionState` 字段 |
| `memory-backend/resolve.ts` | 移除 `hindsightBackend` import 和分支 |
| `agent-session.ts` | 移除 `#hindsightSessionState` 字段、getter/setter、`#rekeyHindsight`/`#resetHindsightConversation` 方法、所有调用点 (9 处)、dispose 清理 |
| `sdk.ts` | 移除 `parentHindsightSessionState` option、`getHindsightSessionState` tool session 字段 |
| `task/executor.ts` + `task/index.ts` | 移除 `parentHindsightSessionState` 传递 |
| `command-controller.ts` | 移除 import 块、`/memory mm` 路由、7 个 `#mm*` 方法 |
| `config/settings-schema.ts` | 移除 32 个 `hindsight.*` 配置项 + `hindsightActive` 条件常量 + `HINDSIGHT_RECALL_TYPES_DEFAULT` |
| `config/settings.ts` | 移除 Hindsight 配置迁移代码 |
| `settings-defs.ts` | 移除 `hindsightActive` 条件函数 + `Settings` import |
| `settings-selector.ts` | 残留注释 (无害) |
| `slash-commands/builtin-registry.ts` | 移除 `case "mm"` (Hindsight 记忆路由) |

验证: `cargo check` ✅ | `bun check` 新增错误 0 ✅

### 1.12 ~~ACP IDE 集成协议~~（✅ 已移除 — 仅保留交互模式）

> **状态**: 已删除。ACP (Agent Client Protocol) 是基于 `@agentclientprotocol/sdk` 的 stdio 协议，让 VS Code/JetBrains 等 IDE 通过 `--mode acp` 驱动 agent。仅交互模式使用不需要此能力。

删除清单：
| 文件 | 操作 |
|------|------|
| `packages/coding-agent/src/modes/acp/` | 删除整个目录 (6 文件: index, acp-agent, acp-mode, acp-client-bridge, acp-event-mapper, terminal-auth) |
| `packages/coding-agent/src/slash-commands/acp-builtins.ts` | 删除 |
| `packages/coding-agent/src/commands/acp.ts` | 删除 |
| `packages/coding-agent/src/modes/index.ts` | 移除 `export { runAcpMode } from "./acp"` |
| `packages/coding-agent/src/cli/args.ts` | 移除 `"acp"` from `Mode` 类型和验证分支 |
| `packages/coding-agent/src/cli.ts` | 移除 `"acp"` from `--mode` flag options |
| `packages/coding-agent/src/commands/launch.ts` | 移除 `prepareAcpTerminalAuthArgs` import 和 `"acp"` mode option，简化 `run()` |
| `packages/coding-agent/src/main.ts` | 移除 `AcpSessionFactory` 类型、`AcpSessionFactoryOptions` 接口、`createAcpSessionFactory` 函数、`runAcpMode` deps 字段、ACP dispatch 分支、2 处 condition 中的 `"acp"` |
| `packages/coding-agent/src/session/agent-session.ts` | 移除 ACP 权限门控 (~160 行: `PERMISSION_REQUIRED_TOOLS`、`PERMISSION_OPTIONS`、`getPermissionIntent`、`extractPermissionLocations` 等辅助函数、`#wrapToolForAcpPermission` 方法、`#allowAcpAgentInitiatedTurns`/`#acpPermissionDecisions` 字段、`drainAsyncJobDeliveriesForAcp` 方法)、简化 `setClientBridge`、清理 imports |
| `packages/coding-agent/src/slash-commands/types.ts` | 移除 `acpDescription`/`acpInputHint` 字段和 `AcpBuiltinCommandRuntime`/`AcpBuiltinSlashCommandResult` 类型 |
| `packages/coding-agent/src/slash-commands/builtin-registry.ts` | 注释化 14 处 `acpDescription`/`acpInputHint` 赋值 |
| `packages/coding-agent/package.json` | 移除 `@agentclientprotocol/sdk` 依赖、`./modes/acp` exports |
| 根 `package.json` | 移除 `@agentclientprotocol/sdk` catalog 条目 |
| `scripts/verify-g002-gates.ts` | 移除 ACP builtins 断言 |
| `test/acp-*.test.ts` (7 文件) | 删除 |
| `test/agent-session-acp-permission.test.ts` | 删除 |
| `test/bash-acp-terminal.test.ts` | 删除 |
| `test/read-acp-fs.test.ts` | 删除 |
| `test/write-acp-fs.test.ts` | 删除 |
| `test/acp/` 目录 | 删除 |
| `test/helpers/acp-schema.ts` | 删除 |
| `test/agent-wire-conformance.test.ts` | 移除 ACP 测试用例和 imports |
| `test/cli-args-mpreset.test.ts` | 移除 ACP session factory 测试用例 |
| `test/gjc-ui-redesign.test.ts` | 移除 ACP_BUILTIN_SLASH_COMMANDS 引用 |
| `test/agent-session-concurrent.test.ts` | 移除 `drainAsyncJobDeliveriesForAcp` 测试用例 |
| `test/agent-wire/command-contract.redteam.test.ts` | 移除 ACP 目录/文件路径引用 |

验证: `tsc --noEmit` 零新增错误 ✅ | `bun check` 无新增 issue ✅

### 1.13 ~~OpenTelemetry 可观测性系统~~（✅ 已移除 — 无运行时效果）

> **状态**: 已删除。Telemetry 系统（`telemetry.ts` 2036 行 + `run-collector.ts` 626 行）实现 OpenTelemetry GenAI 语义约定，追踪 token 用量、cost 估算、tool 执行状态和 LLM gateway 元数据。由于 TracerProvider 从未注册、`setTelemetry()` 从未调用、`telemetry` config 全线为 `undefined`，运行时全程短路，属于纯粹的死代码。

删除清单：
| 文件 | 操作 |
|------|------|
| `packages/agent/src/telemetry.ts` | 删除 (2,036 行) |
| `packages/agent/src/run-collector.ts` | 删除 (626 行) |
| `packages/agent/src/agent-loop.ts` | 移除所有 telemetry/run-collector 导入、移除 span 树包裹 (`runInActiveSpan`/`startChatSpan`/`finishChatSpan` 等 10+ 个函数调用)、简化 `buildAgentEndEvent`/`AgentLoopDetailedResult`/`agentLoopDetailed`/`createDetailedCapture`/`runLoop`/`streamAssistantResponse`/`executeToolCalls`、本地化 `ToolCallBlockedError` |
| `packages/agent/src/agent.ts` | 移除 `#telemetry` 字段、`telemetry` getter、`setTelemetry()` 方法、构造函数赋值、config 传递 |
| `packages/agent/src/types.ts` | 移除 `AgentTelemetryConfig`/`AgentRunSummary`/`AgentRunCoverage` 导入、`telemetry?` from `AgentLoopConfig`、`telemetry?`/`coverage?` from `agent_end` 事件 |
| `packages/agent/src/index.ts` | 移除 `run-collector`/`telemetry` 的 `export *` |
| `packages/agent/src/compaction/compaction.ts` | 4 处 `instrumentedCompleteSimple` → `completeSimple`、移除 `AgentTelemetry` 导入和 `telemetry?` 选项字段 |
| `packages/agent/src/compaction/branch-summarization.ts` | `instrumentedCompleteSimple` → `completeSimple`、移除 `telemetry?` 选项字段 |
| `packages/agent/package.json` | 移除 `@opentelemetry/api` (deps)、`@opentelemetry/context-async-hooks`/`@opentelemetry/sdk-trace-base` (devDeps) |
| `packages/coding-agent/src/sdk.ts` | 移除 `AgentTelemetryConfig` 导入、`telemetry?` from `CreateAgentSessionOptions`、`getTelemetry` from `ToolSession`、`telemetry:` from Agent config |
| `packages/coding-agent/src/session/agent-session.ts` | 移除 `resolveTelemetry` 导入和 6 处 telemetry 变量/参数 |
| `packages/coding-agent/src/task/executor.ts` | 移除 `parentTelemetry`/`subagentTelemetry`/`recordHandoff`/`resolveTelemetry` 整块 |
| `packages/coding-agent/src/task/index.ts` | 移除 2 处 `parentTelemetry:` 传递 |
| `packages/coding-agent/src/tools/inspect-image.ts` | `instrumentedCompleteSimple` → `completeSimple`、移除 `resolveTelemetry` |
| 根 `package.json` | 移除 `@opentelemetry/api`/`@opentelemetry/context-async-hooks`/`@opentelemetry/sdk-trace-base` catalog 条目 |
| `packages/agent/test/otel.test.ts` | 删除 |
| `packages/agent/test/compaction-telemetry.test.ts` | 删除 |
| `packages/agent/test/run-summary.test.ts` | 删除 |
| `packages/coding-agent/test/telemetry-full-capture-warning.test.ts` | 删除 |

验证: `tsc --noEmit -p packages/agent` 零新增错误 ✅ | `tsc --noEmit -p packages/coding-agent` 零错误 ✅

### 1.14 ~~DAP 调试器配置精简~~（✅ 已执行 — 14 个调试器 → 1 个）

> **状态**: 已完成。`dap/defaults.json` 原定义 14 个调试适配器配置，面向 Python/C/C++/Rust/Go/JS/TS/C#/Kotlin/Ruby/PHP/Bash/Dart/Flutter/Elixir 全语言。经分析：
> - 8 种语言（Go/C#/Kotlin/Ruby/PHP/Dart/Flutter/Elixir）与用户研究领域无关
> - C/C++/Rust 的 gdb/lldb-dap 需 Ubuntu 24.04+，codelldb 是 VS Code 扩展不可独立安装
> - JS/TS 的 js-debug-adapter 和 Bash 的 bash-debug-adapter 在 npm 上不存在，仅在 VS Code 内部使用
> - 仅 Python 的 debugpy 可通过 `pip install debugpy` 正常安装使用

删除清单：
| 文件 | 操作 |
|------|------|
| `dap/defaults.json` | 删除 13 个调试器配置块（gdb, lldb-dap, codelldb, dlv, js-debug-adapter, netcoredbg, kotlin-debug-adapter, rdbg, php-debug-adapter, bash-debug-adapter, dart-debug-adapter, flutter-debug-adapter, elixir-ls-debugger），仅保留 debugpy（211 行 → 17 行） |
| `dap/config.ts` | `EXTENSIONLESS_DEBUGGER_ORDER` 清空为 `[]`，注释更新 |
| `dap/client.ts` | 3 处注释去掉 `dlv` 引用 |
| `tools/debug.ts` | adapter 描述从 `(gdb, lldb-dap, debugpy, dlv)` 更新为 `(debugpy)` |
| `prompts/tools/debug.md` | 内置调试器列表从 4 个更新为仅 debugpy |

验证: `tsc --noEmit -p packages/coding-agent` 零错误 ✅

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
| `report_finding` | `tools/hindsight-reflect.ts`? | Hidden |

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

### 3.1 四种模式对比

| 模式 | CLI 触发 | 代码量 | 启动 TUI | 用途 |
|------|---------|--------|---------|------|
| **interactive** | 默认 (无 `-p`, 无 `--mode`) | ~20,000+ 行 (~70 文件) | 是 | 日常开发使用 |
| **print** | `-p` 或管道输入 | ~121 行 | 否 | CI/脚本集成 |
| ~~**acp**~~ | ~~`--mode acp`~~ | ~~~3,328 行~~ | — | ✅ 已移除 (第四轮) |
| **bridge** | `--mode bridge` | ~1,000 行 (6 文件) | 否 | HTTP 远程控制 |
| **rpc** | `--mode rpc` | ~2,102 行 (5 文件) | 否 | JSON-RPC 无头协议 |
| **rpc-ui** | `--mode rpc-ui` | 同上 (共享) | 可通过 rpc 暴露 UI | RPC + UI 能力 |

**共享基础设施**:
- Bridge + RPC 共享 `modes/shared/`: ~4,376 行 (21 文件) — 命令分发、事件封装、无人值守控制、工作流门控
- Print + RPC 共享 `modes/runtime-init.ts`: ~117 行 — 无 TUI 的扩展初始化

### 3.2 如果你只用交互模式

可以安全移除的模式目录：

| 目录 | 行数 | 说明 |
|------|------|------|
| ~~`modes/acp/`~~ | ~~~3,328 行~~ | ✅ 已移除 |
| `modes/bridge/` | ~1,000 行 | HTTP 桥接服务器 |
| `modes/rpc/` | ~2,102 行 | JSON-RPC 协议 |
| `modes/shared/` | ~4,376 行 | Bridge+RPC 共享基础设施 |
| `modes/print-mode.ts` | ~121 行 | 非交互单次模式 |

注意：`modes/shared/` 中有无人值守控制平面 (`unattended-*`)、工作流门控 (`workflow-gate-*`) 等，如果只用交互模式且不需要无人值守执行，这些都可以移除。

### 3.3 CLI 子命令

15 个子命令中，核心只有 `launch` (默认)。以下子命令服务于特定工作流：

| 子命令 | 用途 | 如果不用工作流可移除 |
|--------|------|---------------------|
| `setup` | 安装默认技能文件 | 保留 (首次安装需要) |
| `state` | 会话状态管理 | 可移除 |
| `session` | 会话管理 | 可移除 |
| `harness` | Agent harness 控制 | 可移除 |
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
| ✅ 已移除 | theme.ts macOS observer | 外观检测回退 (CoreFoundation) | 仅 macOS | ~80 行 TS |
| ✅ 已移除 | `modes/acp/` | ACP IDE 协议 | 已删除 (~3,300 行 TS + 13 测试文件) | |
| 🔴 高 | `modes/shared/` | Bridge+RPC 共享基础设施 | 仅 `--mode bridge/rpc` | ~4,400 |
| 🔴 高 | `modes/rpc/` | JSON-RPC 协议 | 仅 `--mode rpc` | ~2,100 |
| 🔴 高 | `modes/bridge/` | HTTP 桥接服务器 | 仅 `--mode bridge` | ~1,000 |
| 🔴 高 | `modes/print-mode.ts` | 非交互单次模式 | `-p` 标志 | ~120 |
| 🟡 中 | `stt/` | 语音转文字 | `stt.enabled: false` | ~300 |
| 🟡 中 | `memories/` + `memory-backend/` | 本地记忆流水线 | `memory.backend: "off"` | ~500 |
| ✅ 已移除 | `hindsight/` | Hindsight 远程记忆 | 已删除 (~1,800 行 TS) | |


| 🟡 中 | `exa/` | Exa 搜索集成 | 需 API key | ~600 |
| 🟡 中 | `ssh/` | SSH 远程执行 | 需 SSH 配置 | ~300 |
| 🟡 中 | `tools/puppeteer/` | 浏览器反指纹脚本 (13个) | `browser.enabled: true` | ~200 |
| 🟡 中 | `tools/browser/` | 浏览器自动化 | `browser.enabled: true` | ~800 |
| 🟡 中 | `dap/` | Debug Adapter Protocol | `debug.enabled: true` | ~500 |
| 🟡 中 | `debug/` | 调试诊断工具集 | 开发诊断 | ~1,500 |
| 🟡 中 | `autoresearch/` | 自动研究报告 | 特定命令 | ~500 |
| 🟡 中 | `vim/` | Vim 编辑模式 | 取决于 edit.mode | ~1,500 |
| 🟢 低 | `tools/irc.ts` | Agent 间 IRC | `irc.enabled: true` | ~200 |
| 🟢 低 | `tools/recipe/` | Recipe runner | `recipe.enabled: true` | ~400 |
| 🟢 低 | `tools/calculator.ts` | 计算器 | `calc.enabled: false` | ~100 |

### 6.2 Package 级别

| 优先级 | Package/目录 | 功能 | 可移除? |
|--------|-------------|------|---------|
| 🔴 高 | `packages/orchestration-token-benchmark/` | Token 编排基准测试 | ✅ 仅开发用 |
| 🔴 高 | `packages/typescript-edit-benchmark/` | TS 编辑基准测试 | ✅ 仅开发用 |
| 🔴 高 | `packages/bridge-client/` | 独立桥接客户端库 | ✅ 仅 bridge 模式需要 |
| 🟡 中 | `python/robogjc/` | Python 后端 worker | ✅ 可选 Python 服务 |
| 🟡 中 | `python/gjc-rpc/` | Python RPC 客户端 | ✅ 可选 |
| 🟡 中 | `packages/gajae-code/` | 顶层 npm 包 | 需调查用途 |
| 🟢 低 | `packages/stats/` | 本地可观测性仪表板 | 如果不用 `gjc stats` |

### 6.3 Rust 层

| 优先级 | 模块 | 功能 | 可移除? |
|--------|------|------|---------|
| ✅ 已移除 | `power.rs` | macOS 电源断言 (IOKit) | ✅ 已删除 |
| ✅ 已移除 | `appearance.rs` | macOS 外观检测 (CoreFoundation) | ✅ 已删除 |
| ✅ 已移除 | `windows.rs` (pi-shell) | Windows PATH 配置 | ✅ 已删除 |
| ✅ 已移除 | `winreg` crate | Windows 注册表访问 | ✅ 已从 workspace 移除 |
| ✅ 已移除 | pty/fs_cache/shell Windows `#[cfg]` 分支 | ConPTY/路径/PATH 合并 | ✅ 已简化 |
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
- `modes/bridge/`, `modes/rpc/`, `modes/shared/`, `modes/print-mode.ts`
- `stt/`, `memories/`, `memory-backend/`
- `exa/`, `ssh/`
- `dap/`, `debug/`, `autoresearch/`
- `tools/puppeteer/`, `tools/browser/`
- 两个 benchmark package
- `python/`

> 注: `modes/acp/` 和 `hindsight/` 已在第三、第四轮移除，不再列入。

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
- `packages/stats/`, `packages/bridge-client/`
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
- `packages/coding-agent/src/config/settings-schema.ts` — 所有配置项定义 (3031 行)
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
