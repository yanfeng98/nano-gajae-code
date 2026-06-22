---
name: team
description: 多 worker GJC tmux 团队编排

source: "forked from upstream team skill and rebranded for GJC"
---

# Team Skill

`$team` 是 GJC 的基于 tmux 的多 worker 执行模式。它通过分割当前 tmux 领导者窗口启动真实的 GJC worker CLI 会话，并通过 `.gjc/state/team/...` 文件加 CLI team 互操作（`gjc team api ...`）和状态文件协调它们。

此 skill 在操作上是敏感的。将其视为操作员工作流，而非通用 prompt 模式。在 GJC App 或纯外部 tmux 会话中，不要将 `$team` / `gjc team` 呈现为直接可用；先从 shell 启动 GJC CLI，或保持在最近的 app 安全界面上，直到用户明确想要 tmux 运行时。

## Team vs 原生子 Agent

- 使用 **GJC 原生子 agent** 进行有界的会话内并行，其中一个领导者线程可以扇出几个独立的子任务并直接等待它们。
- 使用 **`gjc team`** 当需要持久可见的 tmux worker、共享任务状态、worker 邮箱文件、worktree、显式生命周期控制或必须在一个本地推理突发之外存活的长时间执行时。
- 原生子 agent 可以补充 team 执行，但它们**不**替换 tmux team 运行时的有状态协调契约。

## 此 Skill 必须做什么

## GPT-5.5 指南对齐

使用共享的工作流指南模式：结果优先框架、多步工作的简洁可见更新、活跃工作流分支的本地覆盖、与风险成比例的验证、显式停止规则，以及安全可逆步骤的自动继续。仅对实质性、破坏性、凭据性的、外部生产或偏好依赖的分支提问。

当用户触发 `$team` 时，agent 必须：

1. 直接使用 `gjc team ...` 调用 GJC 运行时
2. 避免用进程内 `spawn_agent` 扇出替换流程
3. 验证启动并呈现具体的状态/窗格证据
4. 如果活跃 team 模式状态缺失，在继续之前从规范 team 运行时状态初始化/同步它
5. 保持 team 状态活跃直到 worker 终端（除非显式中止）
6. 在需要时处理清理和陈旧窗格恢复

如果 `gjc team` 不可用，以硬错误停止。

## 调用契约

```bash
gjc team [N:agent-type] "<任务描述>"
```

示例：

```bash
gjc team 3:executor "分析功能 X 并报告缺陷"
gjc team "调试不稳定的集成测试"
gjc team "交付端到端修复及验证"
```

### Team-first 启动契约

`gjc team ...` 现在是协调执行的规范启动路径。
Team 模式应携带可见的 worker 交付/验证通道，而无需
预先要求单独的链接执行循环。GJC team 支持当前窗口多 worker 模式；显式 `N:agent-type` 值选择 worker 数量和共享角色。

- **规范启动：** 使用纯 `gjc team ...` / `$team ...` 进行协调的 worker。
- **验证所有权：** 保持一个通道专注于测试、回归覆盖和关闭前的证据。
- **类型化通道：** 将交付、验证、架构或专家工作建模为任务 `lane` 元数据加 `required_role` / `allowed_roles`；认领强制执行所有者、角色、依赖和租约顺序。
- **升级：** 仅在后续手动工作仍需要持久的单所有者修复/验证循环时使用新的显式后续任务。
- **弃用：** 嵌套的 team 执行命令已移除。使用纯 `gjc team ...` 进行协调执行。

### Team + Ultragoal 桥接

使用 `$ultragoal` 进行持久领导者拥有的目标/账本追踪，使用 `$team` 进行并行可见的 tmux 执行通道。当 Team 在活跃的 `.gjc/ultragoal/goals.json` 下启动时，worker 任务/状态上下文可能包括领导者拥有的 Ultragoal 上下文：`.gjc/ultragoal/goals.json`、`.gjc/ultragoal/ledger.jsonl`、活跃目标 id、GJC 目标模式以及 `fresh_leader_goal_get_required` 检查点策略。

