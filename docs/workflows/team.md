# Team（tmux 并行 Worker 编排）

## 核心机制

在 tmux 中启动 N 个独立的 `gjc` Worker 进程（默认 3 个，最多 20 个），通过 `.gjc/state/team/<name>/` 下的 JSON 文件进行任务分配、心跳、邮箱通信。Leader 负责监控 + 集成 Worker 的 git worktree 提交。

流水线位置：`ralplan → team`（或独立使用）

## Team vs 原生子代理

| 场景 | 用 Team | 用原生子代理 |
|------|---------|------------|
| 持久的可见 tmux worker | ✅ | ❌ |
| 共享任务状态 | ✅ | ❌ |
| Worker 邮箱文件 | ✅ | ❌ |
| Worktree 隔离 | ✅ | ❌ |
| 显式生命周期控制 | ✅ | ❌ |
| 长时间执行（超出单次推理） | ✅ | ❌ |
| 有限的并行子任务 | ❌ | ✅ |

## Worker 协议

1. 发送 startup ACK（`worker-startup-ack`）→ lifecycle 变为 `ready`
2. 用 `update-worker-status` 报告活动
3. 用 `claim-task` 领取待处理工作
4. 用 `transition-task-status` 转换任务状态（含 claim token + completion evidence）
5. 提交或保留 worktree 变更；Leader monitor/resume 自动集成

## 重点文件（按优先级）

### ★★★ SKILL.md（核心 Prompt 定义）

**文件**：`packages/coding-agent/src/defaults/gjc/skills/team/SKILL.md`（443 行）

关键段落：

| 段落 | 行号 | 内容 |
|------|------|------|
| 调用契约 | L37-49 | `gjc team [N:agent-type] "<task>"`，默认 3 executor |
| Pre-Context Intake Gate | L98-113 | 启动前需要 grounded context snapshot |
| 当前运行时行为 | L139-167 | 8 步启动流程：解析 → tmux 检测 → 初始化状态 → 分屏 → 启动 worker → 监控集成 → 存储证据 → 返回控制 |
| Worker 生命周期 | L177-189 | 启动 → 监控 → 终端 → shutdown |
| 操作命令 | L203-219 | status(只读) / monitor(变更+恢复) / resume / shutdown / list / api |
| 数据平面 | L223-251 | `.gjc/state/team/<team>/` 下的完整文件清单 |
| CLI API 操作 | L253-275 | worker-startup-ack / claim-task / transition-task-status 等 |
| Completion Evidence 格式 | L276 | `{"summary": "...", "items": [{"kind":"command","status":"passed",...}]}` |
| Follow-up Staffing Contract | L117-135 | 从 ralplan 的 available-agent-types roster 构建 worker 配置 |
| 故障模式 | L317-331 | 5 种常见故障 + 诊断方法 |
| 安全手动干预 | L332-347 | 最后手段的操作步骤 |
| Handoff | L434-443 | `gjc state team handoff --to <ralplan|deep-interview|ultragoal>` |

### ★★★ Runtime（最大 Runtime 文件）

**文件**：`packages/coding-agent/src/gjc-runtime/team-runtime.ts`

关键类型：

```typescript
type GjcTeamPhase = "starting" | "running" | "awaiting_integration" | "complete" | "failed" | "cancelled";
type GjcTeamTaskStatus = "pending" | "blocked" | "in_progress" | "completed" | "failed";
type GjcWorkerStatusState = "idle" | "working" | "blocked" | "done" | "failed" | "draining" | "unknown";
type GjcTeamWorkerLifecycleState = "starting" | "ready" | "working" | "draining" | "stopped" | "failed" | "unknown";
```

关键常量：

| 常量 | 值 | 说明 |
|------|-----|------|
| `GJC_TEAM_DEFAULT_WORKERS` | 3 | 默认 worker 数 |
| `GJC_TEAM_MAX_WORKERS` | 20 | 最大 worker 上限 |

