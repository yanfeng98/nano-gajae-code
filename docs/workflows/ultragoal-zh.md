---
name: ultragoal
description: 通过 GJC 目标模式工件创建和执行持久的仓库原生多目标计划。

source: "forked from upstream ultragoal skill and rebranded for GJC"
---

# Ultragoal 工作流

当用户要求 `ultragoal`、`create-goals`、`complete-goals`、持久多目标规划或通过 GJC 目标模式顺序执行时使用。

## 目的

`ultragoal` 将简报转化为仓库原生工件，然后通过统一的 `goal` 工具安全地驱动 GJC 目标。新计划默认为 `.gjc/ultragoal/goals.json` 中整个持久计划的稳定指针式聚合 GJC 目标，包括后续在同一简报约束下接受/追加的故事，而 GJC 在账本中追踪 G001/G002 故事进度。Ultragoal 在两次运行之间不需要任何 `/goal` 斜杠命令。对于同一会话/线程中背靠背的 ultragoal 运行，仅当 `goal({"op":"get"})` 仍然报告活跃聚合时调用 `goal({"op":"drop"})`；然后调用 `goal({"op":"create"})`。目标工具在 drop 后保持武装，因此下一次 create 在会话中有效，并且不需要也不存在斜杠命令清理。

- `.gjc/ultragoal/brief.md`
- `.gjc/ultragoal/goals.json`
- `.gjc/ultragoal/ledger.jsonl`（检查点和结构化引导审计事件）

具有遗留枚举目标的现有聚合计划在读取时迁移为稳定指针目标，持久化到 `goals.json`，保留在 `gjcObjectiveAliases` 中以用于已活跃隐藏目标的协调，并通过 `aggregate_objective_migrated` 账本条目审计。

## 始终使用的命令示例

在花费工具调用重新发现语法之前使用这些精确的 `gjc ultragoal` 命令：

```sh
gjc ultragoal status
gjc ultragoal status --json
gjc ultragoal create-goals --brief "<简报>"
gjc ultragoal create-goals --brief-file <路径>
gjc ultragoal complete-goals
gjc ultragoal complete-goals --retry-failed
gjc ultragoal checkpoint --goal-id <id> --status complete --evidence "<证据>" --gjc-goal-json <goal-get-json-或-路径> --quality-gate-json <quality-gate-json-或-路径>
gjc ultragoal checkpoint --goal-id <id> --status failed --evidence "<阻塞项/证据>"
gjc ultragoal record-review-blockers --goal-id <id> --title "解决最终审查阻塞项" --objective "<阻塞项解决目标>" --evidence "<审查发现>" --gjc-goal-json <活跃-goal-get-json-或-路径>
```

对内联目标状态使用这些精确的目标工具调用：

```json
goal({"op":"get"})
goal({"op":"create","objective":"<打印的聚合或每个故事的目标>"})
goal({"op":"complete"})
goal({"op":"drop"})
goal({"op":"resume"})
```
`drop` 清除活跃目标而不退出目标模式；`resume` 重新激活暂停的目标。

在 Ultragoal 内部使用 `goal({"op":"get"})` 快照进行账本协调。统一的 `goal` 工具是面向 agent 的目标状态唯一界面；不需要 `/goal` 子命令。

## 创建目标

1. 决定简报。要生成**多个**故事，用保留的 `@goal:` 分隔行分隔它们；标题跟随在同一行，目标在其下方的所有内容，直到下一个分隔符：

   ```text
   共享的简报约束/上下文放在这里（可选序言）。

   @goal: 解析摄入的 CSV
   从监视目录摄入审查者 CSV，验证标头，并拒绝
   格式错误的行，给出每行原因。目标可以跨越多行
   并包含 `code`、"引号"或命令 — 无需转义。

   @goal: 规范化记录
   将原始行映射到规范模式并按记录 id 去重。

   @goal: 导出审计报告
   发出涵盖每个接受和拒绝的行的审计就绪报告。
   ```

   分隔符契约：
   - 仅当 `@goal` 行从第 0 列开始（无前导空白）且 `@goal` 后面的字符是 `:`、空白（空格或制表符）或行尾时，该行才是故事边界。因此 `@goal: 标题`、`@goal 标题` 和裸 `@goal` 行都开启一个故事。
   - `@goalish`、`@goals:`、`@goal-foo`、`@goal.foo`、`@goal/foo` 以及任何缩进或行中的 `@goal` 是普通目标文本，不是分隔符。要在目标内部保留字面 `@goal` 行，缩进它。
   - 仅标题的块（无正文）使用标题作为其目标。空标题借用第一行正文作为标题。**既无**标题也无正文的块被拒绝 — `create-goals` 报错而不是写入占位目标。
   - **序言**（第一个 `@goal` 分隔符之前的任何文本）仅为全局上下文/约束；它保留在简报中但**不**转化为目标。每个可执行故事需要自己的 `@goal` 块。
   - **无**任何 `@goal` 分隔符时，整个简报成为单个目标 `G001`（不变的遗留行为）。

   故事按顺序成为 `G001`、`G002`、…。