Worker 仅提供任务状态和验证证据。它们不拥有 Ultragoal 目标状态，不创建 worker 账本，不变更 `.gjc/ultragoal`，不从 Ultragoal 自动启动 Team，也不执行隐藏的 GJC 目标变更。Worker 不得运行 `gjc ultragoal checkpoint`；在 worker 任务终端后，检查点权限保留在领导者处。Ultragoal 不自动启动 Team 且不执行隐藏的目标变更。领导者使用终端 Team 证据加新鲜的 `goal({"op":"get"})` 快照和严格质量门来运行 `gjc ultragoal checkpoint --goal-id <id> --status complete --evidence "<提及 .gjc/ultragoal 和 <id> 的 team 证据>" --gjc-goal-json <新鲜-goal-get-json-或-路径> --quality-gate-json <quality-gate-json-或-路径>`。

### Worker 命令覆盖

重要：`N:agent-type`（例如 `3:executor`）选择 worker 数量和角色 prompt。纯 `gjc team "task"` 默认为 3 个 executor worker；`gjc team 1:executor "task"` 是显式的单 worker 形式。

要使用特定的 GJC 兼容命令启动 worker，使用 `GJC_TEAM_WORKER_COMMAND`：

```bash
GJC_TEAM_WORKER_COMMAND="bun packages/coding-agent/src/cli.ts" gjc team executor "更新文档并报告"
```

## 前置条件

在运行 `$team` 之前，确认：

1. `tmux` 已安装（`tmux -V`）
2. 当前领导者会话在 tmux 内部（`$TMUX` 已设置）
3. `gjc` 命令解析到预期的安装/构建
4. 如果运行仓库本地的 `node bin/gjc.js ...`，在 `src` 更改后运行 `npm run build`
5. 检查领导者窗口中的 HUD 窗格计数，在分割前避免重复的 `hud --watch` 窗格

建议的预检：

```bash
tmux list-panes -F '#{pane_id}\t#{pane_start_command}' | rg 'hud --watch' || true
```

如果存在重复，在 `gjc team` 之前移除多余的，以防止 HUD 出现在 worker 堆栈中。

## 预上下文摄入门

在启动 `gjc team` 之前，需要一个有根据的上下文快照：

1. 从请求中派生任务 slug。
2. 当可用时，重用 `.gjc/context/{slug}-*.md` 中最新的相关快照。
3. 如果不存在，创建 `.gjc/context/{slug}-{timestamp}.md`（UTC `YYYYMMDDTHHMMSSZ`），包含：
   - 任务陈述
   - 期望结果
   - 已知事实/证据
   - 约束
   - 未知项/开放问题
   - 可能的代码库接触点
4. 如果歧义仍然很高，先运行 `explore` 获取棕场事实，然后在 team 启动前运行 `$deep-interview --quick <task>`。
5. 如果当前正确性取决于官方文档、版本感知的框架指南、最佳实践或外部依赖行为，在 worker 启动之前或同时自动委托 `researcher` 作为证据通道，而不是仅依赖仓库本地回忆。

在满足此门之前不要启动 worker 窗格；如果被迫快速继续，在启动报告中声明明确的范围/风险限制。

对于摄入期间的简单只读棕场查找，遵循活跃会话指南：当 `USE_GJC_EXPLORE_CMD` 启用时，优先使用 `gjc explore` 配合狭窄、具体的 prompt；否则使用更丰富的正常探索路径，并在 `gjc explore` 不可用时正常回退。

## 后续人员配置契约

当 `$team` 用作来自 ralplan 的后续模式时，携带批准计划的显式 **available-agent-types roster** 并在启动前将其转化为具体的人员配置指南：

