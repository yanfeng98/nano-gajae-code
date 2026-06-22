# Upstream Fork 选择性同步指南

## 场景

你在私有 Git 托管平台（如自建 Gitea/GitLab）上维护了一份从某开源仓库分叉出来的私有仓库。两份代码从共同的祖先出发，各自演进：

- **上游**：开源社区持续迭代，不断有新功能和修复合并
- **私有仓库**：你的业务代码持续积累，不能推回上游

现在你需要从上游**精确引入某个功能**（而不是全量合并），同时保持两边历史的可追溯性。

## 术语约定

| 术语 | 含义 |
|:---|:---|
| `upstream` | 上游开源仓库的远程名称（按惯例命名） |
| `origin` | 你的私有仓库远程 |
| `main` | 你的主开发分支 |
| `vendor` | 用于镜像上游主分支的本地跟踪分支（仅读，不开发） |

---

## 第 1 步：在私有平台建立仓库

在私有 Git 托管平台上创建仓库后，假设当初的分叉方式是**完整克隆**：

```bash
# 1. 克隆上游开源仓库（保留完整历史）
git clone https://github.com/upstream-org/open-source-project.git
cd open-source-project

# 2. 将私有仓库设为 origin，推入
git remote rename origin upstream
git remote add origin https://gitea.internal.company.com/my-org/private-project.git
git push -u origin --all
git push -u origin --tags
```

> **关键决策点**：如果你当初用了 `--depth=1` 浅克隆初始化私有仓库，跳过本节，直接看「历史已断开时的降级方案」。

---

## 第 2 步：首次同步上游

在私有仓库的工作副本中：

```bash
# 确保 upstream 远程还在（第 1 步已改名或添加）
git remote -v
# 应该看到：
# origin    https://gitea.internal.company.com/my-org/private-project.git (fetch)
# origin    https://gitea.internal.company.com/my-org/private-project.git (push)
# upstream  https://github.com/upstream-org/open-source-project.git (fetch)
# upstream  https://github.com/upstream-org/open-source-project.git (push)

# 拉取上游最新
git fetch upstream
```

---

## 第 3 步：定位你当初的分叉基点

```bash
# 找到 main 和 upstream/main 的公共祖先
MERGE_BASE=$(git merge-base main upstream/main)
echo "公共祖先: $MERGE_BASE"

# 看看自己的 main 分支从公共祖先以来做了哪些提交
git log --oneline $MERGE_BASE..main

# 看看上游从公共祖先以来做了哪些提交
git log --oneline $MERGE_BASE..upstream/main
```

如果 `git merge-base` 返回空或报错，说明两个仓库的历史已经断开，跳到「历史已断开时的降级方案」。

---

## 第 4 步：精确定位要引入的功能

这是整个流程中最重要的一步——精确找到目标功能对应的一组提交。

```bash
# 方法 1：按路径过滤，列出上游某个模块的所有提交
git log --oneline $MERGE_BASE..upstream/main -- src/feature-x/

# 方法 2：按关键字在 commit message 中搜索
git log --oneline $MERGE_BASE..upstream/main --grep="rate limiter"

# 方法 3：按作者搜索
git log --oneline $MERGE_BASE..upstream/main --author="Zhang"

# 方法 4：交互式浏览
git log --oneline --graph $MERGE_BASE..upstream/main -- src/feature-x/
```

确认提交列表后，逐个检查每个提交的完整 diff，确保没有引入无关改动：

```bash
git show <commit-hash>
git show <commit-hash> --stat
```

---

## 第 5 步：Cherry-Pick 摘取

### 5.1 单个功能（连续提交）

```bash
# 格式：cherry-pick 从 <start> 的下一个到 <end>
git cherry-pick -x <start-commit>^..<end-commit>

# 示例：摘取 commit abc 到 def 之间的 4 个提交
git cherry-pick -x abc^..def

# 如果你想要从 abc 本身开始摘（含 abc）
git cherry-pick -x abc~1^..def   # abc~1 是 abc 的父提交
```

### 5.2 多个零散功能（不连续提交）

```bash
git cherry-pick -x <commit1> <commit2> <commit3>
```

### 5.3 `-x` 标志的作用

`-x` 在提交消息末尾追加一行：

```
(cherry picked from commit 3f4a9b2c1d)
```

这是你未来判断「哪些上游提交已经摘过了」的唯一可靠标记。**强烈建议始终使用 `-x`**。

### 5.4 Cherry-Pick 冲突解决

```bash
# 冲突时，正常解决冲突后：
git add <resolved-files>
git cherry-pick --continue

# 如果想放弃本次 cherry-pick：
git cherry-pick --abort
```

---

## 第 6 步：追踪已摘取的提交

```bash
# 列出上游中有、但你还没 cherry-pick 的提交
git cherry -v main upstream/main
```

输出解读：

```
+ 3f4a9b2 Add rate limiter middleware      # + 号：还没摘
- 7c8d1e3 Fix memory leak in parser        # - 号：已经摘了（因为有 -x 标记）
+ a1b2c3d Refactor error handling
```

