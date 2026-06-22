---
name: ralplan
description: 共识规划入口点，在执行前自动门控模糊的 team/ultragoal 请求
argument-hint: "[--interactive] [--deliberate] [--architect openai-code] [--critic openai-code] <任务描述>"
level: 4

source: "forked from upstream ralplan skill and rebranded for GJC"
---

# Ralplan（共识规划别名）

Ralplan 是共识规划工作流。它触发 Planner、Architect 和 Critic agent 的迭代规划，直到达成共识，配合 **RALPLAN-DR 结构化审议**（默认短模式，高风险工作使用 deliberate 模式）。

## 用法

```
/skill:ralplan "任务描述"
```

## 标志

- `--interactive`：在关键决策点启用用户提示（步骤 2 的草案审查和步骤 6 的最终批准）。没有此标志，工作流完全自动化运行 — Planner → Architect → Critic 循环 — 将最终计划标记为 `待批准`，输出它，并在不请求确认或执行更改的情况下停止。
- `--deliberate`：对高风险工作强制使用 deliberate 模式。添加预 mortem（3 个场景）和扩展测试规划（单元/集成/e2e/可观测性）。没有此标志，当请求明确发出高风险信号时（认证/安全、迁移、破坏性更改、生产事件、合规/PII、公共 API 破坏），deliberate 模式仍可自动启用。
- `--architect openai-code`：当 OpenAI code CLI 可用时，为 Architect 通道使用 OpenAI code。否则，简要说明回退并保持默认的 GJC Architect 审查。
- `--critic openai-code`：当 OpenAI code CLI 可用时，为 Critic 通道使用 OpenAI code。否则，简要说明回退并保持默认的 GJC Critic 审查。
- `--write --stage <type> --stage_n <N> --artifact <markdown 文件路径或 markdown 字符串>`：原生工件写入路径，在 `.gjc/plans/ralplan/<run-id>/` 下持久化 Planner、Architect、Critic、修订、ADR 和最终待批准计划 markdown。使用此而不是直接编辑 `.gjc/` 文件。

## 交互模式用法

```
/skill:ralplan --interactive "任务描述"
```

## 行为

## 规划/执行边界

Ralplan 是一个规划模块。它可以检查上下文并起草或更新计划/spec/提案工件，但必须将这些工件标记为 `待批准`，除非用户在当前轮次或通过结构化批准 UI 明确选择了执行。在明确的执行批准之前，它不得运行变更导向的 shell 命令、编辑源文件、提交、推送、打开 PR、调用执行 skill 或委托实现任务。

规划工件和阶段交接必须通过 ralplan CLI 工件写入器持久化，而不是通过直接的 `.gjc/` 编辑。每个生成持久阶段工件的角色 agent 或子 agent 必须使用以下命令写入：

```bash
gjc ralplan --write --stage <type> --stage_n <N> --artifact "markdown 文件路径或 markdown 字符串"
```

使用与生产者或工件类型匹配的阶段值，如 `planner`、`architect`、`critic`、`revision`、`adr` 或 `final`。每次共识循环遍历递增 `--stage_n`。`--artifact` 值可以是在 `.gjc/` 之外准备的 markdown 文件路径以供摄取，也可以是 markdown 内容字符串本身。原生 `--write` 处理程序在 `.gjc/plans/ralplan/<run-id>/stage-<NN>-<stage>.md` 下持久化 markdown，维护 `index.jsonl` 审计日志，并且对于 `final` 阶段额外写入 `pending-approval.md` 副本。除非显式强制覆盖处于活动状态，否则禁止对 `.gjc/specs`、`.gjc/plans`、`.gjc/state` 或任何其他 `.gjc/` 路径直接使用 `write`、`edit` 或 `ast_edit` 调用。

受限制的只读角色 agent（`planner`、`architect` 和 `critic`）必须直接在 `--artifact` 中传递 markdown 内容；其受限的 bash 环境有意禁用工件文件路径摄取，以便判决命令无法持久化任意文件内容。