- 保持 worker 角色选择在已知名册内
- 声明 GJC team 启动请求的 worker 数量和角色分配
- 在可用时声明每个通道的建议推理级别
- 解释为什么每个通道存在（交付、验证、专家支持）
- 包含协调 worker 运行的显式启动提示（`gjc team "<task>"` / `$team "<task>"`）；提及 `$ultragoal` 作为默认的持久后续/账本路径；仅在明确请求或真正需要作为回退时才提及后续的单独单所有者执行
- 如果理想角色不可用，从名册中选择最接近的角色并说明
- 对于多 worker 后续执行，不要将内联的"分割通道：A...，B..."句子作为整个 team 任务传递。`gjc team` 拒绝歧义的内联通道分割，因为它们以前导致每个 worker 收到相同的宽泛任务。改为使用显式的 markdown 通道节：
  ```md
  ### Lane A — 交付
  仅实现交付更改和证据。

  ### Lane B — 验证
  添加聚焦的测试和烟雾证据。
  ```
  显式的 `### Lane <id> — <title>` 节被转化为不同的 worker 拥有的初始任务。

## 当前运行时行为（如已实现）

`gjc team` 当前执行：

1. 解析参数（`N`、`agent-type`、task），默认 3 个 worker，上限 20 个 worker。
2. 非 dry-run：在创建状态或 worktree 之前使用 `display-message -p "#S:#I #{pane_id}"` 检测当前 tmux 领导者上下文。
3. 初始化 team 状态：
   - `.gjc/state/team/<team>/config.json`
   - `.gjc/state/team/<team>/manifest.v2.json`
   - `.gjc/state/team/<team>/tasks/task-*.json`（每个显式通道节一个，否则每个 worker 一个 worker 拥有的兼容性任务）
   - `.gjc/state/team/<team>/mailbox/worker-1.json`
   - `.gjc/state/team/<team>/workers/<worker>/status.json`
   - `.gjc/state/team/<team>/workers/<worker>/lifecycle.json`
   - `.gjc/state/team/<team>/workers/<worker>/heartbeat.json`
4. 从 `GJC_TEAM_WORKER_COMMAND` 或活跃 `gjc` 入口点解析 worker 命令。
5. 像 GJC team 一样分割当前 tmux 窗口：worker 1 水平分割到领导者右侧，workers 2..N 在右列垂直堆叠，然后 `select-layout main-vertical` 和 `main-pane-width` 保持领导者左/worker 右大约 50/50。
6. 使用以下环境变量启动 worker：
   - `GJC_TEAM_NAME=<team>`
   - `GJC_TEAM_WORKER_ID=worker-1`
   - `GJC_TEAM_STATE_ROOT=<leader-cwd>/.gjc/state/team`
   - 当 worktree 模式活跃时，可选的 `GJC_TEAM_WORKTREE_PATH=<path>`
7. 在领导者监控期间自动集成 worker worktree 提交：
   - 脏的 worker worktree 在集成前自动检查点
   - 干净超前的 worker 历史通过运行时合并提交合并到领导者
   - 分叉的 worker 历史被 cherry-pick 到领导者
   - 闲置/完成/失败的 worker worktree 在集成后交叉 rebase 到更新的领导者；工作中的 worker 被跳过
   - 冲突被中止、记录并报告到领导者邮箱，而不错误地推进 `last_integrated_head`
8. 在 config/manifest/snapshot 中存储窗格/目标/集成/生命周期证据：`tmux_session`、`tmux_session_name`、`tmux_target`、领导者窗格 id、worker 窗格 ids、`worker_lifecycle_by_id` 和 `integration_by_worker`。
9. 返回控制给领导者；后续使用 `status`、`resume`、`shutdown` 和 `gjc team api`。

重要：

- 领导者保留在现有左侧窗格中。
- Worker 窗格是右侧领导者左/worker 右分割的独立完整 GJC worker CLI 会话。
- Worker CLI 选择仅限队友：`GJC_TEAM_WORKER_CLI` 和 `GJC_TEAM_WORKER_CLI_MAP` 仅接受 `auto` 或 `gjc`；遗留/提供者值如 `codex`、`claude` 或 `gemini` 在启动前被拒绝。
- Worker 可以在专用 git worktree 中运行（`gjc team --worktree[=<name>]`），同时共享 team 状态根。
- `shutdown` 仅在确认记录的 worker 窗格仍属于存储的 tmux 目标且不是领导者窗格后才杀死它。它永不杀死 tmux 会话。

