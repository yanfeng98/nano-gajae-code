# Ultragoal 流程图

> 多目标持久化执行与验证 — 从简报创建目标到逐故事检查点完成

---

## 4a: 总览 — 从创建到完成的全流程

```mermaid
flowchart TD
    START(["用户触发 ultragoal"]) --> CREATE{"目标是否存在?"}
    
    CREATE -->|"否"| CREATE_FLOW["创建目标<br/>gjc ultragoal create-goals<br/>--brief '<简报>'"]
    CREATE -->|"是, 恢复"| RESUME["恢复已有目标<br/>gjc ultragoal status"]
    
    CREATE_FLOW --> GOALS_JSON[".gjc/ultragoal/goals.json<br/>G001, G002, ..."]
    GOALS_JSON --> COMPLETE_LOOP["完成目标循环<br/>gjc ultragoal complete-goals"]
    RESUME --> COMPLETE_LOOP
    
    COMPLETE_LOOP --> GET_GOAL["获取活跃 GJC 目标<br/>goal({op: get})"]
    GET_GOAL --> ACTIVE{"活跃目标存在?"}
    ACTIVE -->|"否"| CREATE_GOAL["创建 GJC 目标<br/>goal({op: create})<br/>目标: 聚合目标或单故事"]
    ACTIVE -->|"是, 且匹配"| EXEC_STORY["执行当前故事"]
    ACTIVE -->|"是, 不匹配"| DROP["丢弃旧目标<br/>goal({op: drop})"]
    DROP --> CREATE_GOAL
    
    CREATE_GOAL --> EXEC_STORY
    
    EXEC_STORY --> AUDIT["审计: 针对故事目标<br/>+ 实际工件/测试运行"]
    
    AUDIT --> CLEANUP_GATE["强制性完成清理<br/>和审查门"]
    CLEANUP_GATE --> GATE_RESULT{"门通过?"}
    GATE_RESULT -->|"否, 有阻塞项"| BLOCKERS["记录阻塞项:<br/>gjc ultragoal record-review-blockers<br/>→ 解决阻塞项 → 重跑验证"]
    BLOCKERS --> CLEANUP_GATE
    
    GATE_RESULT -->|"是, 干净"| CHECKPOINT["检查点:<br/>gjc ultragoal checkpoint<br/>--goal-id <id> --status complete<br/>--evidence '<证据>'<br/>--gjc-goal-json <快照><br/>--quality-gate-json <门>"]
    
    CHECKPOINT --> CHECKPOINT_OUT{"检查点输出?"}
    CHECKPOINT_OUT -->|"Next ultragoal goal: <id>"| NEXT_STORY["在同一聚合目标下<br/>继续下一故事"]
    CHECKPOINT_OUT -->|"All goals complete"| ALL_DONE["所有目标完成"]
    
    NEXT_STORY --> COMPLETE_LOOP
    
    ALL_DONE --> FINAL_CHECK{"聚合模式?"}
    FINAL_CHECK -->|"是"| FINAL_RECEIPT["创建最终聚合收据<br/>验证无不完整/阻塞/review_blocked"]
    FINAL_CHECK -->|"否"| COMPLETE_GOAL["goal({op: complete})"]
    FINAL_RECEIPT --> COMPLETE_GOAL
    COMPLETE_GOAL --> DONE(["Ultragoal 完成<br/>可交接回 ralplan/deep-interview"])
    
    EXEC_STORY -->|"失败/阻塞"| FAIL_CHECKPOINT["检查点失败:<br/>gjc ultragoal checkpoint<br/>--status failed<br/>--evidence '<阻塞项>'"]
    FAIL_CHECKPOINT --> RETRY["恢复失败目标:<br/>gjc ultragoal complete-goals<br/>--retry-failed"]
    RETRY --> COMPLETE_LOOP
```

---

## 4b: 创建目标 — Brief 解析 + @goal 分隔符