在角色 agent 持久化阶段工件之后，其面向模型的响应给调用者应该仅为收据：返回 `gjc ralplan --write --json` 收据（`run_id`、`path`、`stage`、`stage_n`、`sha256`、`created_at`）加上调用者路由所需的最小判决/状态字段，并且**不要**将完整的持久化 markdown 粘贴回父对话。下游审查者应接收工件路径/收据，并在实际需要正文时自行读取持久化文件。这保留了审计跟踪，同时防止 Planner/Architect/Critic 判决正文被重复到主 agent 上下文中。

仅收据准则：角色 agent（`planner`、`architect` 和 `critic`）通过 `gjc ralplan --write` 持久化持久输出，并仅返回收据字段（`run_id`、`path`、`sha256`）加上判决/状态路由字段；在可用时包括 `stage` 和 `stage_n`，且永远不要返回完整的持久化正文。

此 skill 以共识模式运行所提供的参数的 GJC 规划。

共识工作流：
1. **Planner** 创建初始计划，并在审查前生成紧凑的 **RALPLAN-DR 摘要**。每个运行作为分离的、可恢复的子 agent 启动 Planner 一次（在 Architect 之前等待它）并记录其返回的子 agent id 作为运行的持久化 Planner id；使用 `gjc ralplan --write --stage planner --stage_n 1 --artifact "..." --planner-id <id> --planner-resumable <true|false>` 持久化该阶段（见下面的**持久化 Planner**）：
   - 持久化后，仅返回收据/路径加紧凑的规划状态；除非明确请求，否则不要将完整计划 markdown 粘贴回调用者。
   - 原则（3-5 条）
   - 决策驱动因素（前 3 个）
   - 可行选项（>=2 个）带有有界的优缺点
   - 如果仅剩一个可行选项，则明确说明排除替代方案的理由
   - 仅 deliberate 模式：预 mortem（3 个场景）+ 扩展测试计划（单元/集成/e2e/可观测性）
2. **用户反馈** *（仅 --interactive）*：如果设置了 `--interactive`，使用 `ask` 工具在审查前呈现草案计划**加上原则/驱动因素/选项摘要**（继续审查 / 请求更改 / 跳过审查）。否则，自动继续审查。
3. **Architect** 审查架构合理性，必须提供最强的 Steelman 反题、至少一个真实的权衡张力，以及（在可能时）综合 — **在步骤 4 之前等待完成**。在 deliberate 模式中，Architect 应明确标记原则违反。
   - Architect agent/子 agent 必须使用 `gjc ralplan --write --stage architect --stage_n <N> --artifact "..." --json` 持久化其审查，然后返回收据/路径加紧凑的判决/状态（`CLEAR`/`WATCH`/`BLOCK`、`APPROVE`/`COMMENT`/`REQUEST CHANGES`），而不是粘贴完整的审查正文。
4. **Critic** 根据质量标准评估 — 仅在步骤 3 完成后运行。Critic 必须强制执行原则-选项一致性、公平的替代方案、风险缓解清晰度、可测试的验收标准和具体的验证步骤。在 deliberate 模式中，Critic 必须拒绝缺失/薄弱的预 mortem 或扩展测试计划。
   - Critic agent/子 agent 必须使用 `gjc ralplan --write --stage critic --stage_n <N> --artifact "..." --json` 持久化其评估，然后返回收据/路径加紧凑的判决/状态（`OKAY`/`ITERATE`/`REJECT`），而不是粘贴完整的评估正文。
5. **重新审查循环**（最多 5 次迭代）：任何非 `APPROVE` 的 Critic 判决（`ITERATE` 或 `REJECT`）必须运行相同的完整闭环：
   a. 收集 Architect + Critic 反馈
   b. 通过恢复同一个持久化 Planner 子 agent 并整合 Architect + Critic 反馈来修订计划（见下面的**持久化 Planner**）；仅按回退路由表回退到新的 Planner 生成
   c. 返回 Architect 审查
      - 在重新审查之前使用 `gjc ralplan --write --stage revision --stage_n <N> --artifact "..." --json` 持久化每个 Planner 修订，然后向前传递收据/路径，而不是在父对话中重复完整的修订 markdown。
   d. 返回 Critic 评估
   e. 重复此循环直到 Critic 返回 `APPROVE` 或达到 5 次迭代
   f. 如果达到 5 次迭代而没有 `APPROVE`，向用户呈现最佳版本