## 必需的生命周期（操作员契约）

运行 `$team` 时遵循此精确生命周期：

1. 启动 team 并验证启动证据（team 行、tmux 目标、worker 窗格 id、状态目录、启动 ACK 后 `worker_lifecycle_by_id.<worker>.lifecycle_state=ready`）。
2. 首先使用运行时/状态工具监控任务进度（`gjc team status <team>`、`gjc team resume <team>`、任务文件）。
3. 在关闭前等待终端任务状态和集成结算：
   - `pending=0`
   - `in_progress=0`
   - `failed=0`（或明确确认的失败路径）
   - 无待处理的集成请求/冲突（`status` / `resume` 不得报告 `phase=awaiting_integration`）
4. 仅在那时运行 `gjc team shutdown <team>`。
5. 验证关闭证据和保留的状态（`phase=complete`、worker 运行时状态 `stopped`、生命周期 `stopped` 带匹配的优雅关闭请求 id）。如果在证据支持的任务完成之前强制关闭，预期 `phase=cancelled` 或 `phase=failed`；如果任务完成但集成仍待处理或冲突，预期 `phase=awaiting_integration`，而非 `complete`。

当 worker 正在活跃写入更新时不要运行 `shutdown`，除非用户明确请求中止/取消。当运行时/状态证据可用时，不要将临时窗格输入视为主要控制流。

### 活跃领导者监控规则

当 team 正在运行时，持续检查活跃 team 状态直到终端完成。

最小可接受循环：

```bash
sleep 30 && gjc team monitor <team-name>
```
变更监控路径还执行有界活性恢复：过期的任务认领、陈旧的心跳认领和缺失记录的 worker 窗格被重新排队，而不是永久保留工作为 `in_progress`。

## 操作命令

```bash
gjc team status <team-name>
gjc team monitor <team-name>
gjc team resume <team-name>
gjc team shutdown <team-name>
```

语义：

- `status`：只读快照路径；它不恢复认领、重放通知、集成 worker 提交或同步 HUD 状态。
- `monitor`：变更监控路径；读取 team 快照，恢复过期/陈旧的 worker 认领，应用待处理的 worker worktree 集成，重放通知，同步 HUD 状态，并返回任务计数、worker 状态、tmux 目标/窗格证据、`worker_lifecycle_by_id` 和 `integration_by_worker`。
- `resume`：变更监控路径；为重连/检查流执行相同的活性恢复和集成感知的活跃快照。
- `list`：纯读取路径；列出已知 team 而不集成 worker 提交。
- API/只读快照操作是纯的，除非明确记录为监控路径。
- `claim-task`：变更任务路径；在授予新认领之前，它恢复过期认领并拒绝来自已分类为不活跃的 worker 的认领。
- `shutdown`：写入每个 worker 的优雅 `shutdown-request.json`，将生命周期从 `draining` 移动到 `stopped`，在记录的 worker 窗格仍属于存储的 tmux 目标时杀死它，移除干净的已创建 worktree，标记 worker 运行时状态为停止，并从任务、生命周期和集成状态设置 phase：仅当所有任务已验证 `completion_evidence`、每个 worker 有匹配的优雅关闭生命周期证据且无集成请求/冲突待处理时为 `complete`；当任务和生命周期完成但领导者集成仍需要行动时为 `awaiting_integration`；当任务失败/阻塞或已完成任务缺乏有效证据时为 `failed`；当工作仍待处理或进行中时为 `cancelled`。它将 `.gjc/state/team/<team>` 保留为证据。

## 数据平面和控制平面

### 控制平面

- 当前 tmux 领导者窗口和一个或多个 worker 窗格。
- `gjc team` 生命周期命令。
- `gjc team api claim-task` 和 `gjc team api transition-task-status`。

### 数据平面

