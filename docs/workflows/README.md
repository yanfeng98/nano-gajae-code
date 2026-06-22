# 四大核心能力 · 源码导航

GJC（Gajae-Code）的四大核心能力形成一条完整的 AI 辅助开发流水线：

```
deep-interview → ralplan → ultragoal (执行+验证)
                        → team (tmux 并行 worker)
```

- **deep-interview**：将模糊的需求通过苏格拉底式追问转化为具体规格
- **ralplan**：在代码变更之前，三角色共识审查实施方案
- **ultragoal**：目标跟踪、修订、质量检查和完成证据的持久化执行
- **team**：为大型任务协调 tmux 支持的并行 worker

## 通用架构

每种能力都有三层代码：

| 层 | 作用 | 位置 |
|---|---|---|
| **SKILL.md** | Agent 行为定义（Prompt 工程，最核心） | `packages/coding-agent/src/defaults/gjc/skills/<name>/SKILL.md` |
| **Runtime** | 状态机、文件持久化、CLI 命令实现 | `packages/coding-agent/src/gjc-runtime/<name>-runtime.ts` |
| **Command** | CLI 入口（参数解析 → 调 runtime） | `packages/coding-agent/src/commands/<name>.ts` |

## 全局基础设施

四大能力共享的关键文件：

| 文件 | 作用 |
|------|------|
| `packages/coding-agent/src/gjc-runtime/state-writer.ts` | 所有 `.gjc/` 状态的原子写入（含审计日志） |
| `packages/coding-agent/src/gjc-runtime/state-runtime.ts` | 工作流间 `handoff` 交接 + 状态迁移 |
| `packages/coding-agent/src/skill-state/active-state.ts` | TUI HUD 中显示当前活跃 skill |
| `packages/coding-agent/src/skill-state/workflow-hud.ts` | 各 skill 的 HUD 摘要构建 |
| `packages/coding-agent/src/sdk.ts` | SDK 装配（加载 skill、注册工具、启动 agent loop） |
| `packages/coding-agent/src/cli.ts` | CLI 启动入口，注册所有命令 |
| `packages/coding-agent/src/defaults/gjc/skills/` | 所有 skill 的 SKILL.md + 内部 fragments |
| `AGENTS.md` | 项目级 Agent 契约，定义角色、规则、测试门 |

## 详细文档

### 源码分析（中文）

- [deep-interview](./deep-interview.md) — 苏格拉底式需求澄清
- [ralplan](./ralplan.md) — 三角色共识规划
- [ultragoal](./ultragoal.md) — 多目标持久化执行与验证
- [team](./team.md) — tmux 并行 Worker 编排

### SKILL.md 中文翻译（原封不动）

- [deep-interview SKILL.md 中文版](./deep-interview-zh.md)
- [ralplan SKILL.md 中文版](./ralplan-zh.md)
- [ultragoal SKILL.md 中文版](./ultragoal-zh.md)
- [team SKILL.md 中文版](./team-zh.md)

## 建议的阅读顺序

1. **先读 `AGENTS.md`** — 理解项目级的 Agent 契约和设计哲学
2. **读 4 个 SKILL.md** — 每个都是自包含的"操作系统"，定义了该能力的完整行为
3. **读 4 个 Runtime** — 理解状态机如何落地为文件系统操作
4. **读 `state-writer.ts` + `state-runtime.ts`** — 理解基础设施
5. **读 4 个 Command** — 确认 CLI 入口，通常很薄

SKILL.md 是真正的"源码"——Prompt 即代码。Runtime 是执行引擎。改行为先改 SKILL.md，改状态/持久化先改 Runtime。