2. 运行以下之一：
   - `gjc ultragoal create-goals --brief "<简报>"`
   - `gjc ultragoal create-goals --brief-file <路径>`
   - `cat <简报> | gjc ultragoal create-goals --from-stdin`
   - `gjc ultragoal create-goals --gjc-goal-mode per-story --brief "<简报>"` 仅在明确偏好每个故事一个 GJC 目标上下文时使用
3. 检查 `.gjc/ultragoal/goals.json` 并在需要时精炼。

## 完成目标

循环直到 `gjc ultragoal status` 报告所有目标完成：

1. 运行 `gjc ultragoal complete-goals`。
2. 阅读打印的交接。
3. 调用 `goal({"op":"get"})`。
4. 如果不存在活跃 GJC 目标，使用打印的负载调用 `goal({"op":"create","objective":"<打印的负载目标>"})`。在聚合模式中，如果相同的聚合目标已经活跃，继续当前 GJC 故事而不创建新的 GJC 目标。如果 `goal({"op":"get"})` 显示陈旧的已丢弃目标（状态 `"dropped"`）且新的聚合必须开始，不需要额外清理 — `goal({"op":"create"})` 直接成功。如果先前的聚合仍然活跃且你在同一会话中确实需要全新开始，先调用 `goal({"op":"drop"})`，然后 `goal({"op":"create"})`。
5. 仅完成当前 GJC 故事。
6. 针对故事目标和实际工件/测试运行完成审计。
7. 在任何 `--status complete` checkpoint 之前，运行下面的强制性最终清理/审查门。在聚合模式中，对于中间故事**不要**调用 `goal({"op":"complete"})`；使用新鲜的 `goal({"op":"get"})` 快照（其聚合目标仍是 `active`）检查点每个故事。在最后一个故事上，使用相同的新鲜活跃快照首先创建最终聚合收据；仅在该收据存在后才可以运行 `goal({"op":"complete"})`。
8. 使用该新鲜活跃快照检查点持久账本。完成检查点需要 `--quality-gate-json`；运行时钩子拒绝没有干净架构师审查的关闭：
   `gjc ultragoal checkpoint --goal-id <id> --status complete --evidence "<证据>" --gjc-goal-json <goal-get-json-或-路径> --quality-gate-json <quality-gate-json-或-路径>`
   成功的完成检查点是故事完成，而非自动运行完成。阅读检查点输出：当它打印 `Next ultragoal goal: <id>` 时，在同一聚合 GJC 目标下继续该活跃故事；当它打印 `All ultragoal goals are complete` 时，持久运行是终端的。`gjc ultragoal complete-goals` 仍然是受支持的手动下一故事命令，如果错过了继续输出。
9. 如果阻塞或失败，检查点失败：
   `gjc ultragoal checkpoint --goal-id <id> --status failed --evidence "<阻塞项/证据>"`
10. 对于遗留的每个故事完成目标阻塞项，使用以下方式保留非终端阻塞项：
    `gjc ultragoal checkpoint --goal-id <id> --status blocked --evidence "<完成的遗留 GJC 目标阻塞了此线程中的目标创建>" --gjc-goal-json <goal-get-json-或-路径>`
11. 使用 `gjc ultragoal complete-goals --retry-failed` 恢复失败的目标。

## 动态引导

当实际发现或阻塞项证明当前故事分解应该改变而聚合目标和约束保持固定时，使用 `gjc ultragoal steer`。引导是显式且证据支持的；广泛的自然语言请求被拒绝而非猜测。