- `.gjc/state/team/<team>/config.json`
- `.gjc/state/team/<team>/manifest.v2.json`
- `.gjc/state/team/<team>/phase.json`
- `.gjc/state/team/<team>/events.jsonl`
- `.gjc/state/team/<team>/trace.jsonl`
- `.gjc/state/team/<team>/trace-errors.jsonl`
- `.gjc/state/team/<team>/telemetry.jsonl`
- `.gjc/state/team/<team>/monitor-snapshot.json`
- `.gjc/state/team/<team>/integration-report.md`
- `.gjc/state/team/<team>/tasks/task-1.json`（在完成转换后包括结构化的 `completion_evidence`）
- `.gjc/state/team/<team>/mailbox/worker-1/<message-id>.json`
- `.gjc/state/team/<team>/mailbox/worker-1.json`（遗留兼容性视图）
- `.gjc/state/team/<team>/notifications/<notification-id>.json`
- `.gjc/state/team/<team>/workers/<worker>/startup-ack.json`
- `.gjc/state/team/<team>/workers/<worker>/status.json`
- `.gjc/state/team/<team>/workers/<worker>/lifecycle.json`
- `.gjc/state/team/<team>/workers/<worker>/heartbeat.json`
- `.gjc/state/team/<team>/workers/<worker>/shutdown-request.json`
- `.gjc/state/team/<team>/workers/<worker>/nudges/<fingerprint>.json`
- `.gjc/reports/team-commit-hygiene/<team>.ledger.json`

## Team 变更互操作（CLI-first）

使用 `gjc team api` 进行机器可读的任务生命周期操作。

```bash
gjc team api worker-startup-ack --input '{"team_name":"my-team","worker_id":"worker-1","protocol_version":"1"}' --json
gjc team api claim-task --input '{"team_name":"my-team","worker_id":"worker-1"}' --json
gjc team api transition-task-status --input '{"team_name":"my-team","task_id":"task-1","to":"completed","worker_id":"worker-1","claim_token":"<claim-token>","completion_evidence":{"summary":"完成请求的工作并在本地验证。","items":[{"kind":"command","status":"passed","summary":"聚焦测试通过","command":"bun test packages/coding-agent/test/gjc-runtime/team-runtime.test.ts"}],"files":["packages/coding-agent/test/gjc-runtime/team-runtime.test.ts"],"notes":"包括至少一个通过的命令或已验证的检查/工件项。"}}' --json
gjc team api update-worker-status --input '{"team_name":"my-team","worker_id":"worker-1","status":"working","current_task_id":"task-1"}' --json
gjc team api recover-stale-claims --input '{"team_name":"my-team"}' --json
gjc team api read-traces --input '{"team_name":"my-team"}' --json
gjc team api create-task --input '{"team_name":"my-team","subject":"验证交付","description":"运行验证","owner":"worker-1","lane":"verification","required_role":"executor","depends_on":["task-1"]}' --json
```

规范的 worker 生命周期操作：

- `worker-startup-ack` 在任务工作之前；这记录启动 ACK 并将 `workers/<worker>/lifecycle.json` 移动到 `ready`
- `claim-task`
- `update-worker-status` 当 worker 开始/停止任务本地活动时；这更新 worker 报告的 `status.json` 而不替换运行时生命周期真实来源
- `recover-stale-claims` 是领导者/运行时拥有的；它清除过期认领文件，重新排队由陈旧 worker 认领的进行中任务，并记录 `task_claim_recovered` 事件，而不修改终端任务记录或完成证据
- `transition-task-status` 带认领令牌、worker id 和结构化的 `completion_evidence` 对象
- `release-task-claim`
认领资格是有序的且不得被绕过：显式任务 id 选择、任务状态/终端检查、所有者/受托人检查、通道/角色检查、依赖/阻塞检查，然后是活跃租约创建。`lane` 是描述性元数据；`required_role` 和 `allowed_roles` 是强制执行的 worker 角色门。