```mermaid
flowchart TD
    START(["创建目标请求"]) --> BRIEF_SRC{"简报来源?"}
    
    BRIEF_SRC -->|"--brief"| PARSE["解析内联简报文本"]
    BRIEF_SRC -->|"--brief-file"| READ_FILE["从文件读取简报"]
    BRIEF_SRC -->|"--from-stdin"| READ_STDIN["从标准输入读取"]
    
    PARSE --> SCAN["扫描 @goal 分隔符"]
    READ_FILE --> SCAN
    READ_STDIN --> SCAN
    
    SCAN --> HAS_DELIM{"存在 @goal 行?"}
    
    HAS_DELIM -->|"否"| SINGLE["整个简报成为单个目标 G001<br/>(遗留行为)"]
    HAS_DELIM -->|"是"| PARSE_DELIM["解析分隔符规则"]
    
    PARSE_DELIM --> RULES["分隔符规则:<br/>- @goal 必须在第0列 (无缩进)<br/>- @goal 后必须跟 : 或空白或行尾<br/>- @goalish/@goals: 等不是分隔符<br/>- 行内/缩进的 @goal 是普通文本<br/>- 第一个 @goal 之前的内容 = 序言"]
    
    RULES --> PARSE_STORIES["解析每个 @goal 块"]
    
    PARSE_STORIES --> STORY_CHECK{"块内容?"}
    STORY_CHECK -->|"有标题有正文"| STORY_OK["标题 = 目标<br/>正文 = 详细目标"]
    STORY_CHECK -->|"仅标题无正文"| STORY_TITLE["标题作为目标"]
    STORY_CHECK -->|"仅正文无标题"| STORY_BODY["第一行正文作为标题"]
    STORY_CHECK -->|"无标题无正文"| REJECT["拒绝: 报错<br/>不写入占位目标"]
    
    STORY_OK --> ASSIGN_ID["按顺序分配 ID:<br/>G001, G002, G003, ..."]
    STORY_TITLE --> ASSIGN_ID
    STORY_BODY --> ASSIGN_ID
    
    ASSIGN_ID --> STORE_PREAMBLE["序言存储为全局上下文/约束<br/>不转化为目标"]
    
    SINGLE --> GEN_GOALS["生成 .gjc/ultragoal/goals.json"]
    REJECT --> ERROR(["报错停止"])
    STORE_PREAMBLE --> GEN_GOALS
    
    GEN_GOALS --> GOALS_STRUCT["goals.json 结构:<br/>- 聚合目标: 稳定指针式<br/>- 各故事: G001..G00N<br/>  - title / objective<br/>  - status: pending<br/>  - 约束从序言继承<br/>- 遗留枚举目标自动迁移<br/>  到稳定指针目标"]
    
    GOALS_STRUCT --> MODE{"目标模式?"}
    MODE -->|"默认聚合模式"| AGGREGATE["一个聚合 GJC 目标<br/>涵盖所有故事<br/>稳定指针到 goals.json"]
    MODE -->|"--gjc-goal-mode per-story"| PER_STORY["每个故事独立 GJC 目标<br/>仅在明确偏好时使用"]
    
    AGGREGATE --> DONE(["创建完成 → 进入完成循环"])
    PER_STORY --> DONE
```

---

## 4c: 完成目标循环 — Execute → Audit → Checkpoint

```mermaid
flowchart TD
    START(["complete-goals 循环"]) --> GET["goal({op: get})<br/>获取活跃 GJC 目标快照"]
    
    GET --> NEED_CREATE{"需要创建<br/>新 GJC 目标?"}
    NEED_CREATE -->|"聚合活跃中"| CONTINUE["继续当前聚合目标<br/>不创建新目标"]
    NEED_CREATE -->|"陈旧已丢弃"| CREATE_DIRECT["直接 goal({op: create})<br/>drop 后不需要清理"]
    NEED_CREATE -->|"需要全新开始"| DROP_THEN_CREATE["goal({op: drop})<br/>然后 goal({op: create})"]
    NEED_CREATE -->|"无活跃目标"| CREATE_DIRECT
    
    CONTINUE --> EXEC["仅完成当前 GJC 故事<br/>不调用 goal({op: complete})<br/>用于中间故事"]
    CREATE_DIRECT --> EXEC
    DROP_THEN_CREATE --> EXEC
    
    EXEC --> DELEGATE{"故事复杂度?"}
    DELEGATE -->|"大, 可分离"| PARALLEL["生成并行 executor 子 agent<br/>拆分清晰可分离的文件/接口<br/>每个有有界目标和验收标准<br/>检查点所有权在领导者"]
    DELEGATE -->|"标准"| DIRECT["直接执行 / 单 executor"]
    
    PARALLEL --> COLLECT["收集子 agent 实现证据"]
    DIRECT --> COLLECT
    
    COLLECT --> ARCHITECT_REVIEW["委托 architect 审查<br/>返回 CLEAR/WATCH/BLOCK"]
    ARCHITECT_REVIEW --> CRITIC_REVIEW["委托 critic 审查"]
    CRITIC_REVIEW --> AUDIT["审计: 故事目标 vs<br/>实际工件/测试运行"]
    
    AUDIT --> CLEANUP_GATE(["进入强制性清理和审查门<br/>(见 4d)"])
    
    CLEANUP_GATE --> GATE_OK{"门通过?"}
    GATE_OK -->|"是"| CHECKPOINT_DONE["检查点完成:<br/>gjc ultragoal checkpoint<br/>--goal-id <id><br/>--status complete<br/>--evidence '...'<br/>--gjc-goal-json <快照路径><br/>--quality-gate-json <门路径>"]
    
    GATE_OK -->|"否"| RECORD_BLOCKERS["记录阻塞项 + 解决<br/>(见 4d 底部)"]
    RECORD_BLOCKERS --> CLEANUP_GATE
    
    CHECKPOINT_DONE --> CHECKPOINT_REQUIRE["完成检查点要求:<br/>- 非空的 --quality-gate-json<br/>- architectReview 全部 CLEAR<br/>- executorQa status=passed<br/>- iteration status=passed + fullRerun<br/>- 所有阻塞项数组为空<br/>- 每个证据字段非空"]
    
    CHECKPOINT_REQUIRE --> CHECKPOINT_OUT{"输出?"}
    CHECKPOINT_OUT -->|"Next ultragoal goal: G002"| NEXT(["继续下一故事"])
    CHECKPOINT_OUT -->|"All goals complete"| ALL_DONE(["全部完成 → 最终收据"])
    
    AUDIT -->|"失败/阻塞"| FAIL_CHECK["检查点失败:<br/>gjc ultragoal checkpoint<br/>--status failed<br/>--evidence '<阻塞项>'"]
    FAIL_CHECK --> RETRY(["complete-goals --retry-failed"])
    
    AUDIT -->|"遗留阻塞"| BLOCKED_CHECK["检查点阻塞:<br/>gjc ultragoal checkpoint<br/>--status blocked<br/>--evidence '...'<br/>--gjc-goal-json <快照>"]
    BLOCKED_CHECK --> RETRY
```