允许的变更类型有：

- `add_subgoal`
- `split_subgoal`
- `reorder_pending`
- `revise_pending_wording`
- `annotate_ledger`
- `mark_blocked_superseded`

示例：

```sh
gjc ultragoal steer --kind add_subgoal --title "调查阻塞项" --objective "验证阻塞项并报告证据。" --evidence "日志/测试输出" --rationale "该阻塞项改变了安全执行顺序。" --json
gjc ultragoal steer --kind split_subgoal --goal-id G002 --replacements-json '[{"title":"修复解析器","objective":"解决解析器阻塞项。"},{"title":"验证解析器","objective":"运行聚焦的解析器验证。"}]' --evidence "实现拆分发现了两个可分离的风险" --rationale "拆分保持每个子目标独立可验证。" --json
gjc ultragoal steer --kind reorder_pending --order-json '["G003","G002"]' --evidence "调查后依赖顺序改变" --rationale "G003 必须在 G002 可以安全继续之前落地。" --json
gjc ultragoal steer --kind revise_pending_wording --goal-id G002 --title "澄清阻塞项故事" --evidence "当前标题隐藏了实际的阻塞项" --rationale "清晰的措辞保持账本可审计。" --json
gjc ultragoal steer --kind annotate_ledger --evidence "用户在运行时更改了发布顺序" --rationale "聚合目标未变，但执行历史需要审计注释。" --json
gjc ultragoal steer --kind mark_blocked_superseded --goal-id G004 --evidence "阻塞的工作不再需要，因为替代证据涵盖了它" --rationale "不需要替代子目标；仅取代阻塞的子目标即可解锁最终完成，而不改变聚合目标。" --json
```

`--directive-json` 和 UserPromptSubmit 结构化引导是计划中/推迟的路由界面，不是上述原生类型化 `--kind` CLI 路径的一部分。

引导不变量：

- 不要编辑聚合目标目标、原始简报约束、质量门或完成状态。聚合目标是指向 `.gjc/ultragoal/goals.json` 和 `.gjc/ultragoal/ledger.jsonl` 的稳定指针，而不是初始目标 id 的枚举。
- 不要硬删除目标、自动完成工作、削弱验证或静默变更 `.gjc/ultragoal`。
- 接受和拒绝的尝试追加结构化审计条目到 `.gjc/ultragoal/ledger.jsonl`。
- 被取代的目标保留在 `goals.json` 中并带有引导元数据，并在调度时跳过。
- 没有替代方案的阻塞目标在调度时跳过，但在后续明确引导替换或取代它们之前仍然阻塞最终完成。

UserPromptSubmit 结构化引导指令是计划中/推迟的路由界面。普通散文不改变状态。

## 角色 agent 委托指南

当持久故事足够大以受益于委托时，Ultragoal 执行应使用 GJC 捆绑的角色 agent 名册：

- 使用 `executor` 进行有界实现、重构和修复切片。
- 使用 `planner` 进行故事排序或交接精炼，当执行揭示了缺失的计划分支时。
- 使用 `architect` 进行只读架构和代码审查通道，包括 `CLEAR` / `WATCH` / `BLOCK` 状态。
- 使用 `critic` 在执行前进行只读计划或交接批评。

当使用原生子 agent 委托时，等待超时仅限制领导者的等待时间。它不是子 agent 失败证据，且不得用作取消原因；检查或继续独立工作，仅在子 agent 实际失败、偏离轨道或变得不可恢复地错误时取消。

如果 Ultragoal 请求没有批准的计划或共识工件，首先运行 `ralplan` 并将其 PRD、测试规格、角色名册和验证指南保留在 Ultragoal 账本中。不要默默地将临时执行替代为缺失的规划。

Ultragoal 领导者拥有 `.gjc/ultragoal/goals.json` 和 `.gjc/ultragoal/ledger.jsonl`。角色 agent 返回实现/审查证据；它们不检查点 Ultragoal 或变更目标状态。

对于具有独立切片的大型子目标，Ultragoal 领导者必须生成并行的 `executor` 子 agent 而不是进行串行单独工作。仅拆分清晰可分离的文件/界面，给每个 executor 有界目标和验收标准，并将检查点所有权保留在领导者中。在集成后使用 `architect` / `critic` 审查通道；不要让 worker agent 变更 `.gjc/ultragoal` 或调用目标工具。