完成证据以内联方式存储在任务记录上作为 `completion_evidence`。它必须包括非空的 `summary`、一个 `items` 数组，以及至少一个 `status: "passed"` 或 `status: "verified"` 的项。有效的项类型是 `command`、`inspection` 和 `artifact`；命令项需要 `command`。驼峰别名 `completionEvidence` 被 API 输入接受，但遗留字符串 `evidence` 和单独的证据文件不是公共完成契约的一部分。

GJC-team 互操作操作也可用于邮箱、原生通知、worker 心跳/状态、陈旧认领恢复、启动 ACK、事件、监控快照、批准和关闭请求/确认流程；运行 `gjc team api --help` 获取完整操作列表。

`trace.jsonl` 中的结构化跟踪记录是仅追加模式版本 1 条目。每个跟踪通过 `source_event_id` 引用遗留的 `events.jsonl` 源，保留 `event_type`、worker/task ids，并在可用时包括完成证据或认领恢复的 `evidence_refs`。跟踪追加失败被隔离在 `trace-errors.jsonl` 中，不破坏 `events.jsonl` 兼容性。

## GJC 原生概念对等

GJC 从 `../../oh-my-codex` 移植 team 模式概念，而非 OMX/Codex 特定的假设：

| 概念 | GJC 原生等价物 |
|---------|-----------------------|
| Worker 身份/收件箱/邮箱路径 | `.gjc/state/team/<team>/workers/<worker>/identity.json`、`inbox.md` 和 `.gjc/state/team/<team>/mailbox/<worker>/` 下的每消息邮箱记录。 |
| 启动 ACK | `gjc team api worker-startup-ack`，持久化为 `workers/<worker>/startup-ack.json`。 |
| 认领安全的生命周期 API | `claim-task`、`transition-task-status` 和 `release-task-claim`，带 worker 所有权和认领令牌守卫。 |
| 交付状态和延迟的窗格尝试 | `.gjc/state/team/<team>/notifications/` 下的原生通知记录，具有 `pending`、`sent`、`queued`、`deferred`、`failed`、`delivered` 和 `acknowledged` 状态。 |
| 非破坏性领导者轻推 | `workers/<worker>/nudges/` 下的生命周期轻推记录；GJC 建议检查/重新启动但永不自动杀死或自动重新启动 worker。 |

禁止的假设：不要复制 OMX 路径、Codex 通知负载格式、OMX 进程名或源代码。保持 tmux 作为当前运行时；原生拆分 worker TUI 仅保留在路线图上。

Worker 协议：

- 在任务工作之前使用 `worker-startup-ack` 发送启动 ACK。
- 使用 `update-worker-status` 报告 worker 活动；这是 worker 报告的状态平面，而不是运行时生命周期状态。
- 使用 `claim-task` 认领待处理工作。
- 使用 `transition-task-status` 将任务转换为 `completed`、`failed` 或 `blocked`，包括认领令牌和完成证据。
- 在 worker worktree 中提交或保留 worktree 更改；领导者 `monitor`/`resume` 路径将在可能的情况下自动检查点脏 worktree 并集成已提交的历史。
- 在正常任务输出和状态文件中记录实现/验证证据；领导者集成/冲突通知通过 `.gjc/state/team/<team>/mailbox/leader-fixed.json` 传递。

## 环境配置

有用的运行时环境变量：

- `GJC_TMUX_COMMAND` / `GJC_TEAM_TMUX_COMMAND`
  - tmux 二进制/命令覆盖（默认 `tmux`）。`GJC_TMUX_COMMAND` 应用于每个 GJC tmux 流程；`GJC_TEAM_TMUX_COMMAND` 被 team 路径作为别名接受。两者通过同一解析器解析，因此 team 领导者和 `gjc session ...` 始终针对同一多路复用器。
  - 多路复用器支持边界：GJC 管理的会话和 team 领导者通过 tmux 用户选项检测（`@gjc-profile`，使用 `set-option` 写入，使用 `show-options` / `list-sessions -F` 读回）。提供者必须往返这些用户选项才能被支持。真实 tmux 有效。Windows 上的替代多路复用器如 psmux 尚不能可靠持久化 tmux 用户选项，因此 `gjc session status` 报告 `gjc_tmux_session_untagged`（会话存在于多路复用器中但未标记 GJC）且 team 启动拒绝领导者为 `unmanaged_tmux_session`。Windows 原生 psmux 路径因此不完全支持；为 GJC 管理的会话和 team 流程使用真实 tmux。
