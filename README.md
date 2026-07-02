<p align="center">
  <img src="assets/hero.png" alt="Gajae-Code 自主编程智能体主视觉图" width="100%" />
</p>

<h1 align="center">Gajae-Code</h1>

<p align="center">
  <strong>编码意图，解码软件。</strong><br />
  一个专注于面试评审、计划审查、tmux 原生执行和持久化验证的编程智能体运行器。
</p>

## 什么是 Gajae-Code？

Gajae-Code（`gjc`）是一个外挂式编程智能体运行器。它在你选择的仓库或工作树中运行，并为智能体提供一个小而明确的工作流界面：

```text
deep-interview -> ralplan -> ultragoal
                         └─ 可选的团队执行（并行 tmux worker 提供协助）
```

## 安装

```sh
bun install -g gajae-code
```

带作用域的包也可通过 `@gajae-code/coding-agent` 获取。


## 快速开始

```sh
# 在当前仓库中直接运行
gjc

# 使用 tmux 支持的 Leader 会话
gjc --tmux

# 为有风险或需要审查的工作使用隔离的工作树
gjc --tmux --worktree ../my-task-worktree
```

在 GJC 会话内部，使用公开的工作流界面：

```text
/skill:deep-interview 澄清模糊需求
/skill:ralplan 构建并审查实施计划
gjc ultragoal create-goals --brief-file <已批准的计划>
gjc ultragoal complete-goals
```

仅在协调的 tmux worker 能实际提供帮助时才使用 `gjc team ...`。

## 核心能力

- **先面谈再猜测**：`deep-interview` 将模糊的需求转化为具体的规格。
- **先计划再修改**：`ralplan` 在代码变更之前审查实施方案。
- **带证据执行**：`ultragoal` 跟踪目标、修订、检查和完成证据。
- **在有用时并行化**：`team` 为大型任务协调 tmux 支持的 worker。
- **保持外部化和可审查**：从选定的仓库或工作树运行，无需修补其他智能体运行时。

## 工作流界面

Gajae-Code 内置四个默认工作流技能：

| 技能             | 功能描述                                       |
| ---------------- | ---------------------------------------------- |
| `deep-interview` | 在计划或代码变更之前澄清模糊需求。              |
| `ralplan`        | 在修改之前构建并审查实施计划。                  |
| `ultragoal`      | 通过执行、修订、验证和证据全程跟踪目标。        |
| `team`           | 在值得并行执行时协调 tmux 支持的 worker。       |

以及四个内置角色智能体：

| 智能体     | 职能描述                               |
| ---------- | -------------------------------------- |
| `executor` | 有边界的实现、修复和重构。              |
| `architect`| 只读的架构和代码审查评估。              |
| `planner`  | 只读的排序和验收标准制定。              |
| `critic`   | 只读的计划批评和可操作性审查。          |

没有庞大的默认技能库：GJC 通过改进这一精简方法来实现进步。

## 与你现有的智能体工具配合使用

| 工具        | 推荐 GJC 命令                                  | 边界说明                                                |
| ----------- | ---------------------------------------------- | ------------------------------------------------------- |
| Codex CLI   | `gjc --tmux --worktree <path>` 或 `gjc`        | 外部运行器；从同一仓库/工作树同时运行两者。              |
| Claude Code | `gjc --tmux` 或 `gjc --tmux --worktree <path>` | GJC 不会成为 Claude Code 的扩展。                       |
| OpenCode    | `gjc` 或 `gjc --tmux`                          | 目前仅支持外部运行器工作流。                            |
| Claw Code   | `gjc --tmux --worktree <path>`                 | GJC 不会安装到 Claw Code 中或替代 Claw Code。           |

## 配置

提供方的重试配置位于 `~/.gjc/config.yml`：

```yaml
retry:
  requestMaxRetries: 4
  streamMaxRetries: 100
  maxRetries: 3
  maxDelayMs: 300000
```

`requestMaxRetries` 在建立流连接之前生效。`streamMaxRetries` 仅适用于可安全重放流数据的瞬时故障。无效认证、不支持的模型/提供方、格式错误的请求、上下文溢出、用户中止和永久配额故障仍然快速失败。