## 一起使用 Ultragoal 和 Team

为受益于一个可见 tmux worker 会话的持久 Ultragoal 故事一起使用 ultragoal 和 team。Ultragoal 保持领导者拥有：`.gjc/ultragoal/goals.json` 存储故事计划，`.gjc/ultragoal/ledger.jsonl` 存储检查点。Team 是单 worker tmux 执行引擎，返回任务/证据状态给领导者。

领导者使用新鲜的 `goal({"op":"get"})` 快照从 Team 证据检查点 Ultragoal：

```sh
gjc ultragoal checkpoint --goal-id <id> --status complete --evidence "<提及 .gjc/ultragoal 和 <id> 的 team 证据>" --gjc-goal-json <新鲜-goal-get-json-或-路径> --quality-gate-json <quality-gate-json-或-路径>
```

Worker 不拥有 ultragoal 目标状态，不创建 worker ultragoal 账本，且不检查点 Ultragoal。Worker 不得运行 `gjc ultragoal checkpoint`；在 worker 任务终端后，检查点权限保留在领导者处。Team 启动保持显式；Ultragoal 不自动启动 Team 且不执行隐藏的目标变更。

## 内部 Ultragoal 子 skill 片段

完成门清理扫描由 `ai-slop-cleaner` 驱动，这是一个内部 Ultragoal 子 skill，作为 `kind: "skill-fragment"` prompt 捆绑，父 skill 为 `ultragoal`（安装在 `skill-fragments/ultragoal/ai-slop-cleaner.md`）。它类似于深度访谈的自动研究片段：为一个特定钩子按需加载，永不是面向用户的 skill。

- 它不可斜杠命令发现，没有公共 skill 列表条目，且永不可通过 `skill://` 解析。
- 它是仅对活跃故事变更文件的只读检测器+报告器：它永不编辑代码、写入文件、变更 `.gjc/`、检查点、调用目标工具或生成工作流。
- 它将每个发现分类为跨完整分类法的阻塞或建议性（fallback-like 遮蔽 vs. 有根据的、重复、死代码、不必要的抽象、边界违规、UI/设计 slop、缺失测试）。
- 领导者和领导者生成的 `executor` 拥有所有修复；cleaner 重新运行直到零阻塞发现剩余。建议性发现仅存在于门报告中。
- 递归守卫：它不得生成嵌套的 `ralplan`/`team`/`deep-interview`/`ultragoal`；广泛或架构发现作为审查阻塞项交回给领导者。

## 强制性完成清理和审查门

在活跃 agent 运行质量门之前，ultragoal 故事不能被检查点为 `complete`。门是计划优先、契约驱动和基于界面的：

1. 运行故事的针对性实现验证。
2. 运行内部 ai-slop-cleaner skill 片段作为故事变更文件上的最终清理扫描，仅在验证和红队之前，以便只有干净的代码被审查。它是一个只读检测器，发出 `AI SLOP CLEANUP REPORT`；如果没有相关编辑，它仍然运行并记录通过/无操作报告。每个 BLOCKING cleaner 发现是完成阻塞项：领导者生成 `executor` 仅修复阻塞发现，然后重新运行 cleaner 直到阻塞发现为零。建议性发现仅包含在门报告中，不写入 Ultragoal 账本。通过现有的 `qualityGate.iteration.evidence` 字段携带报告；不要添加新的顶层 quality-gate 键。
3. 在 cleaner 通过后重新运行验证。
4. 委托一个覆盖所有三个通道的 `architect` 审查：
   - architecture-side：系统边界、分层、数据/控制流、运维风险。
   - product-side：用户可见行为、验收标准、边界情况、回归。
   - code-side：可维护性、测试、集成点和不安全捷径。
5. 委托一个 `executor` QA/红队通道来构建和运行适合故事的 e2e/红队 QA 套件。此通道必须尝试破坏变更，而不仅仅是确认快乐路径。它必须从批准的计划/spec/验收标准开始，然后是面向用户的契约，然后才是实现代码作为支持证据。计划/代码不匹配是阻塞项，不是用实现意图掩盖的项目。
6. executor QA/红队通道必须通过真实被测界面证明证据：
   - GUI/web 界面需要浏览器自动化加上截图或图像判决。
   - CLI 界面需要来自真实调用的日志或终端转录。
   - API/package 界面需要通过公共接口的外部消费者或黑盒测试。
   - 算法/数学界面需要边界、属性、对抗和失败模式案例。