- `GJC_TEAM_WORKER_COMMAND`
  - worker 命令覆盖（默认解析为活跃 GJC 入口点或 `gjc`）
- `GJC_TEAM_STATE_ROOT`
  - team 状态根覆盖（默认 `<cwd>/.gjc/state/team`）

## 故障模式和诊断

操作员注意（对 GJC 窗格重要）：
- 手动 Enter 注入（`tmux send-keys ... C-m`）在 worker 活跃处理时可能看起来"什么都不做"；Enter 可能被窗格/任务流排队。
- 这不一定是运行时错误。在诊断 worker 故障之前确认 worker/team 状态。
- 避免重复盲目的 Enter 轰炸；一旦窗格变为闲置，它可能创建嘈杂的重复提交。

### 常见故障

- **在 tmux 外部：** 非 dry-run 启动在 team 状态或 worktree 创建之前失败。从附加的 tmux 领导者窗格启动 `gjc team`。
- **分割失败：** 如果状态已经初始化，启动记录失败阶段，回滚创建的 worktree，且永不杀死领导者 tmux 会话。
- **Worker API ENOENT：** team 状态缺失或 `GJC_TEAM_STATE_ROOT` 指向其他地方。在假设 worker 失败之前检查 `.gjc/state/team/<team>/`。
- **关闭时的陈旧窗格：** shutdown 仅在记录的 worker 窗格仍属于存储的 `tmux_target` 且不是领导者窗格时才杀死它。该目标之外的陈旧窗格需要手动检查。
- **集成冲突：** `gjc team monitor <team>` / `resume` 中止失败的合并、cherry-pick 或 worker rebase；`gjc team status <team>` 是只读检查。检查 `.gjc/state/team/<team>/integration-report.md`、`.gjc/state/team/<team>/events.jsonl`、`.gjc/state/team/<team>/mailbox/leader-fixed.json` 和 `.gjc/reports/team-commit-hygiene/<team>.ledger.json`。

### 安全手动干预（最后手段）

仅在检查 `gjc team status <team>` 和状态证据后使用：

1. 检查 team 文件：
   - `.gjc/state/team/<team>/config.json`
   - `.gjc/state/team/<team>/tasks/task-1.json`
   - `.gjc/state/team/<team>/mailbox/worker-1.json`
2. 捕获窗格尾部以确认当前 worker 状态：
   - `tmux capture-pane -t %<worker-pane> -p -S -120`
   - 如果更大的尾部读取或有界摘要会有所帮助，在使用临时 tmux 命令之前优先选择显式的选择性检查通过 `gjc sparkshell --tmux-pane %<worker-pane> --tail-lines 400`。
3. 如果窗格卡在交互状态，首先安全返回到闲置 prompt：
   - 可选的中断 `C-c` 或转义流程（CLI 特定的）一次，然后重新检查窗格捕获
4. 仅在运行时/状态检查显示需要手动 prompt 输入时发送一个简洁的触发器：
   - `tmux send-keys -t %<worker-pane> "继续当前任务；报告状态" C-m`
5. 重新检查窗格输出、任务状态、worker 邮箱和 `gjc team status <team>`。

### 关闭报告成功但陈旧 worker 窗格仍然存在

原因：
- 陈旧窗格不是记录的 worker 窗格，不再属于存储的 `tmux_target`，或来自先前的失败运行。

修复：
- 在清理前手动检查窗格，仅杀死已验证的陈旧 worker 窗格。

## 干净状态恢复

从领导者窗格运行：

