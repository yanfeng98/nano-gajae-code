<p align="center">
  <img src="assets/hero.png" alt="Gajae-Code 自主编程智能体主视觉图" width="100%" />
</p>

<h1 align="center">Gajae-Code</h1>

<p align="center">
  <strong>编码意图，解码软件。</strong><br />
  一个专注于面试评审、计划审查、tmux 原生执行和持久化验证的编程智能体运行器。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/gajae-code"><img alt="npm package" src="https://img.shields.io/npm/v/gajae-code?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-green?style=flat-square"></a>
  <a href="https://discord.gg/sj4exxQ9v"><img alt="Discord" src="https://img.shields.io/badge/Discord-join-5865F2?style=flat-square&logo=discord&logoColor=white"></a>
</p>

<p align="center">
  <img src="assets/character.png" alt="Gajae-Code 吉祥物角色" width="320" />
</p>

> Gajae-Code 是一个实验性的 Beta 阶段项目。可能存在粗糙之处，在用于重要工作前请务必验证输出结果。

## 什么是 Gajae-Code？

Gajae-Code（`gjc`）是一个外挂式编程智能体运行器。它在你选择的仓库或工作树中运行，并为智能体提供一个小而明确的工作流界面：

```text
deep-interview -> ralplan -> ultragoal
                         └─ 可选的团队执行（并行 tmux worker 提供协助）
```

它有意不作为 Codex CLI、Claude Code、OpenCode 或 Claw Code 的隐藏插件。当你需要结构化的计划、持久化的证据、tmux 支持的工作线程或隔离的工作树时，可以在这些工具旁边启动 `gjc`。

## 安装

```sh
bun install -g gajae-code
```

带作用域的包也可通过 `@gajae-code/coding-agent` 获取。

### Windows（原生安装）

在干净的 Windows 11 系统上，先安装 Bun，然后使用 Bun 的全局安装器安装 `gjc`：

```powershell
# 1. 安装 Bun
powershell -c "irm bun.sh/install.ps1|iex"

# 2. 重启终端以使 PATH 和 Bun 运行时刷新，然后确认 Bun
bun --version

# 3. 安装并验证 gjc
bun install -g gajae-code
gjc --version
gjc --smoke-test
```

`bun install -g` 会将 `gjc` 启动器放在 `%USERPROFILE%\.bun\bin` 目录中。该目录必须在 `PATH` 中才能使 `gjc` 被识别为命令。Bun 的安装器会自动添加该路径，但该更改仅对安装后启动的终端生效——如果 `gjc` 显示"无法识别"，请重启 PowerShell（或注销/重新登录）。

常见问题排查：

- **`gjc` 报告的是旧版 Bun 运行时。** 重新运行上述 Bun 安装器，重启终端，确认 `bun --version` 与 `gjc --version` 期望的版本一致。如果旧版 Bun 仍然优先，请确保 `%USERPROFILE%\.bun\bin` 在 `PATH` 中排在第一位，并删除任何覆盖它的旧 Bun 安装。
- **`gjc.exe` 存在但 `gjc` "无法识别"。** 启动器已安装但不在 `PATH` 中。确认 `%USERPROFILE%\.bun\bin` 已列在 `echo $env:Path` 的输出中，然后重启终端。

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

远程控制协议的详细信息请参见 [`docs/bridge.md`](docs/bridge.md)。

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
- **Rust 工具链**（编译原生模块需要），安装方式任选其一：
  - **Ubuntu/Debian（最快）：** `sudo apt install cargo rustc`
  - **官方 rustup：** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - **国内镜像加速：** `RUSTUP_DIST_SERVER=https://mirrors.ustc.edu.cn/rust-static RUSTUP_UPDATE_ROOT=https://mirrors.ustc.edu.cn/rust-static/rustup curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

如果 Bun 版本过低，请先升级：
```sh
bun upgrade
bun --version   # 确认 >= 1.3.14
```

### 可编辑安装（类似 pip install -e .）

有两种开发安装方式：

**方式一：完整开发安装（推荐）**

```sh
# 1. 构建原生模块（需要 Rust）
bun run build:native

# 2. 安装依赖 + 全局链接 + 安装默认技能文件
bun run install:dev
```

`install:dev` 会依次执行：
1. `bun install` — 安装所有工作区依赖
2. `bun link` — 将 `@gajae-code/coding-agent` 和 `@gajae-code/ai` 注册为全局 link
3. `setup defaults` — 安装默认工作流技能文件

之后 `gjc` 命令在终端全局可用，修改源码即时生效。

如果需要手动分步执行：

```sh
bun run build:native                          # 构建原生模块
bun install                                   # 安装依赖
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

**Python 包的可编辑安装：**

```sh
bun run robogjc:install   # 等价于 pip install -e 'python/robogjc[dev]'
```

### 运行测试

```sh
bun run test                                    # 全部测试（TS + Rust）
bun --cwd=packages/coding-agent test             # 只测 coding-agent
bun --cwd=packages/coding-agent test -- --only-failures  # 只重跑失败用例
bun run test:py                                  # Python 测试
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

## 贡献者

感谢帮助塑造 Gajae-Code 早期版本的个人和智能体，包括 [Yeachan-Heo](https://github.com/Yeachan-Heo)、[IYENTeam](https://github.com/IYENTeam) 和 [HaD0Yun](https://github.com/HaD0Yun)。欢迎通过 GitHub 和 Discord 社区提交贡献、Bug 报告和版本验证反馈。

## 灵感与渊源

Gajae-Code 的默认 TUI 标识是一对甲壳动物：深色外观用红钳，浅色外观用蓝蟹。它借鉴了一小部分智能体运行器的经验，同时将公开的 GJC 界面保持有意精简。历史归属记录保存在 [`NOTICE.md`](NOTICE.md) 中。

## 许可证

MIT。详见 [`LICENSE`](LICENSE)。
