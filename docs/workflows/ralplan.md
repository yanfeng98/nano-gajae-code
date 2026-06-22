# Ralplan（代码变更前审查实施方案）

## 核心机制

三角色共识循环 — Planner（出方案）→ Architect（架构审查）→ Critic（质量验证），最多 5 轮迭代直到 Critic 返回 `APPROVE`。

流水线位置：`deep-interview → ralplan → 待批准 → ultragoal (或 team)`

输出产物：`.gjc/plans/ralplan/<run-id>/stage-NN-<stage>.md`

## 核心角色

| 角色 | 职责 | 输出 |
|------|------|------|
| **Planner** | 创建初始方案 + RALPLAN-DR 摘要（Principles、Decision Drivers、Options） | `stage-01-planner.md` |
| **Architect** | 架构审查：提出最强的 Steelman 反题 + 至少一个真实权衡张力 | `stage-01-architect.md`，判决：`CLEAR`/`WATCH`/`BLOCK` + `APPROVE`/`COMMENT`/`REQUEST CHANGES` |
| **Critic** | 质量验证：原则-方案一致性、备选方案公平性、风险缓解、可测验收标准 | `stage-01-critic.md`，判决：`OKAY`/`ITERATE`/`REJECT` |

## Pre-Execution Gate

在 ultragoal/team 执行之前拦截模糊请求。检测到执行关键词（`team`/`ultragoal`）+ 欠具体 prompt 时，重定向到 ralplan 先规划。

**通过 Gate**（足够具体）的例子：
- `team fix the null check in src/hooks/bridge.ts:326`（有文件路径）
- `team implement issue #42`（有 Issue 编号）
- `team fix processKeywordDetector`（有符号名）

**被 Gate 拦截**（需要先规划）的例子：
- `team fix this`
- `team improve performance`
- `team add authentication`

强制绕过：前缀 `force:` 或 `!`

## 重点文件（按优先级）

### ★★★ SKILL.md（核心 Prompt 定义）

**文件**：`packages/coding-agent/src/defaults/gjc/skills/ralplan/SKILL.md`（192 行）

关键段落：

| 段落 | 行号 | 内容 |
|------|------|------|
| 共识循环 | L56-79 | Planner → 用户反馈（可选）→ Architect → Critic → 重审循环（最多 5 次） |
| RALPLAN-DR 摘要 | L59-62 | Principles(3-5) / Decision Drivers(top 3) / Viable Options(≥2) |
| Artifact 写入协议 | L42-51 | `gjc ralplan --write --stage <type> --stage_n <N> --artifact "..."` |
| Receipt-Only 准则 | L52 | 角色 Agent 只返回 receipt，不重复完整 markdown |
| Persisted Planner | L93-118 | Planner 同会话持久化，重审时 resume 而非重 spawn |
| 恢复路由表 | L102-107 | running→steer / queued→await / context_unavailable→fresh spawn |
| Pre-Execution Gate | L120-191 | 拦截规则、信号类型表、端到端流程示例 |
| 规划/执行边界 | L38-39 | 规划模块禁止在批准前执行变更 |
| Handoff 协议 | L81-87 | `gjc state ralplan handoff --to <ultragoal|team>` |

### ★★☆ Runtime

**文件**：`packages/coding-agent/src/gjc-runtime/ralplan-runtime.ts`（655 行）

关键函数：

| 函数 | 行号 | 作用 |
|------|------|------|
| `isRalplanArtifactWriteInvocation` | L92-94 | 判断是否为 `--write` 调用 |
| `resolveArtifactArgs` | L354-383 | 解析 stage/stageN/artifact/runId |
| `persistArtifact` | L395-438 | 写入 `.gjc/plans/ralplan/<run-id>/stage-NN-<stage>.md` |
| `applyPlannerStateUpdate` | L327-352 | 记录 Persisted Planner 元数据 |
| `parsePlannerStateArgs` | L244-308 | 解析 `--planner-id`/`--planner-resumable`/`--fallback-*` |
| `seedRalplanState` | L566-607 | 写入 `.gjc/state/ralplan-state.json` |
| `handleConsensusHandoff` | L609-642 | 处理共识握手（非 `--write` 路径） |
| `persistActiveRunId` | L183-206 | 维护活跃 run_id |

### ★☆☆ Command

**文件**：`packages/coding-agent/src/commands/ralplan.ts`

### ★★☆ 配套文件

| 文件 | 作用 |
|------|------|
| `src/gjc-runtime/state-runtime.ts` | 工作流间 `handoff` 命令实现 |
| `src/gjc-runtime/restricted-role-agent-bash.ts` | 受限角色 Agent 的 Bash 环境检测 |
| `src/gjc-runtime/cli-write-receipt.ts` | CLI 写入收据渲染 |
| `src/gjc-runtime/state-migrations.ts` | 工作流状态迁移（兼容旧版本） |

## 魔改切入点

| 想改什么 | 改哪里 |
|----------|--------|
| 三角色循环逻辑 | `SKILL.md` L56-79 |
| Pre-Execution Gate 规则 | `SKILL.md` L132-168（信号类型表） |
| 加新的审查维度到 Architect/Critic | `SKILL.md` L65-68 |
| 改 Artifact 存储路径/格式 | `ralplan-runtime.ts` L395-438 |
| 支持新的 `--architect`/`--critic` provider | `ralplan-runtime.ts` L40-41（`KNOWN_ARCHITECT_KINDS`/`KNOWN_CRITIC_KINDS`） |
| 改 Persisted Planner 恢复策略 | `SKILL.md` L102-107（路由表） |
| 改 Deliberate 模式触发条件 | `SKILL.md` L23（`--deliberate` flag + 自动检测高风险关键词） |
| 改最大迭代次数 | `SKILL.md` L75（`max 5 iterations`） |

## 数据流

```
用户输入 task / deep-interview spec
  → 种子状态 .gjc/state/ralplan-state.json
  → Step 1: Planner 创建方案 + RALPLAN-DR 摘要
    → 持久化到 .gjc/plans/ralplan/<run-id>/stage-01-planner.md
  → Step 2: (--interactive) 用户反馈
  → Step 3: Architect 审查 → stage-01-architect.md
  → Step 4: Critic 验证 → stage-01-critic.md
  → Step 5: 如果 !APPROVE → 恢复同一个 Planner → 修订 → 回到 Step 3
    → 最多 5 轮
  → Step 6: Critic APPROVE → stage-NN-final.md + pending-approval.md
  → Step 7: (--interactive) 用户批准执行路径
  → Handoff 到 ultragoal（默认）或 team
```