```bash
# 1) 检查窗格
tmux list-panes -F '#{pane_id}\t#{pane_current_command}\t#{pane_start_command}'

# 2) 仅杀死已验证的陈旧 worker 窗格（示例）
tmux kill-pane -t %450
tmux kill-pane -t %451

# 3) 仅在保留所需证据后移除陈旧的 team 状态，使用当前清单记录的
# 状态运行时清理动词

# 4) 重试
gjc team executor "新鲜重试"
```

指南：

- 不要杀死领导者窗格。
- 不要杀死 HUD 窗格，除非有意重新启动 HUD。
- 对于记录的活跃 worker，优先使用 `gjc team shutdown <team>`；仅为已验证的陈旧窗格使用手动窗格清理。

## 执行期间的必需报告

操作此 skill 时，提供具体的进度证据：

1. Team 启动行（`Team started: <name>`）
2. tmux 目标和 worker 窗格 id
3. 来自只读 `gjc team status <team>`、变更 `gjc team monitor <team>` 或 `.gjc/state/team/<team>/tasks/task-1.json` 的任务状态
4. 当运行终端时，关闭结果（`phase=complete`，worker 状态 `stopped`）；不完整的关闭必须报告 `phase=cancelled`/`failed`，集成阻塞的关闭必须报告 `phase=awaiting_integration`

不要在没有文件/窗格证据的情况下声称成功。
如果关闭发生在 `in_progress>0` 时，不要声称干净完成。
使用 `gjc sparkshell --tmux-pane ...` 作为显式的选择性操作员辅助工具用于窗格检查和摘要；保留原始 `tmux capture-pane` 证据可用于手动干预和证明。

## 程序化 Team 编排

使用 `gjc team ...` CLI 作为受支持的 team 启动界面。对于自动化，从脚本或监督 agent 驱动相同的 CLI 流程，而不是依赖单独的运行时集成运行器。

### 受支持的当前界面

- **`gjc team ...` CLI** — 交互式或自动化 team 编排的主要方法。当需要直接 tmux 窗格可见性或可脚本化的启动路径时使用此。
- **Team 状态文件** — 在启动后需要状态、任务或邮箱证据时检查 `.gjc/state/team/<team>/`。

### 清理区分

存在两个清理路径且不得混淆：

- `team_cleanup`（**状态服务器**）：删除 team 状态**文件**在磁盘上（`.gjc/state/team/<team>/`）。在 team 运行完全完成后使用。
- tmux/会话清理：当需要停止 worker 窗格或清理中断的运行时，使用文档化的 `gjc team` 关闭 / 清理流程。

### 自动化示例

```
1. gjc team executor "修复 bugs"
2. gjc team status <team-name>
3. gjc team shutdown <team-name>
4. 清理 <team-name> 的已完成 team 状态
```

## 限制

- Worktree 供应需要 git 仓库，且可能在分支/路径冲突时失败
- send-keys 交互在负载下可能对时序敏感
- 先前运行的陈旧窗格可能干扰，直到手动清理

## 场景示例

**好：** 用户说 `continue` 在工作流已经有清晰的下一步之后。继续当前工作分支而不是重新启动或重新询问相同的问题。

**好：** 用户仅更改输出形状或下游交付步骤（例如 `make a PR`）。保留先前的非冲突工作流约束并本地应用更新。

**坏：** 用户说 `continue`，工作流重新启动发现或在缺失的验证/证据被收集之前停止。

## 交接回规划或持久化

当 team 任务集完成或用户请求返回规划/持久化时，标记 team 就绪以便交接，使 skill 工具的链守卫允许过渡：

```
gjc state team write --input '{"current_phase":"handoff"}' --json
```

skill 工具随后在同一轮次分派 `/skill:ralplan`、`/skill:deep-interview` 或 `/skill:ultragoal` 并在进程中运行 `gjc state team handoff --to <ralplan|deep-interview|ultragoal> --json` 以原子方式降级 team、提升被调用者，并同步两个 `skill-active-state.json` 文件。你不需要自己运行交接动词。