## TUI 标识

默认的深色 TUI 标识是 GJC 红钳主题，而浅色外观终端默认使用内置的蓝蟹主题。用户显式设置的主题始终优先。

## 开发

### 前置条件

- **Bun >= 1.3.14**（`gjc` 运行时会检查版本）
- **Rust 工具链 >= 1.85**（编译原生模块需要，需支持 `resolver = "3"` 和 `edition = "2024"`），安装：
  - **官方 rustup：** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - **清华镜像（国内加速）：** `export RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup RUSTUP_UPDATE_ROOT=https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - 不推荐 `apt install`（Ubuntu 仓库自带的版本过旧）

如果 Bun 版本过低，请先升级：
```sh
bun upgrade
bun --version   # 确认 >= 1.3.14
```

### 可编辑安装（类似 pip install -e .）

有两种开发安装方式：

**方式一：完整开发安装（推荐）**

```sh
# 1. 安装依赖（包括 @napi-rs/cli 等构建工具）
bun install

# 2. 构建原生模块（需要 Rust）
bun run build:native

# 3. 全局链接 + 安装默认技能文件
bun run link:dev
bun run install:defaults
```

或者一步到位：

```sh
bun install
bun run build:native
bun run install:dev
```

`install:dev` 会依次执行：
1. `bun link` — 将 `@gajae-code/coding-agent` 和 `@gajae-code/ai` 注册为全局 link
2. `setup defaults` — 安装默认工作流技能文件

之后 `gjc` 命令在终端全局可用，修改源码即时生效。

如果需要手动分步执行：

```sh
bun install                                   # 安装依赖
bun run build:native                          # 构建原生模块
bun --cwd=packages/coding-agent link          # 全局链接 coding-agent
bun --cwd=packages/ai link                    # 全局链接 ai
bun run install:defaults                      # 安装默认技能文件
```

**方式二：直接从源码运行（无需全局安装）**

```sh
bun install
bun run build:native
bun run dev          # 等价于 bun --cwd=packages/coding-agent src/cli.ts
```

TypeScript 源码直接运行，改完即生效，最接近 `pip install -e .` 的体验。

### 运行测试

```sh
bun run test                                    # 全部测试（TS + Rust）
bun --cwd=packages/coding-agent test             # 只测 coding-agent
bun --cwd=packages/coding-agent test -- --only-failures  # 只重跑失败用例
bun run ci:test:smoke                            # CI 冒烟测试
```

### 其他常用命令

```sh
bun run dev          # 从源码运行 TUI
bun run check        # 类型检查（TS + Rust）
bun run lint         # Lint 所有 TS
bun run fmt          # 格式化所有 TS
bun run build        # 构建所有包
bun run build:native # 构建原生 Rust 模块
```

### 构建自包含二进制（发布用）

`bun build --compile` 可将整个 CLI 打包为独立二进制文件。用户无需安装 Bun、Rust 或任何依赖，下载即可运行。

#### 本地构建（当前平台）

```sh
# 1. 构建原生模块
bun run build:native

# 2. 嵌入原生模块到 JS bundle
bun --cwd=packages/stats scripts/generate-client-bundle.ts --generate
bun --cwd=packages/natives run embed:native

# 3. 打包为独立二进制
bun run build    # 等于 bun --cwd=packages/coding-agent run build
```

产物在 `packages/coding-agent/dist/gjc`，单个文件约 200MB+（内嵌了 Bun 运行时 + 原生模块）。

#### 多平台发布构建

默认构建加密版，AES-256-GCM 保护源码，`linux-x64` 自动捆绑 glibc 2.35 兼容 CentOS 7。产物为自解压单文件，Ubuntu / CentOS 均可直接运行。

**推荐主机环境：**

- Debian / Ubuntu x86_64
- 已安装 Bun
- 已安装 Rust（推荐 `rustup`）
- 已执行 `bun install`

从一台全新的 Debian / Ubuntu x86_64 机器复现多平台发布构建，建议按下面顺序执行。

**1. 安装项目依赖**

```sh
bun install
```

**2. 准备 Rust 与交叉编译环境**

- 仅构建当前主机平台（`linux-x64`）：

```sh
rustup show
```

- 构建全部平台（`linux-x64` + `linux-arm64`）：

```sh
rustup target add aarch64-unknown-linux-gnu
sudo apt-get update
sudo apt-get install -y \
  gcc-aarch64-linux-gnu \
  g++-aarch64-linux-gnu \
  binutils-aarch64-linux-gnu \
  libc6-dev-arm64-cross