6. 在 Critic 批准时，将计划标记为 `待批准`，除非明确的执行批准已经被捕获，通过 `gjc ralplan --write --stage final --stage_n <N> --artifact "..."` 持久化 ADR/最终计划，并且不直接编辑 `.gjc/plans`。*（仅 --interactive）* 如果设置了 `--interactive`，使用 `ask` 工具呈现计划及批准选项（批准通过 ultragoal 执行（推荐）/ 批准通过 team 执行（仅当需要基于 tmux 的交互式 worker 并行化时）/ 压缩后返回等待执行批准 / 请求更改 / 拒绝）。最终计划必须包括 ADR（决策、驱动因素、考虑的替代方案、为什么选择、后果、后续事项）。否则，输出最终计划并在任何变更或委托之前停止。
7. *（仅 --interactive）* 用户选择：批准 ultragoal 执行（推荐）、批准 team 执行（仅 tmux 并行化）、请求更改或拒绝
8. *（仅 --interactive）* 批准后：默认调用 `/skill:ultragoal` 执行；仅当用户明确需要基于 tmux 的交互式 worker 并行化时调用 `/skill:team` — 永远不要直接实现

   在调用 `/skill:team` 或 `/skill:ultragoal` 之前，标记 ralplan 就绪以便交接，使 skill 工具的链守卫允许过渡：

   ```
   gjc state ralplan write --input '{"current_phase":"handoff"}' --json
   ```

   skill 工具随后在同一轮次分派执行 skill 并在进程中运行 `gjc state ralplan handoff --to <team|ultragoal> --json` 以原子方式降级 ralplan、提升被调用者，并同步两个 `skill-active-state.json` 文件。你不需要自己运行交接动词。

> **重要：** 步骤 3 和 4 必须按顺序运行。不要在同一并行批次中发出两个 agent Task 调用。在发出 Critic Task 之前始终等待 Architect 结果。

遵循 Plan skill 的完整文档以获取共识模式详情。

### 持久化 Planner（共识循环）

Planner 是一个**同会话持久化子 agent**：作为分离的 agent 启动一次，在 Architect 之前等待，然后在每次重新审查时**恢复**并整合 Architect + Critic 反馈，而不是被重新生成。Architect 和 Critic 保持**每次新鲜的、独立的生成**，以便其判决可以仅从其该轮次的工件中复现。不要修改子 agent 控制界面；此编排仅使用现有的 `subagent` 恢复/引导控件。

**持久化边界：** 这仅是同一父会话、活跃会话连续性。可恢复性取决于内存中的子 agent 记录（以及持久化的父会话 — 内存中的父会话产生 `resumable:false`），而不仅仅是会话文件。`.gjc` 运行状态记录是审计/路由提示，而不是持久的跨进程子 agent 注册表。在进程重启、缺失记录或任何不可用/失败的恢复之后，使用新鲜的 Planner 回退。

**恢复路由表**（每次重新审查，当恢复持久化的 Planner id 时）：

| 恢复结果 | 动作 |
|---|---|
| `running` | `steer`/注入整合反馈到同一 id，然后等待 — 不要新鲜生成 |
| `queued` | 保留/更新排队消息或等待同一 id — 不要仅因为排队而新鲜生成 |
| `context_unavailable`、`not_found`、`no_runner`、`resume_failed` | 为该轮次新鲜生成 Planner；记录回退元数据 |
| 终端（`completed`/`failed`/`cancelled`）+ 修订消息 | 当上下文可用时恢复同一 id；否则使用上面的新鲜回退 |

**记录持久化 Planner 元数据**（仅审计/路由 — 永远不要声称 `subagent list` 证明了可恢复性，因为快照不暴露 `resumable`）。将这些可选标志搭载在该轮次的 planner/revision 阶段的正常 `--write` 上：

```
gjc ralplan --write --stage revision --stage_n <N> --artifact "..." \
  --planner-id <id> --planner-resumable <true|false> \
  --fallback-reason <context_unavailable|not_found|no_runner|resume_failed|process_restart|missing_record> \
  --fallback-attempted-id <id> --fallback-stage-n <N> \
  --fallback-receipt-path <新鲜 planner 阶段工件路径> --json
```

