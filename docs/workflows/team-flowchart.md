# Team 流程图

> tmux 多 Worker 并行编排 — 分割窗格、协调执行、集成结果

---

## 3a: 总览 — 从启动到关闭的完整生命周期

```mermaid
flowchart TD
    START(["用户输入<br/>gjc team [N:agent-type] <任务>"]) --> PRECHECK["前置条件检查"]
    
    PRECHECK --> PRECHECK_OK{"tmux 已安装?<br/>在 tmux 会话内?<br/>gjc 命令可用?"}
    PRECHECK_OK -->|"否"| FAIL(["硬错误停止"])
    PRECHECK_OK -->|"是"| HUD_CHECK["检查 HUD 窗格<br/>避免重复 hud --watch"]
    
    HUD_CHECK --> GATE["预上下文摄入门"]
    GATE --> GATE_OK{"上下文就绪?"}
    GATE_OK -->|"歧义高"| DEEP_INT["先运行 explore<br/>或 deep-interview --quick"]
    DEEP_INT --> GATE
    GATE_OK -->|"是"| STARTUP["启动 Team"]
    
    STARTUP --> INIT["初始化 Team 状态<br/>- config.json<br/>- manifest.v2.json<br/>- tasks/task-*.json<br/>- mailbox/<br/>- workers/*/status.json"]
    
    INIT --> SPLIT["分割 tmux 窗口<br/>Worker 1 在领导者右侧<br/>Workers 2..N 垂直堆叠<br/>布局: main-vertical 50/50"]
    
    SPLIT --> LAUNCH["启动 Worker CLI 会话<br/>环境变量:<br/>- GJC_TEAM_NAME<br/>- GJC_TEAM_WORKER_ID<br/>- GJC_TEAM_STATE_ROOT<br/>- 可选 GJC_TEAM_WORKTREE_PATH"]
    
    LAUNCH --> MONITOR["领导者监控循环"]
    MONITOR --> MONITOR_LOOP{"任务状态?"}
    MONITOR_LOOP -->|"pending > 0"| MONITOR
    MONITOR_LOOP -->|"in_progress > 0"| MONITOR
    MONITOR_LOOP -->|"全部终端"| INTEGRATE["集成 Worker 提交"]
    
    INTEGRATE --> INTEGRATE_CHECK{"集成结果?"}
    INTEGRATE_CHECK -->|"成功"| SHUTDOWN["关闭 Team:<br/>gjc team shutdown <team>"]
    INTEGRATE_CHECK -->|"冲突"| CONFLICT["记录冲突<br/>报告到领导者邮箱<br/>不推进 last_integrated_head"]
    CONFLICT --> SHUTDOWN
    
    SHUTDOWN --> VERIFY["验证关闭证据:<br/>- phase=complete<br/>- worker 状态 stopped<br/>- 生命周期 stopped"]
    VERIFY --> DONE(["完成"])
```

---

## 3b: 预上下文摄入门 + 启动流程