> **注意**：`git cherry` 依赖 `-x` 生成的 `cherry-picked from` 行来匹配。如果没有 `-x`，即使内容一模一样，`git cherry` 也会标记为 `+`。

---

## 第 7 步：建立 Vendor 分支做长期维护

这个模式让你始终有一个纯净的上游镜像，不需要每次 fetch 后重新算 merge-base。

### 7.1 初始化

```bash
# 从上游 main 创建 vendor 分支
git checkout -b vendor upstream/main

# 推送到私有仓库（只读镜像，方便其他同事访问）
git push -u origin vendor
```

### 7.2 每次同步上游

```bash
git fetch upstream
git checkout vendor
git merge upstream/main --ff-only   # 永远快进，不在 vendor 上开发
git push origin vendor

# 回到开发分支
git checkout main
```

### 7.3 从 Vendor 选择要摘的提交

```bash
# 查看 vendor 相对于上次同步点新增了哪些提交
git log --oneline <last-sync-commit>..vendor -- src/feature-you-care-about/

# 摘取
git cherry-pick -x <commit>

# 记录本次同步点（打 tag 或记到某个文件中）
git tag sync-2026-06-22 vendor
```

---

## 第 8 步：历史已断开时的降级方案

如果 `git merge-base main upstream/main` 失败，说明两个仓库的历史没有交集。降级方案是 `git format-patch` + `git am --3way`。

### 8.1 在上游仓库生成补丁

在能访问上游的机器的上游仓库中：

```bash
cd upstream-repo

# 生成目标功能范围内的所有提交为 patch 文件
git format-patch \
  --output-directory=/tmp/patches \
  <base-commit>..<feature-head> \
  -- src/feature-x/

# 生成的文件如：
# /tmp/patches/0001-Add-rate-limiter.patch
# /tmp/patches/0002-Add-tests-for-rate-limiter.patch
```

### 8.2 在私有仓库应用补丁

把 `/tmp/patches/` 目录传到私有仓库的工作机上，然后：

```bash
cd private-repo

# 批量应用，--3way 让 git 做三路上下文合并
git am --3way /tmp/patches/*.patch

# 如果某些 patch 有冲突：
# 解决冲突后：
git add <resolved-files>
git am --continue

# 跳过某个不兼容的 patch：
git am --skip

# 放弃整个 am 操作：
git am --abort
```

### 8.3 `--3way` 的工作原理

即使两个仓库没有共同的 git 对象历史，`git am --3way` 会根据 patch 的上下文 blob hash 进行三路合并——效果近似 cherry-pick。它不是完美的，但对于历史断开的情况是最佳可行方案。

---

## 第 9 步：测试 & 验证

```bash
# 1. 确认 cherry-pick 后的 diff 与上游目标提交一致
git diff <your-cherry-pick-commit> main -- src/feature-x/

# 2. 跑你的测试套件
make test   # 或你项目使用的测试命令

# 3. 如果功能涉及 API 变更，确认你的业务代码仍然兼容
```

---

## 完整工作流速查

```bash
# === 每次想从上游同步功能时的标准流程 ===

# 1. 更新上游镜像
git fetch upstream
git checkout vendor && git merge upstream/main --ff-only && git checkout main

# 2. 列出上游新增提交
git log --oneline sync-2026-06-22..vendor -- src/target-feature/

# 3. 逐段 cherry-pick
git cherry-pick -x <start>^..<end>

# 4. 记录同步点
git tag sync-$(date +%Y-%m-%d) vendor

# 5. 验证
# (跑测试，确认 diff)

# 6. 检查还有哪些没摘
git cherry -v main upstream/main
```

---

## 最佳实践

1. **永远使用 `-x`**。它是 `git cherry` 和未来维护者判断 cherry-pick 状态的基础。
2. **按功能粒度 cherry-pick**。不要一次摘 50 个提交，按功能拆成 3-8 个提交为一组。
3. **Vendor 分支不做开发**。vendor 是只读镜像，永远只做 `--ff-only` 合并。
4. **用 tag 记录同步点**。每次成功同步后打一个 tag（如 `sync-2026-06-22`），方便下次只查看增量。
5. **Cherry-pick 前先看 diff**。`git show <commit>` 确认没有把不该带的文件带进来。
6. **文档化依赖关系**。如果某个功能依赖上游的基础设施变更（如类型定义、工具函数），先摘依赖链，再摘功能本身。
7. **冲突解决后验证语义**。Cherry-pick 能解决的只是文本冲突；逻辑冲突（如上游改了某个函数的签名但你已经在私有仓库中删掉了那个调用点）需要人工判断。

---

## 参考

- 此工作流与 Linux 内核子系统的 `git cherry-pick -x` + `git cherry` 模式一致，经过 20 年大型项目验证。
- `git-cherry(1)`, `git-cherry-pick(1)`, `git-am(1)`, `git-merge-base(1)` manual pages.