仅当父会话可证明持久时设置 `--planner-resumable true`；在观察到 `context_unavailable` 后设置/记录 `false`；否则省略它（未知）。回退标志仅在实际发生新鲜生成回退时记录：回退记录需要 `--fallback-reason` **与** `--fallback-attempted-id` 和 `--fallback-stage-n`（失败的 id 及其失败的轮次），而 `--fallback-receipt-path`（新鲜 Planner 的阶段工件）是可选的。

## 预执行门

### 门为什么存在

执行 skill（`ultragoal` 和 `team`）驱动实现而非范围发现。当以模糊请求启动时，如"team improve the app"，agent 没有明确的目标 — 它们在应该发生在规划阶段的范围发现上浪费周期，通常交付部分或不一致的工作，需要返工。

ralplan-first 门拦截规格不足的执行请求，并将其重定向通过 ralplan 共识规划工作流。这确保：
- **明确的范围**：PRD 定义了确切要构建的内容
- **测试规格**：验收标准在代码编写之前已经是可测试的
- **共识**：Planner、Architect 和 Critic 就方法达成一致
- **不浪费执行**：Agent 以清晰、有界的任务开始

### 好 vs 坏 Prompt

**通过门**（足够具体可直接执行）：
- `team fix the null check in src/hooks/bridge.ts:326`
- `team implement issue #42`
- `team add validation to function processKeywordDetector`
- `team do:\n1. Add input validation\n2. Write tests\n3. Update README`
- `team add the user model in src/models/user.ts`

**被门控 — 重定向到 ralplan**（需要先确定范围）：
- `team fix this`
- `team build the app`
- `team improve performance`
- `team add authentication`
- `team make it better`

**绕过门**（当你知道你想要什么）：
- `force: team refactor the auth module`
- `! team optimize everything`

### 门何时不触发

当检测到**任何**具体信号时，门自动通过。你不需要全部 — 一个就够了：

| 信号类型 | 示例 prompt | 为什么通过 |
|---|---|---|
| 文件路径 | `team fix src/hooks/bridge.ts` | 引用特定文件 |
| Issue/PR 编号 | `team implement #42` | 有具体的工作项 |
| camelCase 符号 | `team fix processKeywordDetector` | 命名特定函数 |
| PascalCase 符号 | `team update UserModel` | 命名特定类 |
| snake_case 符号 | `team fix user_model` | 命名特定标识符 |
| 测试运行器 | `team npm test && fix failures` | 有明确的测试目标 |
| 编号步骤 | `team do:\n1. Add X\n2. Test Y` | 结构化交付物 |
| 验收标准 | `team add login - acceptance criteria: ...` | 明确的成功定义 |
| 错误引用 | `team fix TypeError in auth` | 要解决的具体错误 |
| 代码块 | `team add: \`\`\`ts ... \`\`\`` | 提供了具体代码 |
| 转义前缀 | `force: team do it` 或 `! team do it` | 明确的用户覆盖 |

### 端到端流程示例

1. 用户输入：`team add user authentication`
2. 门检测到：执行关键词（`team`）+ 规格不足的 prompt（无文件、函数或测试规格）
3. 门重定向到 **ralplan** 并显示解释重定向的消息
4. Ralplan 共识运行：
   - **Planner** 创建初始计划（哪些文件、什么认证方法、什么测试）
   - **Architect** 审查合理性
   - **Critic** 验证质量和可测试性
5. 共识批准后，用户选择执行路径：
   - **ultragoal**：目标跟踪的自主执行与验证（推荐默认）
   - **team**：N 个协调的并行 agent 在 tmux 中 — 仅当需要基于 tmux 的交互式 worker 并行化时
6. 执行以清晰、有界的计划开始

### 故障排除

| 问题 | 解决方案 |
|-------|----------|
| 门在规格良好的 prompt 上触发 | 添加文件引用、函数名或 issue 编号来锚定请求 |
| 想要绕过门 | 前缀加 `force:` 或 `!`（例如 `force: team fix it`） |
| 门在模糊 prompt 上不触发 | 门仅捕获具有 <=15 个有效词且无具体锚点的 prompt；添加更多细节或显式使用 `/skill:ralplan` |
| 重定向到 ralplan 但想要执行 | 使用结构化批准选项或明确说明哪个执行 skill 应该继续；单独的 `just do it` / `skip planning` 仅以 `待批准` 工件结束规划 |