关键函数：

| 函数 | 作用 |
|------|------|
| `startGjcTeam` | tmux 分屏 + 初始化状态 + 启动 worker 进程 |
| `monitorGjcTeamSnapshot` | 活性恢复 + 过期 claim 回收 + worktree 提交集成 |
| `shutdownGjcTeam` | 优雅关闭 worker → 清理 worktree → 标记 phase |
| `executeGjcTeamApiOperation` | 所有 `gjc team api` 操作的分发 |
| `readGjcTeamSnapshot` | 只读状态快照 |
| `listGjcTeams` | 列出所有已知 team |

### ★★☆ Command

**文件**：`packages/coding-agent/src/commands/team.ts`（217 行）

CLI 命令分发：`start`（默认）/ `status` / `monitor` / `shutdown` / `resume` / `list` / `api`

### ★★☆ 配套文件

| 文件 | 作用 |
|------|------|
| `src/gjc-runtime/state-writer.ts` | 底层原子写入原语（`writeJsonAtomic`、`appendJsonl`、`createJsonNoClobber` 等） |
| `src/gjc-runtime/tmux-common.ts` | tmux 命令解析 + profile 管理 |
| `src/gjc-runtime/launch-tmux.ts` | tmux session 启动 |
| `src/gjc-runtime/state-renderer.ts` | 状态 markdown 渲染（`renderTeamStatusMarkdown`） |
| `src/task/parallel.ts` | 原生子代理并行（与 Team 互补） |

## 魔改切入点

| 想改什么 | 改哪里 |
|----------|--------|
| Worker 数量上限 | `team-runtime.ts` L41 `GJC_TEAM_MAX_WORKERS` |
| tmux 分屏布局 | `team-runtime.ts` 中的分屏逻辑（L142-146 的 `select-layout main-vertical`） |
| 任务分配策略 | `team-runtime.ts` 中的 `claim-task` 逻辑 |
| Worker 间通信协议 | `SKILL.md` L296-303 + `team-runtime.ts` 中的 mailbox/nudge 操作 |
| Worktree 集成 / 冲突处理 | `SKILL.md` L160-166 + `team-runtime.ts` 中的 integration 逻辑 |
| Completion Evidence 格式 | `SKILL.md` L276 + `team-runtime.ts` 中的 `GjcTeamTaskCompletionEvidence` |
| Worker CLI 类型限制 | `team-runtime.ts` L42-46（`GJC_TEAM_WORKER_CLI_ENV` / `GJC_TEAM_WORKER_CLI_MAP_ENV`） |
| 环境变量配置 | `SKILL.md` L305-316 |
| Follow-up Staffing 逻辑 | `SKILL.md` L117-135 |

## 数据流

```
用户: gjc team 3:executor "task"
  → 解析参数（N=3, agent-type=executor）
  → 检测 tmux 环境（$TMUX, tmux -V, leader pane）
  → Pre-Context Intake Gate（创建 .gjc/context/{slug}-*.md）
  → 初始化 .gjc/state/team/<name>/
    → config.json, manifest.v2.json
    → tasks/task-*.json
    → workers/<id>/status.json, lifecycle.json, heartbeat.json
    → mailbox/worker-*.json
  → tmux split-window（leader 左，workers 右）
  → 启动 worker 进程（环境变量注入 team name, worker id, state root）
  → Worker 发送 startup ACK → lifecycle: ready
  → 循环：
    → Worker: claim-task → transition-task-status (completed/failed/blocked)
    → Leader: monitor → 活性恢复 + worktree 集成
  → 所有 task 终端 → shutdown
    → 写入 shutdown-request.json
    → 生命周期: draining → stopped
    → 杀死 worker pane
    → phase: complete（或 awaiting_integration/failed/cancelled）
  → 可选 handoff 回 ralplan/deep-interview/ultragoal
```