```mermaid
flowchart TD
    START(["team 启动请求"]) --> SLUG["从任务描述<br/>派生任务 slug"]
    
    SLUG --> CONTEXT{"存在<br/>.gjc/context/{slug}-*.md?"}
    CONTEXT -->|"是"| REUSE["重用最新相关快照"]
    CONTEXT -->|"否"| CREATE["创建上下文快照:<br/>.gjc/context/{slug}-{timestamp}.md<br/>内容:<br/>- 任务陈述<br/>- 期望结果<br/>- 已知事实/证据<br/>- 约束<br/>- 未知项/开放问题<br/>- 可能的代码库接触点"]
    
    REUSE --> AMBIG{"歧义仍高?"}
    CREATE --> AMBIG
    AMBIG -->|"是"| DEEP["运行 explore 获取棕场事实<br/>然后 deep-interview --quick"]
    DEEP --> AMBIG
    AMBIG -->|"否"| DOC{"需要外部文档?"}
    
    DOC -->|"是"| RESEARCH["委托 researcher<br/>作为证据通道<br/>获取官方/版本感知信息"]
    DOC -->|"否"| GATE_OK(["门满足 → 启动"])
    RESEARCH --> GATE_OK
    
    GATE_OK --> TMUX_CHECK["确认 tmux 环境:<br/>- tmux -V<br/>- echo $TMUX<br/>- tmux list-panes"]
    
    TMUX_CHECK --> TMUX_OK{"环境 OK?"}
    TMUX_OK -->|"否"| FAIL(["报错: 需要在 tmux 内运行"])
    TMUX_OK -->|"是"| DETECT["检测领导者上下文:<br/>display-message -p<br/>获取 session:window pane_id"]
    
    DETECT --> INIT_STATE["初始化 team 状态文件:<br/>.gjc/state/team/<team>/"]
    
    INIT_STATE --> INIT_FILES["创建文件:<br/>config.json — team 配置<br/>manifest.v2.json — worker 清单<br/>phase.json — 当前阶段<br/>events.jsonl — 事件审计<br/>tasks/task-*.json — 任务定义<br/>mailbox/ — 邮箱目录<br/>workers/<id>/ — worker 目录"]
    
    INIT_FILES --> PARSE_LANE{"有显式 Lane 节?<br/>### Lane A — 标题"}
    PARSE_LANE -->|"是"| LANE_TASKS["每 Lane 创建独立 task<br/>带 lane/required_role/allowed_roles"]
    PARSE_LANE -->|"否"| COMPAT_TASKS["每 Worker 创建<br/>兼容性 task"]
    
    LANE_TASKS --> RESOLVE_CMD["解析 Worker 命令:<br/>GJC_TEAM_WORKER_COMMAND<br/>或活跃 gjc 入口点"]
    COMPAT_TASKS --> RESOLVE_CMD
    
    RESOLVE_CMD --> SPLIT_PANES["分割窗格:<br/>1. Worker 1: 水平分割到右侧<br/>2. Workers 2..N: 右侧垂直堆叠<br/>3. select-layout main-vertical<br/>4. main-pane-width 50/50"]
    
    SPLIT_PANES --> LAUNCH_WORKERS(["启动 Workers → 进入监控"])
```

---

## 3c: Worker 生命周期

```mermaid
flowchart TD
    START(["Worker CLI 启动"]) --> STARTUP_ACK["1. Worker Startup ACK<br/>gjc team api worker-startup-ack<br/>记录 lifecycle.json → ready"]
    
    STARTUP_ACK --> CLAIM["2. 认领任务<br/>gjc team api claim-task<br/>检查:<br/>- 显式 task_id 选择<br/>- 任务状态/终端检查<br/>- 所有者/受托人<br/>- 通道/角色<br/>- 依赖/阻塞"]
    
    CLAIM --> CLAIM_OK{"认领成功?"}
    CLAIM_OK -->|"是"| UPDATE_STATUS["3. 更新状态<br/>gjc team api update-worker-status<br/>status: working<br/>current_task_id: task-X"]
    CLAIM_OK -->|"否"| RETRY_CLAIM["等待或重试认领"]
    RETRY_CLAIM --> CLAIM
    
    UPDATE_STATUS --> DO_WORK["4. 执行任务<br/>在 worktree 中工作<br/>提交更改"]
    
    DO_WORK --> TRANSITION["5. 转换任务状态<br/>gjc team api transition-task-status<br/>to: completed | failed | blocked<br/>携带 claim_token<br/>携带 completion_evidence"]
    
    TRANSITION --> EVIDENCE_CHECK{"完成证据有效?"}
    EVIDENCE_CHECK -->|"是"| RELEASE["6. 释放任务认领<br/>gjc team api release-task-claim"]
    EVIDENCE_CHECK -->|"否"| FIX["补充证据"]
    FIX --> TRANSITION
    
    RELEASE --> NEXT{"还有待处理任务?"}
    NEXT -->|"是"| CLAIM
    NEXT -->|"否"| IDLE(["Worker 闲置<br/>等待关闭或新任务"])
    
    TRANSITION -->|"failed"| FAIL_STATE(["任务失败<br/>记录到状态"])
    TRANSITION -->|"blocked"| BLOCKED_STATE(["任务阻塞<br/>等待解除"])
```

