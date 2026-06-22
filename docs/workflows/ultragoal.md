# Ultragoal（目标跟踪、修订、检查和完成证据）

## 核心机制

将 Brief 拆成 G001, G002, ... 多个 Story，逐个执行 + 5 道质量门检查 + 写入 `ledger.jsonl` 审计日志。支持运行时动态 Steering（增删改故事）。

流水线位置：`ralplan → ultragoal`（或直接 `deep-interview → ultragoal`，仅简单场景）

输出产物：
- `.gjc/ultragoal/brief.md`
- `.gjc/ultragoal/goals.json`
- `.gjc/ultragoal/ledger.jsonl`

## Goal 模式

| 模式 | 说明 |
|------|------|
| **aggregate**（默认） | 一个 GJC aggregate goal 覆盖整个 plan，中间 Story 不再创建/完成 GJC goal |
| **per-story** | 每个 Story 一个独立 GJC goal 上下文 |

## 质量门（5 道）

每个 Story 完成前必须通过：

1. **ai-slop-cleaner** — 只读检测器，扫描变更文件的代码质量问题（死代码、重复、过度抽象、边界违规等），BLOCKING 发现是完成阻断项
2. **验证重跑** — cleaner 修复后重新验证
3. **Architect 审查**（三通道）：
   - architecture-side：系统边界、分层、数据/控制流、运维风险
   - product-side：用户可见行为、验收标准、边界情况、回归
   - code-side：可维护性、测试、集成点、不安全捷径
4. **Executor QA/红队** — 尝试破坏变更（不是只确认 happy path），需要真实界面证据（浏览器截图 / CLI 日志 / API 黑盒测试）
5. **最终代码审查** — 合并到质量门 JSON

全部通过（所有 status=`CLEAR`/`passed`，blockers 为空）才能 checkpoint complete。

## 动态 Steering

运行时允许 6 种变更（需明确证据和理由）：

| Kind | 说明 |
|------|------|
| `add_subgoal` | 添加新的子目标 |
| `split_subgoal` | 拆分现有子目标 |
| `reorder_pending` | 重排待执行目标顺序 |
| `revise_pending_wording` | 修改待执行目标措辞 |
| `annotate_ledger` | 向审计日志添加注释 |
| `mark_blocked_superseded` | 标记受阻目标为已取代 |

## 重点文件（按优先级）

### ★★★ SKILL.md（核心 Prompt 定义）

**文件**：`packages/coding-agent/src/defaults/gjc/skills/ultragoal/SKILL.md`（328 行）

关键段落：

| 段落 | 行号 | 内容 |
|------|------|------|
| Goal 创建协议 | L51-84 | `@goal:` 分隔符语法，preamble 为全局上下文，支持多 Story |
| 完成循环 | L86-105 | 逐 Story 执行、checkpoint、final aggregate receipt |
| 质量门 JSON Schema | L209-301 | 完整的 `--quality-gate-json` 结构（architectReview + executorQa + iteration） |
| 动态 Steering | L106-138 | 6 种允许的变更类型 + CLI 示例 |
| ai-slop-cleaner 集成 | L173-179 | 内部 skill fragment 加载规范 |
| 完成清理 + 审查门 | L182-206 | 10 步质量门流程 |
| Goal 工具调用 | L38-47 | `goal({"op":"get"})` / `create` / `complete` / `drop` / `resume` |
| Ultragoal + Team 桥接 | L159-169 | Leader 拥有 Ultragoal，Team 提供执行证据 |
| Handoff 回规划 | L309-316 | `gjc state ultragoal handoff --to <ralplan|deep-interview>` |

### ★★★ Runtime

**文件**：`packages/coding-agent/src/gjc-runtime/ultragoal-runtime.ts`

关键数据结构：

```typescript
interface UltragoalGoal {
  id: string;           // G001, G002, ...
  title: string;
  objective: string;
  status: "pending" | "active" | "complete" | "failed" | "blocked" | "review_blocked" | "superseded";
  createdAt/updatedAt/startedAt/completedAt: string;
  evidence?: string;
  steering?: Record<string, unknown>;
  completionVerification?: UltragoalCompletionVerification; // 收据
}

interface UltragoalPlan {
  version: 1;
  brief: string;
  gjcGoalMode: "aggregate" | "per-story";
  gjcObjective: string;        // 稳定的指针式 aggregate objective
  gjcObjectiveAliases?: string[];
  goals: UltragoalGoal[];
}
```

关键函数：`create-goals`、`complete-goals`、`checkpoint`、`steer`、`record-review-blockers`、`status` 的所有实现。

### ★★☆ Goal Mode 运行时

**文件**：`packages/coding-agent/src/goals/runtime.ts`

Agent 内 goal 工具的实现：
- `goal({"op":"get"})` — 获取当前活跃 goal 快照
- `goal({"op":"create","objective":"..."})` — 创建新 goal 并进入 goal mode
- `goal({"op":"complete"})` — 完成当前 goal
- `goal({"op":"drop"})` — 清除活跃 goal（不退出 goal mode）
- `goal({"op":"resume"})` — 恢复暂停的 goal

**文件**：`packages/coding-agent/src/goals/state.ts` — Goal 状态数据结构

### ★★☆ ai-slop-cleaner Fragment

**文件**：`packages/coding-agent/src/defaults/gjc/skills/ultragoal/ai-slop-cleaner.md`

内部 skill fragment（`kind: "skill-fragment"`），只读检测器：
- 检测分类：fallback-like masking vs. grounded、重复、死代码、不必要抽象、边界违规、UI/设计 slop、缺失测试
- 每个发现标记为 BLOCKING 或 advisory
- 递归守卫：不能嵌套 spawn ralplan/team/deep-interview/ultragoal

### ★☆☆ Command

**文件**：`packages/coding-agent/src/commands/ultragoal.ts`（40 行）

## 魔改切入点

| 想改什么 | 改哪里 |
|----------|--------|
| 质量门的检查项 / Schema | `SKILL.md` L209-301（`--quality-gate-json` schema） |
| Goal 创建/分隔语法 | `SKILL.md` L51-84（`@goal:` 分隔符） |
| 加新的 Steering 操作类型 | `SKILL.md` L110-117 + `ultragoal-runtime.ts` 中的 steer handler |
| 改 ai-slop-cleaner 检测分类 | `ai-slop-cleaner.md` |
| 改完成验证逻辑 | `ultragoal-runtime.ts` 中的 checkpoint handler |
| 改 aggregate objective 指针策略 | `SKILL.md` L14（migration from legacy enumerated objective） |
| 改 Goal 工具行为 | `goals/runtime.ts` |
| 改 Freshness 收据策略 | `SKILL.md` L303-306 |

## 数据流

```
Brief / ralplan plan
  → create-goals: brief → goals.json (G001, G002, ...)
  → complete-goals 循环:
    → goal({"op":"get"}) / goal({"op":"create"})
    → 执行当前 Story
    → ai-slop-cleaner（只读检测 → executor 修复 → 重跑直到 0 BLOCKING）
    → 验证重跑
    → Architect 审查（三通道）
    → Executor QA/红队（真实界面证据）
    → 最终代码审查
    → 全部通过 → checkpoint --status complete --quality-gate-json ...
    → 下一个 Story 或 All complete
  → 最终 aggregate receipt → goal({"op":"complete"})
  → 所有事件写入 ledger.jsonl
```