---

## 4d: 强制性完成清理和审查门

```mermaid
flowchart TD
    START(["故事执行完成<br/>进入质量门"]) --> STEP1["Step 1: 针对性实现验证<br/>运行故事相关测试"]
    
    STEP1 --> STEP2["Step 2: AI Slop Cleaner<br/>加载 ai-slop-cleaner.md<br/>(内部 skill-fragment)<br/>只读检测器+报告器<br/>分类: BLOCKING / ADVISORY"]
    
    STEP2 --> STEP2_CHECK{"阻塞发现?"}
    STEP2_CHECK -->|"有 BLOCKING"| STEP2_FIX["生成 executor 修复<br/>仅修复阻塞发现<br/>重新运行 cleaner<br/>直到零阻塞"]
    STEP2_FIX --> STEP2
    STEP2_CHECK -->|"零阻塞"| STEP3["Step 3: 重新运行验证<br/>(cleaner 通过后)"]
    
    STEP3 --> STEP4["Step 4: Architect 审查<br/>三个通道:"]
    STEP4 --> ARCH1["architecture-side:<br/>系统边界/分层<br/>数据/控制流<br/>运维风险"]
    STEP4 --> ARCH2["product-side:<br/>用户可见行为<br/>验收标准/边界情况<br/>回归"]
    STEP4 --> ARCH3["code-side:<br/>可维护性/测试<br/>集成点<br/>不安全捷径"]
    
    ARCH1 --> STEP5
    ARCH2 --> STEP5
    ARCH3 --> STEP5
    
    STEP5["Step 5: Executor QA / 红队<br/>必须尝试破坏变更"]
    STEP5 --> QA_DETAIL["QA 通道要求:<br/>1. 从批准计划/spec/验收标准开始<br/>2. 然后面向用户契约<br/>3. 最后才是实现代码<br/>计划/代码不匹配 = 阻塞项"]
    
    QA_DETAIL --> SURFACE["按界面类型证明:<br/>- GUI/Web → 浏览器自动化+截图<br/>- CLI → 真实调用日志/转录<br/>- API/Package → 外部消费者/黑盒<br/>- 算法/数学 → 边界/属性/对抗"]
    
    SURFACE --> QA_MATRIX["Exec QA 报告矩阵:<br/>- contractCoverage[] (每契约)<br/>- surfaceEvidence[] (每界面)<br/>- adversarialCases[] (必须非空)<br/>not_applicable 行需要<br/>contractRef + reason"]
    
    QA_MATRIX --> STEP6["Step 6: 最终代码审查轮次<br/>合并到质量门"]
    
    STEP6 --> GATE_EVAL{"质量门评估"}
    
    GATE_EVAL -->|"干净"| GATE_PASSED(["门通过!<br/>architectReview 全部 CLEAR<br/>architectReview.recommendation = APPROVE<br/>executorQa.status = passed<br/>iteration.status = passed<br/>iteration.fullRerun = true<br/>所有证据非空, 阻塞项为空"])
    
    GATE_EVAL -->|"不干净"| GATE_FAIL["COMMENT/WATCH/BLOCK<br/>REQUEST_CHANGES<br/>缺失证据/浅矩阵<br/>计划/代码不匹配<br/>非空阻塞项"]
    
    GATE_FAIL --> RECORD["记录持久阻塞项工作:<br/>gjc ultragoal record-review-blockers<br/>--goal-id <id><br/>--title '解决验证阻塞项'<br/>--objective '<阻塞项解决目标>'<br/>--evidence '<发现>'<br/>--gjc-goal-json <快照>"]
    
    RECORD --> RESOLVE["完成或引导通过<br/>阻塞项故事"]
    RESOLVE --> STEP4
```