### 完成证据结构

```mermaid
flowchart LR
    EVIDENCE["completion_evidence"] --> SUMMARY["summary: 非空摘要"]
    EVIDENCE --> ITEMS["items: 数组<br/>至少1项 passed/verified"]
    ITEMS --> CMD["command: 命令 + 状态"]
    ITEMS --> INSP["inspection: 检查 + 状态"]
    ITEMS --> ART["artifact: 工件 + 状态"]
    EVIDENCE --> FILES["files: 相关文件列表"]
    EVIDENCE --> NOTES["notes: 备注"]
```

---

## 3d: 领导者监控循环 + Worktree 集成

```mermaid
flowchart TD
    START(["Team 启动完成"]) --> MONITOR["运行监控循环:<br/>gjc team monitor <team><br/>(每30秒或按需)"]
    
    MONITOR --> SNAPSHOT["读取 team 快照:<br/>- 任务计数<br/>- worker 状态<br/>- tmux 目标/窗格证据<br/>- worker_lifecycle_by_id<br/>- integration_by_worker"]
    
    SNAPSHOT --> RECOVER["活性恢复:<br/>1. 恢复过期任务认领<br/>2. 清除陈旧心跳认领<br/>3. 重新排队丢失 worker 窗格的任务<br/>4. 恢复过期/陈旧认领<br/>   不修改终端任务记录"]
    
    RECOVER --> INT_CHECK{"有待处理集成?"}
    INT_CHECK -->|"是"| INT_PROCESS["Worktree 集成流程"]
    INT_CHECK -->|"否"| SYNC["同步 HUD 状态<br/>重放通知"]
    
    INT_PROCESS --> INT_WORKER{"Worker worktree 状态?"}
    INT_WORKER -->|"脏"| INT_CHECKPOINT["自动检查点<br/>脏 worktree"]
    INT_WORKER -->|"干净+超前"| INT_MERGE["运行时合并提交<br/>合并到领导者"]
    INT_WORKER -->|"分叉历史"| INT_CHERRY["Cherry-pick<br/>到领导者"]
    INT_WORKER -->|"闲置/完成/失败"| INT_REBASE["交叉 rebase<br/>到更新的领导者"]
    
    INT_CHECKPOINT --> INT_POST["集成后处理"]
    INT_MERGE --> INT_POST
    INT_CHERRY --> INT_POST
    INT_REBASE --> INT_POST
    
    INT_POST --> INT_CONFLICT{"冲突?"}
    INT_CONFLICT -->|"是"| INT_ABORT["中止合并<br/>记录到 integration-report.md<br/>记录到 events.jsonl<br/>报告到 mailbox/leader-fixed.json<br/>不推进 last_integrated_head"]
    INT_CONFLICT -->|"否"| INT_SUCCESS["推进 last_integrated_head<br/>记录到 .gjc/reports/<br/>team-commit-hygiene/<team>.ledger.json"]
    
    INT_ABORT --> SYNC
    INT_SUCCESS --> SYNC
    
    SYNC --> TERMINAL{"所有任务终端?"}
    TERMINAL -->|"否: pending > 0<br/>或 in_progress > 0"| MONITOR
    TERMINAL -->|"是: pending=0<br/>in_progress=0<br/>failed=0(或确认)<br/>无待处理集成"| SHUTDOWN(["进入关闭流程"])
```

---

## 3e: 关闭 + 清理 + 故障恢复