7. executor QA/红队通道必须使用 `executorQa.contractCoverage`、`executorQa.surfaceEvidence`、`executorQa.adversarialCases` 和 `executorQa.artifactRefs` 报告矩阵。不适用行仅在 `contractCoverage` 和 `surfaceEvidence` 中允许；每个 `status: "not_applicable"` 行需要 `contractRef` 加 `reason`。`adversarialCases` 行不能是不适用。
8. 运行最终代码审查轮次并将其合并到严格质量门中。干净意味着 `architectReview.architectureStatus`、`architectReview.productStatus` 和 `architectReview.codeStatus` 都是 `"CLEAR"`，`architectReview.recommendation` 是 `"APPROVE"`，executor QA 状态是 `"passed"`，iteration 是 `"passed"` 且 `fullRerun: true`，每个证据字段非空，每个所需矩阵行存在，且每个阻塞项数组为空。`COMMENT`、`WATCH`、`REQUEST CHANGES`、`BLOCK`、缺失证据、缺失或浅矩阵行、计划/代码不匹配或非空阻塞项都是非干净的。
9. 如果任何通道发现问题，**不要**检查点 `complete` 且**不要**调用 `goal({"op":"complete"})`。改为记录持久阻塞项工作：
   ```sh
   gjc ultragoal record-review-blockers --goal-id <id> --title "解决验证阻塞项" --objective "<阻塞项解决目标>" --evidence "<architect/executor 发现>" --gjc-goal-json <活跃-goal-get-json-或-路径>
   ```
10. 完成或引导通过阻塞项故事，然后重新运行完整的阻塞验证循环。重复直到所有验证者通道干净。
11. 仅在循环干净后，使用结构化质量门和新鲜活跃的 `goal({"op":"get"})` 快照将故事检查点为完成。检查点创建收据；单独的 `goals.json.status` 不是证明。在聚合模式中，最终聚合收据必须在允许 `goal({"op":"complete"})` 之前存在。

原生 `checkpoint --status complete` 命令拒绝缺失或浅的门。`--quality-gate-json` 必须包括：

```json
{
  "architectReview": {
    "architectureStatus": "CLEAR",
    "productStatus": "CLEAR",
    "codeStatus": "CLEAR",
    "recommendation": "APPROVE",
    "evidence": "架构师审查综合，具有架构/产品/代码覆盖",
    "commands": ["架构师审查命令或 agent 证据 id"],
    "blockers": []
  },
  "executorQa": {
    "status": "passed",
    "e2eStatus": "passed",
    "redTeamStatus": "passed",
    "evidence": "executor 构建的 e2e 和红队 QA 命令/结果",
    "e2eCommands": ["bun test:e2e"],
    "redTeamCommands": ["bun test:red-team"],
    "artifactRefs": [
      {
        "id": "browser-run",
        "kind": "browser-automation",
        "path": "artifacts/browser-run.json",
        "description": "调用批准的面向用户流程的浏览器自动化转录"
      },
      {
        "id": "gui-screenshot",
        "kind": "screenshot",
        "path": "artifacts/gui-screenshot.png",
        "description": "GUI/web 结果的截图或图像判决证据"
      },
      {
        "id": "adversarial-report",
        "kind": "failure-mode-test",
        "path": "artifacts/adversarial-report.txt",
        "description": "边界、属性、对抗或失败模式结果"
      }
    ],
    "contractCoverage": [
      {
        "id": "contract-goal",
        "contractRef": "批准的计划/spec/验收标准或面向用户的契约 id",
        "obligation": "来自批准契约的所需行为",
        "status": "covered",
        "surfaceEvidenceRefs": ["surface-gui"],
        "adversarialCaseRefs": ["case-invalid-input"]
      },
      {
        "id": "contract-out-of-scope",
        "contractRef": "有意在此故事范围之外的契约",
        "obligation": "明确省略的批准契约界面",
        "status": "not_applicable",
        "reason": "为什么此契约不适用于当前故事"
      }
    ],
    "surfaceEvidence": [
      {
        "id": "surface-gui",
        "contractRef": "被测的面向用户界面或公共接口",
        "surface": "gui|web|cli|api|package|algorithm|math",
        "invocation": "真实浏览器操作、CLI 命令、API/package 消费者调用或算法/属性检查",
        "verdict": "passed",
        "artifactRefs": ["browser-run", "gui-screenshot"]
      },
      {
        "id": "surface-out-of-scope",
        "contractRef": "有意在此故事范围之外的界面",
        "surface": "gui|web|cli|api|package|algorithm|math",
        "status": "not_applicable",
        "reason": "为什么此界面不适用于当前故事"
      }
    ],
    "adversarialCases": [
      {
        "id": "case-invalid-input",
        "contractRef": "批准的计划/spec/验收标准或面向用户的契约 id",
        "scenario": "边界/属性/对抗/失败模式输入或用户操作",
        "expectedBehavior": "契约要求的拒绝、处理或不变量保持",
        "verdict": "passed",
        "artifactRefs": ["adversarial-report"]
      }
    ],
    "blockers": []
  },
  "iteration": {
    "status": "passed",
    "evidence": "阻塞项不存在或已解决，完整的验证循环已干净地重新运行",
    "fullRerun": true,
    "rerunCommands": ["bun test:e2e", "bun test:red-team"],
    "blockers": []
  }
}
```