---

## 4e: 动态引导 (Steer)

```mermaid
flowchart TD
    START(["发现需要调整<br/>但聚合目标不变"]) --> STEER_CHECK{"变更类型?"}
    
    STEER_CHECK -->|"add_subgoal"| ADD["gjc ultragoal steer<br/>--kind add_subgoal<br/>--title '...'<br/>--objective '...'<br/>--evidence '...'<br/>--rationale '...'"]
    
    STEER_CHECK -->|"split_subgoal"| SPLIT["gjc ultragoal steer<br/>--kind split_subgoal<br/>--goal-id G002<br/>--replacements-json '[...]'<br/>--evidence '...'<br/>--rationale '...'"]
    
    STEER_CHECK -->|"reorder_pending"| REORDER["gjc ultragoal steer<br/>--kind reorder_pending<br/>--order-json '['G003','G002']'<br/>--evidence '...'<br/>--rationale '...'"]
    
    STEER_CHECK -->|"revise_pending_wording"| REVISE["gjc ultragoal steer<br/>--kind revise_pending_wording<br/>--goal-id G002<br/>--title '...'<br/>--evidence '...'<br/>--rationale '...'"]
    
    STEER_CHECK -->|"annotate_ledger"| ANNOTATE["gjc ultragoal steer<br/>--kind annotate_ledger<br/>--evidence '...'<br/>--rationale '...'"]
    
    STEER_CHECK -->|"mark_blocked_superseded"| SUPERSEDE["gjc ultragoal steer<br/>--kind mark_blocked_superseded<br/>--goal-id G004<br/>--evidence '...'<br/>--rationale '...'"]
    
    ADD --> AUDIT_ENTRY["追加结构化审计条目<br/>到 ledger.jsonl"]
    SPLIT --> AUDIT_ENTRY
    REORDER --> AUDIT_ENTRY
    REVISE --> AUDIT_ENTRY
    ANNOTATE --> AUDIT_ENTRY
    SUPERSEDE --> AUDIT_ENTRY
    
    AUDIT_ENTRY --> INVARIANTS["引导不变量检查"]
    
    INVARIANTS --> INV1["不编辑聚合目标目标"]
    INVARIANTS --> INV2["不编辑原始简报约束"]
    INVARIANTS --> INV3["不编辑质量门"]
    INVARIANTS --> INV4["不编辑完成状态"]
    INVARIANTS --> INV5["不硬删除目标"]
    INVARIANTS --> INV6["不自动完成工作"]
    INVARIANTS --> INV7["不削弱验证"]
    INVARIANTS --> INV8["不静默变更 .gjc/ultragoal"]
    
    INV1 --> DONE(["引导完成<br/>被取代目标保留在 goals.json<br/>带引导元数据<br/>调度时跳过"])
```

---

## Ultragoal 文件参考

| 文件 | 作用 |
|------|------|
| `.gjc/ultragoal/brief.md` | 原始简报 |
| `.gjc/ultragoal/goals.json` | 目标计划 (稳定指针式) |
| `.gjc/ultragoal/ledger.jsonl` | 持久审计跟踪 (检查点+引导事件) |

## 目标工具操作

| 操作 | 用途 |
|------|------|
| `goal({op: get})` | 获取活跃 GJC 目标快照 |
| `goal({op: create})` | 创建新 GJC 目标 |
| `goal({op: complete})` | 完成目标 (仅最终) |
| `goal({op: drop})` | 丢弃活跃目标 (不清除模式) |
| `goal({op: resume})` | 重新激活暂停的目标 |

## 引导不变量

- 不要编辑聚合目标、原始约束、质量门或完成状态
- 不要硬删除目标或自动完成工作
- 不要削弱验证或静默变更 .gjc/ultragoal
- 接受/拒绝的尝试追加到 ledger.jsonl
- 被取代的目标保留在 goals.json，调度时跳过