```

**3. 执行发布构建**

```sh
# 列出可用目标
bun run ci:release:build-binaries --list-targets

# 本地默认只构建宿主平台；CI 默认构建所有平台
bun run ci:release:build-binaries

# 本地强制构建所有平台
bun run ci:release:build-binaries:all

# 只构建指定平台
RELEASE_TARGETS=linux-x64 bun run ci:release:build-binaries
```

如需非加密构建：

```sh
RELEASE_TARGETS=linux-x64 bun run ci:release:build-binaries --no-encrypt
```

**4. 验证产物**

```sh
# linux-x64 产物
packages/coding-agent/binaries/gjc-linux-x64 --version
packages/coding-agent/binaries/gjc-linux-x64 --smoke-test

# 如已构建全平台，再确认 arm64 文件存在
ls -lh packages/coding-agent/binaries/gjc-linux-arm64
```

产物：`packages/coding-agent/binaries/gjc-linux-x64`（及 `gjc-linux-arm64`），单文件自解压格式。

支持的目标平台：

| 目标 ID | 说明 | CPU 基线 | CentOS 7 |
|---|---|---|---|
| `linux-x64` | Linux x86_64 | x86-64-v2 | 是（捆绑 glibc 2.35） |
| `linux-arm64` | Linux ARM64 | — | 否 |

Linux x64 使用 `x86-64-v2` 基线，兼容 2008 年后的 CPU；原生模块运行时自动解压到 `~/.gjc/natives/`。
如果缺少 ARM64 交叉工具链，`bun run ci:release:build-binaries:all` 会直接报错并提示安装命令，而不是跑到中途才失败。

**兼容性说明：**
- CI 在 **Ubuntu 22.04**（glibc 2.35）上构建
- `linux-x64` 产物自动捆绑 glibc 2.35，兼容 **Ubuntu 18.04+ / CentOS 7+ / Debian 10+**
- 非加密构建（`--no-encrypt`）产物要求 glibc >= 2.31（Ubuntu 20.04+、CentOS 8+）

### 项目结构

默认工作流定义位于源码而非已提交的 `.gjc` 副本中：

```text
packages/coding-agent/src/defaults/gjc/skills/<name>/SKILL.md
packages/coding-agent/src/prompts/agents/<role>.md
```

对于工作流定义或品牌界面相关的更改，请运行项目关卡脚本：

```sh
bun scripts/check-visible-definitions.ts
bun scripts/verify-g002-gates.ts
bun scripts/rebrand-inventory.ts --strict
bun test packages/coding-agent/test/default-gjc-definitions.test.ts
```

按包查看的项目地图请参见 [`docs/codebase-overview.md`](docs/codebase-overview.md)。

### 魔改指南：重点模块与文件

以下是按魔改目标分类的核心模块索引，帮助快速定位需要研究的代码。

#### 核心必读（无论改什么都得先看懂）

| 优先级 | 文件/模块 | 为什么重要 |
|---|---|---|
| **P0** | `packages/coding-agent/src/sdk.ts` | 整个 Agent 会话的组装工厂，所有组件在这里拼起来。理解它 = 理解系统骨架 |
| **P0** | `packages/coding-agent/src/main.ts` | CLI 参数 → 会话配置的转换层，入口逻辑 |
| **P0** | `packages/coding-agent/src/cli.ts` | 可执行入口，注册所有子命令，全局初始化 |
| **P0** | `packages/agent/src/agent.ts` | Agent 核心类，状态管理、prompt/continue/abort API |
| **P0** | `packages/agent/src/agent-loop.ts` | **主循环**：transform context → call model → execute tools → append results |

#### 1. 修改 Agent 行为/决策逻辑

| 重点文件 | 作用 |
|---|---|
| `packages/agent/src/agent-loop.ts` | 核心 turn loop，改这里 = 改 Agent 怎么思考和执行 |
| `packages/coding-agent/src/prompts/` | 系统提示词、角色提示词（executor/architect/planner/critic），改这里 = 改 Agent 的"人设" |
| `packages/coding-agent/src/defaults/` | 内置工作流技能（deep-interview/ralplan/ultragoal/team），改这里 = 改 Agent 的工作方法论 |
| `packages/coding-agent/src/session/` | 会话管理（创建/恢复/持久化），改这里 = 改 Agent 怎么记住上下文 |

#### 2. 增加/修改工具能力

| 重点文件 | 作用 |
|---|---|
| `packages/coding-agent/src/tools/` | **所有内置工具**（bash/read/write/edit/find/search/browser/eval/LSP/task/cron 等） |
| `packages/coding-agent/src/tools/index.ts` | 工具注册表，新增工具要在这里注册 |
| `packages/coding-agent/src/extensibility/` | 插件/扩展/自定义命令/自定义工具/slash commands 系统 |

#### 3. 更换/增加 LLM 提供商

| 重点文件 | 作用 |
|---|---|
| `packages/ai/src/providers/` | 各 LLM 提供商实现（Anthropic/OpenAI/...） |
| `packages/ai/src/stream.ts` | 流式响应调度，统一不同提供商的 streaming 事件 |
| `packages/ai/src/model-registry.ts` | 模型注册和解析 |
| `packages/coding-agent/src/config/` | 配置系统、模型选择、提示词模板 |

#### 4. 修改终端 UI

| 重点文件 | 作用 |
|---|---|
| `packages/tui/src/tui.ts` | TUI 框架核心，组件渲染、焦点管理、overlay |
| `packages/tui/src/components/` | 各类终端组件（text/input/editor/markdown/select/diff 等） |
| `packages/coding-agent/src/tui/` | TUI 模式的控制器，把 TUI 框架接入 Agent 会话 |

#### 5. 修改底层性能/原生能力

| 重点文件 | 作用 |
|---|---|
| `crates/pi-natives/src/lib.rs` | Rust N-API 入口，所有原生功能注册 |
| `crates/pi-shell/` | Shell 执行原语（持久/一次性/流式/PTY） |
| `crates/pi-ast/` | AST 操作 |
| `packages/natives/` | JS 侧原生加载器，平台/CPU 检测、版本校验 |

#### 6. 修改多 Agent 协作（Team 模式）

| 重点文件 | 作用 |
|---|---|
| `packages/coding-agent/src/commands/team.ts` | Team 子命令，并行 tmux worker 调度 |
| `packages/coding-agent/src/defaults/gjc/skills/team/SKILL.md` | Team 工作流的提示词/方法论 |

#### 建议学习路径

1. **先跑起来** → 在某个小项目里跑 `gjc`，体验完整流程（deep-interview → ralplan → ultragoal）
2. **读 `agent-loop.ts`** → 理解一个 turn 怎么运转的（这是所有魔改的核心）
3. **读 `sdk.ts`** → 理解所有组件怎么拼在一起
4. **读 `tools/` 下 3-5 个你感兴趣的工具** → 理解工具的接口约定
5. **读 `prompts/` 目录** → 理解系统提示词结构
6. **然后根据你的魔改目标，深入上面表格对应的模块**

### 使用 Claude Code 技能

GJC 支持从 `~/.claude/skills/`（用户级）和项目 `.claude/skills/`（项目级）发现 Claude Code 技能。

启用方式：

```sh
# 开启技能发现（总开关）
gjc config set skills.enabled true

# 允许 Claude 用户级技能（~/.claude/skills/）
gjc config set skills.enableClaudeUser true

# 允许 Claude 项目级技能（项目/.claude/skills/）
gjc config set skills.enableClaudeProject true
```

同样支持从 `.claude/commands/`、`.claude/hooks/`、`.claude/tools/`、`.claude/CLAUDE.md`、`.claude/SYSTEM.md`、`.claude/mcp.json` 发现命令、钩子、工具和配置。

验证设置：

```sh
gjc config get skills.enabled
gjc config get skills.enableClaudeUser
```