收据是新鲜度范围的：
- 每个目标的收据对其目标目标保持新鲜，除非该目标、其阻塞项元数据或其取代元数据发生变化。
- 正常的后续 `goal_started` 或干净的收据支持的 `goal_checkpointed` 事件（对于其他目标）不会使更旧的每目标收据陈旧。
- 追加所需目标或更改最终所需目标状态会使最终聚合收据陈旧。最终聚合完成需要一个新鲜的最终聚合收据，证明没有不完整、阻塞或 `review_blocked` 的所需目标剩余。

## 交接回规划

当聚合 ultragoal 完成或用户请求返回规划/澄清时，标记 ultragoal 就绪以便交接，使 skill 工具的链守卫允许向后过渡：

```
gjc state ultragoal write --input '{"current_phase":"handoff"}' --json
```

skill 工具随后在同一轮次分派 `/skill:ralplan` 或 `/skill:deep-interview` 并在进程中运行 `gjc state ultragoal handoff --to <ralplan|deep-interview> --json` 以原子方式降级 ultragoal、提升被调用者，并同步两个 `skill-active-state.json` 文件。你不需要自己运行交接动词。

## 约束

- shell 命令为活跃 GJC agent 发出面向模型的交接；它不调用任何 `/goal` 斜杠命令，且 agent 循环不得依赖任何 `/goal` 子命令。
- 仅使用来自 agent 循环的统一目标工具界面：`goal({"op":"get"})`、`goal({"op":"create"})`、`goal({"op":"complete"})`、`goal({"op":"drop"})`、`goal({"op":"resume"})`。`drop` 清除活跃目标而不退出目标模式，因此下一个 `goal({"op":"create"})` 在会话中有效。不需要也不存在斜杠命令清理；Ultragoal 从不调用任何 `/goal` 子命令。
- 对于同一会话/线程中背靠背的 ultragoal 运行，当 `goal({"op":"get"})` 仍然报告活跃聚合时，在 `goal({"op":"create"})` 之前调用 `goal({"op":"drop"})`；当不存在活跃目标或先前聚合已经完成或丢弃时，直接调用 `goal({"op":"create"})`。目标工具在 drop 后仍然可调用；不需要也不存在斜杠命令清理。
- 当 `goal({"op":"get"})` 报告不同的活跃目标时，永远不要调用 `goal({"op":"create"})`。
- 除非聚合运行或遗留每个故事目标实际完成，否则永远不要调用 `goal({"op":"complete"})`。
- 在聚合模式中，中间和最终故事检查点需要匹配的 `active` GJC 目标快照；最终故事检查点在 `goal({"op":"complete"})` 可以协调内联目标状态之前创建最终聚合收据。
- 完成检查点需要只读目标快照协调：使用 `--gjc-goal-json` 传递新鲜 `goal({"op":"get"})` JSON/路径；shell 命令和钩子不得变更目标状态。
- 将 `ledger.jsonl` 视为持久审计跟踪；每次成功或失败后检查点。