```mermaid
flowchart TD
    START(["所有任务终端<br/>集成已结算"]) --> SHUTDOWN["运行关闭:<br/>gjc team shutdown <team>"]
    
    SHUTDOWN --> SHUTDOWN_STEPS["关闭步骤:<br/>1. 写入 shutdown-request.json<br/>   到每个 worker<br/>2. 生命周期: draining → stopped<br/>3. 杀死记录的 worker 窗格<br/>   (仅当仍属于存储的 tmux_target<br/>    且不是领导者窗格)<br/>4. 移除干净的已创建 worktree<br/>5. 设置最终 phase"]
    
    SHUTDOWN_STEPS --> PHASE_SET{"最终 Phase?"}
    
    PHASE_SET -->|"全部完成+证据+无集成待处理"| COMPLETE["phase=complete<br/>worker 运行时状态: stopped<br/>生命周期: stopped<br/>匹配优雅关闭请求 id"]
    PHASE_SET -->|"完成但集成待处理/冲突"| AWAIT_INT["phase=awaiting_integration"]
    PHASE_SET -->|"任务失败/阻塞/缺证据"| FAILED_PHASE["phase=failed"]
    PHASE_SET -->|"工作中被强制关闭"| CANCELLED["phase=cancelled"]
    
    COMPLETE --> VERIFY["验证关闭证据"]
    AWAIT_INT --> VERIFY_ACTION["用户需处理集成"]
    FAILED_PHASE --> REPORT["报告失败原因"]
    CANCELLED --> REPORT_CANCEL["报告取消状态"]
    
    VERIFY --> TEAM_CLEANUP["清理 Team 状态文件:<br/>删除 .gjc/state/team/<team>/<br/>(仅在完全完成后)"]
    TEAM_CLEANUP --> DONE(["完成"])

    %% 故障恢复分支
    FAULT_START(["故障场景"]) --> FAULT_TYPE{"故障类型?"}
    
    FAULT_TYPE -->|"Worker API ENOENT"| FAULT_ROOT["检查 GJC_TEAM_STATE_ROOT<br/>和 .gjc/state/team/<team>/"]
    FAULT_TYPE -->|"分割失败"| FAULT_SPLIT["状态已初始化?<br/>记录失败阶段<br/>回滚创建的 worktree<br/>不杀死 tmux 会话"]
    FAULT_TYPE -->|"集成冲突"| FAULT_INT["检查 integration-report.md<br/>events.jsonl<br/>mailbox/leader-fixed.json<br/>.gjc/reports/team-commit-hygiene/"]
    FAULT_TYPE -->|"陈旧窗格"| FAULT_STALE["shutdown 只杀记录窗格<br/>目标外的陈旧窗格<br/>需手动清理"]
    
    FAULT_ROOT --> MANUAL["手动检查状态文件"]
    FAULT_SPLIT --> RETRY["修复后重试"]
    FAULT_INT --> MANUAL
    FAULT_STALE --> MANUAL_PANE["tmux list-panes<br/>仅杀验证过的陈旧 worker 窗格<br/>不杀领导者/HUD 窗格"]
```

---

## 数据平面文件参考

| 文件 | 作用 |
|------|------|
| `config.json` | Team 配置 |
| `manifest.v2.json` | Worker 清单 |
| `phase.json` | 当前阶段 |
| `events.jsonl` | 事件审计日志 |
| `trace.jsonl` | 结构化追踪 (v1) |
| `trace-errors.jsonl` | 追踪错误隔离 |
| `telemetry.jsonl` | 遥测 |
| `monitor-snapshot.json` | 监控快照 |
| `integration-report.md` | 集成报告 |
| `tasks/task-*.json` | 任务定义 + completion_evidence |
| `mailbox/<worker>/` | 每 worker 邮箱 |
| `notifications/` | 通知记录 |
| `workers/<id>/startup-ack.json` | 启动确认 |
| `workers/<id>/status.json` | Worker 报告状态 |
| `workers/<id>/lifecycle.json` | 生命周期真实来源 |
| `workers/<id>/heartbeat.json` | 心跳 |
| `workers/<id>/shutdown-request.json` | 关闭请求 |
| `workers/<id>/nudges/` | 领导者轻推记录 |
