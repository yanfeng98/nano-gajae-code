# Rust 学习指南（基于 Gajae-Code 实战）

> 这篇指南面向会编程但没学过 Rust 的开发者，以本项目实际用到的 Rust 知识为主线，从零开始覆盖环境安装到 N-API 绑定。每个知识点都附带本项目的真实代码示例。

---

## 目录

1. [环境安装](#1-环境安装)
2. [基础语法](#2-基础语法)
3. [所有权系统](#3-所有权系统)
4. [结构体与枚举](#4-结构体与枚举)
5. [Trait 与泛型](#5-trait-与泛型)
6. [错误处理](#6-错误处理)
7. [集合与迭代器](#7-集合与迭代器)
8. [智能指针](#8-智能指针)
9. [并发与异步](#9-并发与异步)
10. [宏系统](#10-宏系统)
11. [Unsafe Rust 与 FFI](#11-unsafe-rust-与-ffi)
12. [N-API 绑定](#12-n-api-绑定)
13. [属性与条件编译](#13-属性与条件编译)
14. [序列化（Serde）](#14-序列化serde)
15. [测试与 Cargo 工作区](#15-测试与-cargo-工作区)

---

## 1. 环境安装

### 1.1 安装 Rust

本项目需要 **Rust >= 1.85**（因为使用 `edition = "2024"` 和 `resolver = "3"`）。

**官方安装：**

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# 重启终端
rustc --version  # 确认 >= 1.85
```

**国内镜像加速（清华）：**

```sh
export RUSTUP_DIST_SERVER=https://mirrors.tuna.tsinghua.edu.cn/rustup
export RUSTUP_UPDATE_ROOT=https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**不要用 `apt install cargo`**：Ubuntu 仓库自带的 Rust 版本过旧（如 1.75），不支持 `edition = "2024"`。

### 1.2 Cargo 常用命令

| 命令 | 说明 |
|------|------|
| `cargo build` | 编译（debug 模式） |
| `cargo build --release` | 编译（release 优化模式） |
| `cargo run` | 编译并运行 |
| `cargo test` | 运行测试 |
| `cargo check` | 快速检查类型/借用（比 build 更快） |
| `cargo fmt` | 格式化代码 |
| `cargo clippy` | 运行 linter |
| `cargo doc --open` | 生成并打开文档 |

本项目通过 Bun 调度 Cargo（`bun run build:native` 实际调用 `napi build`，底层用 Cargo 编译）。

### 1.3 项目中的 Rust 开发流程

```sh
# 安装 Rust 后
bun install
bun run build:native     # 编译 pi-natives (.node 文件)
bun run install:dev      # 链接 + 安装技能文件
bun run dev              # 从 TS 源码运行 CLI
```

### 1.4 Cargo.toml 是什么

相当于 Python 的 `pyproject.toml` / `setup.py` 或 Node.js 的 `package.json`。

本项目的根 `Cargo.toml` 是一个 **workspace** 清单（见第 15 章），管理 `crates/` 下所有子包。

---

## 2. 基础语法

### 2.1 变量绑定

```rust
let x = 5;            // 不可变绑定
let mut y = 10;       // 可变绑定
y = 20;               // OK
// x = 6;             // 编译错误！

const MAX: u32 = 100; // 编译期常量，必须标注类型
```

**本项目示例** — `let` / `let mut` 变量绑定 (`crates/brush-builtins-vendored/src/printf.rs:33, 73`)：
```rust
// let — 不可变变量
let result_str = String::from_utf8(result).map_err(|_| { ... });

// let mut — 可变变量
let mut result = escape::quote_if_needed(arg, escape::QuoteMode::BackslashEscape).to_string();
```

### 2.2 标量类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `i32` | 32 位有符号整数 | `-5, 0, 42` |
| `u32` | 32 位无符号整数 | `0, 42` |
| `u64` | 64 位无符号整数 | `0, 1000` |
| `usize` | 指针大小无符号整数 | 数组索引 |
| `f64` | 64 位浮点数 | `3.14` |
| `bool` | 布尔值 | `true, false` |
| `char` | Unicode 字符 | `'a', '中'` |

类型转换必须显式（用 `as`）：
```rust
let n: i32 = 42;
let m: u64 = n as u64;  // 显式转换
```

**本项目示例** — `as` 转换 (`crates/brush-builtins-vendored/src/shift.rs:24-25`)：
```rust
let n = n as usize;  // i32 → usize 显式转换
```

### 2.3 复合类型

**元组 (Tuple)**：
```rust
let tup: (i32, f64, bool) = (42, 3.14, true);
let (x, y, z) = tup;       // 解构
let first = tup.0;          // 按索引访问
```

**数组 (Array)**（固定长度，栈分配）：
```rust
let arr: [i32; 5] = [1, 2, 3, 4, 5];
let zeros = [0; 100];       // 100 个 0
```

**切片 (Slice)**（对数组/向量的引用）：
```rust
let s: &[i32] = &arr[1..3]; // [2, 3]
```

**本项目示例** — 元组解构 (`crates/brush-builtins-vendored/src/times.rs:17`) + 数组 (`crates/pi-shell/src/minimizer/filters/system.rs:425`)：
```rust
// 元组解构：从函数返回的元组中提取两个值
let (self_user, self_system) = get_self_user_and_system_time()?;

// 数组字面量
let source_extensions = ["rs", "py", "js", "jsx", "ts", "tsx"];

### 2.4 函数

```rust
fn add(a: i32, b: i32) -> i32 {
    a + b   // 最后表达式作为返回值，不需要 return
}

fn greet(name: &str) -> String {
    format!("Hello, {name}!")  // return 关键字也可用
}
```

**本项目示例** (`crates/pi-iso/src/lib.rs:164-166`)：
```rust
pub fn unavailable(reason: impl Into<String>) -> Self {
    Self { available: false, reason: Some(reason.into()) }
}
```

`impl Into<String>` 是泛型参数的语法糖，第 5 章详述。

### 2.5 控制流

**if/else** — 是表达式，可返回值：
```rust
let n = if condition { 5 } else { 10 };
```

**loop** — 无限循环：
```rust
loop {
    // ...
    if done { break; }
}
```

**while / for**：
```rust
while x > 0 { x -= 1; }

for item in &vec {          // 遍历引用（不消耗所有权）
    println!("{item}");
}
for (i, item) in vec.iter().enumerate() {  // 带索引
    println!("{i}: {item}");
}
```

**本项目示例** — for 循环解构 (`crates/pi-shell/src/shell.rs:495`)：
```rust
for (key, value) in std::env::vars() {
    // ...
}
```

---

## 3. 所有权系统

这是 Rust 最核心、最独特的部分。

### 3.1 所有权规则

1. Rust 中每个值有且仅有一个 **所有者 (owner)**
2. 所有者离开作用域时，值被自动释放 (drop)
3. 赋值 / 传参会 **转移所有权**（move 语义），除实现了 `Copy` trait 的类型外

```rust
let s1 = String::from("hello");
let s2 = s1;            // s1 的所有权 **移动** 给了 s2
// println!("{s1}");   // 编译错误！s1 已失效

let n1 = 5;
let n2 = n1;            // i32 实现了 Copy，n1 仍然有效
println!("{n1}");       // OK
```

### 3.2 引用与借用

不转移所有权的访问方式：

```rust
let s = String::from("hello");
foo(&s);                // 不可变引用（共享借用）
println!("{s}");        // s 仍然有效

fn foo(s: &String) {   // 借用了 s
    // s.push(", world"); // 编译错误！不可变引用不能修改
}
```

**可变引用** `&mut T`：
```rust
let mut s = String::from("hello");
bar(&mut s);            // 可变引用（独占借用）

fn bar(s: &mut String) {
    s.push_str(", world");
}
```

**关键规则**：同一时刻，要么一个可变引用，要么任意多个不可变引用，二者不能共存。

**本项目示例** — 函数参数大量使用 `&Path`, `&str` 等不可变引用 (`crates/pi-iso/src/lib.rs:224-230`)：
```rust
#[async_trait]
pub trait IsolationBackend: Send + Sync {
    fn kind(&self) -> BackendKind;
    fn start(&self, lower: &Path, merged: &Path) -> IsoResult<()>;
    fn stop(&self, merged: &Path) -> IsoResult<()>;
}
```

### 3.3 生命周期

编译器通过 **生命周期标注** (`'a`) 确保引用不会悬垂。大部分情况下编译器自动推断，复杂场景需手动标注。

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
// 'a 表示：返回值引用的生命周期 = min(x 的生命周期, y 的生命周期)
```

**本项目示例** — 带生命周期标注的结构体 (`crates/pi-shell/src/minimizer.rs:24-33`)：
```rust
pub struct MinimizerCtx<'a> {
    pub program:    &'a str,
    pub subcommand: Option<&'a str>,
    pub command:    &'a str,
    pub config:     &'a MinimizerConfig,
}
```

`Cow<'q, str>` 是一种"写时克隆"模式 (`crates/pi-ast/src/language/mod.rs:89`)：
```rust
fn pre_process_pattern<'q>(&self, query: &'q str) -> Cow<'q, str> {
    // 尽量返回引用，只在必要时才 clone
}
```

---

## 4. 结构体与枚举

### 4.1 结构体定义与方法

```rust
#[derive(Debug, Clone)]   // 自动实现 Debug, Clone trait
pub struct Point {
    pub x: f64,           // pub 字段外部可访问
    pub y: f64,
}

impl Point {              // impl 块实现方法
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn distance(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}
```

**本项目示例** (`crates/pi-shell/src/shell.rs:69-74`)：
```rust
#[derive(Debug, Clone, Default)]
pub struct ShellOptions {
    pub session_env:   Option<HashMap<String, String>>,
    pub snapshot_path: Option<String>,
    pub minimizer:     Option<minimizer::MinimizerOptions>,
}
```

- `#[derive(Default)]` 自动生成 `Default::default()` 构造
- `Option<T>` — 要么 `Some(T)`，要么 `None`
- `HashMap<String, String>` — 键值对集合

### 4.2 impl 块

```rust
impl Shell {
    pub fn new(options: Option<ShellOptions>) -> Self {
        Self { inner: Arc::new(CoreShell::new(options.map(Into::into))) }
    }
}
```

`self` （小写）是方法的第一个参数（类似于 Python 的 `self`，但需显式声明）：
- `&self` — 不可变借用
- `&mut self` — 可变借用
- `self` — 消耗所有权

### 4.3 枚举

```rust
enum BackendKind {
    Apfs,              // 无数据变体
    Btrfs,
    Overlayfs,
    Projfs,
}

enum IsoError {
    Unavailable(String),  // 带数据的变体
    Other(String),
}
```

**本项目示例** — 枚举 + `match` 结合 (`crates/pi-iso/src/lib.rs:70-81`)：
```rust
pub const fn as_str(self) -> &'static str {
    match self {
        Self::Apfs => "apfs",
        Self::Btrfs => "btrfs",
        Self::Overlayfs => "overlayfs",
        Self::Projfs => "projfs",
        // ...
    }
}
```

### 4.4 `#[repr]` 用于 FFI

**本项目示例** — `#[repr(C)]` 匹配 C 结构体布局 (`crates/pi-shell/src/process.rs:673`)：
```rust
#[repr(C)]
#[allow(non_snake_case, reason = "Windows PROCESSENTRY32W field names must match Win32 ABI")]
struct PROCESSENTRY32W {
    dwSize:              u32,
    cntUsage:            u32,
    th32ProcessID:       u32,
    th32DefaultHeapID:   usize,
    th32ModuleID:        u32,
    cntThreads:          u32,
    th32ParentProcessID: u32,
    pcPriClassBase:      i32,
    dwFlags:             u32,
    szExeFile:           [u16; 260],
}
```

`#[repr(u8)]` 用于小整数枚举 (`crates/pi-shell/src/cancel.rs:12-19`)：
```rust
#[derive(Debug, Clone, Copy)]
#[repr(u8)]  // 每个变体存为一个字节
pub enum AbortReason {
    Unknown = 1,
    Timeout = 2,
    Signal  = 3,
    User    = 4,
}
```

### 4.5 模式匹配

```rust
// match — 穷举
match value {
    Some(x) => println!("Got {x}"),
    None => println!("Got nothing"),
}

// if let — 只匹配一个模式
if let Some(x) = value {
    println!("Got {x}");
}

// let-else — 失败时提前返回 (Rust 1.65+)
let Some(env) = env else {
    return Ok(false);
};

// matches! — 返回 bool
let is_none = matches!(mode, MinimizerMode::None);
```

**本项目示例** — `let-else` (`crates/pi-shell/src/shell.rs:1035-1037`)：
```rust
let Some(env) = env else {
    return Ok(false);
};
```

---

## 5. Trait 与泛型

Trait 类似于 Java 的 Interface / Go 的 Interface / Python 的 Protocol。

### 5.1 Trait 定义与实现

**本项目示例** (`crates/pi-iso/src/lib.rs:224-246`)：
```rust
#[async_trait]
pub trait IsolationBackend: Send + Sync {
    fn kind(&self) -> BackendKind;
    fn probe(&self) -> ProbeResult;
    fn start(&self, lower: &Path, merged: &Path) -> IsoResult<()>;
    fn stop(&self, merged: &Path) -> IsoResult<()>;
}
```

`Send + Sync` 是 trait bound，表示实现者必须线程安全。`#[async_trait]` 宏允许 trait 中有 `async fn`。

**实现 trait**：
```rust
impl IsolationBackend for OverlayfsBackend {
    fn kind(&self) -> BackendKind { BackendKind::Overlayfs }
    fn start(&self, lower: &Path, merged: &Path) -> IsoResult<()> {
        // 具体实现...
    }
    // ...
}
```

### 5.2 泛型函数

```rust
fn max<T: PartialOrd>(a: T, b: T) -> T {
    if a > b { a } else { b }
}
// T: PartialOrd 是 "trait bound" — T 必须能比较大小
```

**本项目示例** — 复杂泛型约束 (`crates/pi-natives/src/task.rs:209-218`)：
```rust
pub fn blocking<T, F>(
    tag: &'static str,
    cancel_token: impl Into<CancelToken>,
    work: F,
) -> AsyncTask<Blocking<T>>
where
    F: FnOnce(CancelToken) -> Result<T> + Send + 'static,
    T: ToNapiValue + TypeName + Send + 'static,
{ /* ... */ }
```

解读泛型参数：
- `T` — 任意类型，需实现 `ToNapiValue + TypeName + Send + 'static`
- `F` — 闭包类型, `FnOnce(CancelToken) -> Result<T>` 表示被调用一次
- `impl Into<CancelToken>` — 接受任何能转换为 `CancelToken` 的类型

### 5.3 From / Into / TryFrom

Rust 标准库中的核心转换 trait。本项目大量使用。

**`From<T> for U`** — 定义 `T → U` 的转换 (`crates/pi-natives/src/shell.rs:47-56`)：
```rust
impl From<MinimizerOptions> for minimizer::MinimizerOptions {
    fn from(value: MinimizerOptions) -> Self {
        Self {
            enabled: value.enabled,
            // ...
        }
    }
}
```

实现 `From<T>` 后自动获得 `Into<U>`。在函数参数中使用：
```rust
fn foo(opts: impl Into<MinimizerOptions>) { /* 接受任何可转换类型 */ }
```

**`TryFrom`** — 可失败的转换 (`crates/pi-shell/src/cancel.rs:21-33`)：
```rust
impl TryFrom<u8> for AbortReason {
    type Error = ();
    fn try_from(value: u8) -> std::result::Result<Self, ()> {
        match value {
            2 => Ok(Self::Timeout),
            3 => Ok(Self::Signal),
            4 => Ok(Self::User),
            _ => Ok(Self::Unknown),
        }
    }
}
```

---

## 6. 错误处理

Rust 用 `Result<T, E>` 枚举表示可能出错的操作，没有 exception/throw。

### 6.1 Result 与 ? 运算符

```rust
fn read_file(path: &str) -> Result<String, io::Error> {
    let content = std::fs::read_to_string(path)?;  // 出错时立即向上传播
    Ok(content)
}
// ? 等价于：
// let content = match std::fs::read_to_string(path) {
//     Ok(v) => v,
//     Err(e) => return Err(e.into()),
// };
```

**本项目示例** — 连续 `?` 传播错误 (`crates/brush-builtins-vendored/src/let_.rs:29-30`)：
```rust
let parsed = brush_parser::arithmetic::parse(expr.as_str())?;
let evaluated = parsed.eval(context.shell)?;
```
每行末尾的 `?` 表示：成功则取出值继续，失败则立即向上返回错误。

### 6.2 自定义错误类型

**本项目示例** (`crates/pi-iso/src/lib.rs:176-199`)：
```rust
#[derive(Debug, Clone)]
pub enum IsoError {
    Unavailable(String),
    Other(String),
}

impl std::error::Error for IsoError {}  // 实现 Error trait

impl std::fmt::Display for IsoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(msg) => write!(f, "unavailable: {msg}"),
            Self::Other(msg) => write!(f, "{msg}"),
        }
    }
}

pub type IsoResult<T> = Result<T, IsoError>;  // 类型别名
```

### 6.3 anyhow

`anyhow` 是一个"我不关心具体错误类型"的通用错误库：

```rust
use anyhow::{Error, Result};

fn do_things() -> Result<()> {
    let data = std::fs::read_to_string("config.toml")
        .map_err(|e| Error::msg(format!("Failed to read config: {e}")))?;
    Ok(())
}
```

项目中 `pi-shell` 广泛使用 `anyhow::Result` 作为返回值。

### 6.4 N-API 错误

N-API 侧有特殊错误类型 (`crates/pi-natives/src/sixel.rs:43`)：
```rust
.map_err(|err| Error::from_reason(format!("Failed to encode SIXEL: {err}")))
```

---

## 7. 集合与迭代器

### 7.1 标准集合

| 类型 | 说明 |
|------|------|
| `Vec<T>` | 动态数组（堆分配） |
| `HashMap<K, V>` | 哈希表 |
| `HashSet<T>` | 哈希集合（去重） |
| `BTreeMap<K, V>` | 有序映射 |
| `String` | UTF-8 字符串（堆分配） |

**本项目示例** — `HashMap` 创建 (`crates/brush-builtins-vendored/src/factory.rs:27-28`) + `Vec` 创建 (`crates/brush-builtins-vendored/src/printf.rs:29`)：
```rust
// 创建空 HashMap，指定键值类型
let mut m = HashMap::<String, builtins::Registration<SE>>::new();

// 创建空 Vec
let mut result: Vec<u8> = vec![];
```

### 7.2 SmallVec

`smallvec` crate 提供"小数组栈分配、大数组堆分配"的优化：

**本项目示例** (`crates/pi-shell/src/process.rs:1155`)：
```rust
fn build_process_tree() -> HashMap<u32, SmallVec<[u32; 4]>> {
    // 大多数进程只有 1-2 个子进程，用 [u32; 4] 栈分配避免堆分配
}
```

### 7.3 phf — 编译期完美哈希

**本项目示例** (`crates/pi-ast/src/language/mod.rs:923-977`)：
```rust
static CORE_LANG_ALIASES: phf::Map<&'static str, SupportLang> = phf_map! {
    "bash" => SupportLang::Bash,
    "c" => SupportLang::C,
    "rust" => SupportLang::Rust,
    "python" => SupportLang::Python,
    "javascript" => SupportLang::JavaScript,
    // ... 50+ 种语言
};
```
`phf_map!` 在编译期生成完美哈希表，运行时查询零冲突。

### 7.4 迭代器

Iterator 是 Rust 的核心抽象，惰性、可链式调用：

```rust
let even_squares: Vec<i32> = (0..10)
    .filter(|n| n % 2 == 0)   // 过滤偶数
    .map(|n| n * n)            // 平方
    .collect();                // 收集到 Vec
```

**本项目示例** — 多步迭代器链 (`crates/pi-ast/src/language/mod.rs:485-492`)：
```rust
static SORTED_ALIASES: LazyLock<Box<[&'static str]>> = LazyLock::new(|| {
    let aliases = CORE_LANG_ALIASES.keys().copied().collect::<Vec<_>>();
    let mut aliases = aliases.into_boxed_slice();
    aliases.sort_unstable();
    aliases
});
```

---

## 8. 智能指针

### 8.1 Box\<T\> — 堆分配

```rust
let x = Box::new(5);  // 在堆上分配一个 i32

// Box<dyn Trait> — 类型擦除（动态分发）
work: Option<Box<dyn FnOnce(CancelToken) -> Result<T> + Send>>
```

**本项目示例** — `Box::new` 基本用法 (`crates/brush-builtins-vendored/src/declare.rs:427-428`)：
```rust
// 用 Box 包装闭包，使其可存入 Vec<Box<dyn Fn(...)>>
let mut filters: Vec<Box<dyn Fn((&String, &ShellVariable)) -> bool>> =
    vec![Box::new(|(_, v)| v.is_enumerable())];
```

`Box::pin` 用法 (`crates/pi-shell/src/shell.rs:689-690`)：
```rust
let mut idle_timer = Box::pin(time::sleep(POST_EXIT_IDLE));
let mut max_timer = Box::pin(time::sleep(POST_EXIT_MAX));
```
`Box::pin` 将 Future 固定在堆上，确保内存地址不变（tokio 的 `select!` 需要）。

### 8.2 Arc\<T\> — 原子引用计数（共享所有权）

```rust
let shared = Arc::new(SomeData::new());
let clone1 = Arc::clone(&shared);  // 引用计数 +1
let clone2 = Arc::clone(&shared);  // 引用计数 +2
```

**本项目示例** — Shell 内部用 `Arc` 包装 (`crates/pi-natives/src/shell.rs:192`)：
```rust
pub fn new(options: Option<ShellOptions>) -> Self {
    Self { inner: Arc::new(CoreShell::new(options.map(Into::into))) }
}
```

### 8.3 Weak\<T\> — 弱引用，避免循环引用

```rust
let weak = Arc::downgrade(&shared);   // 不影响引用计数
if let Some(strong) = weak.upgrade() {  // 运行时升为 Arc
    // 使用 strong
}
```

**本项目示例** — `CancelToken` 用 `Weak` 避免循环引用 (`crates/pi-shell/src/cancel.rs:128-131`)：
```rust
pub fn abort_token(&self) -> AbortToken {
    AbortToken(self.flag.as_ref().map(Arc::downgrade))
}
```

### 8.4 LazyLock / OnceLock — 延迟初始化

```rust
// LazyLock: 首次使用时初始化
static SYNTAX_SET: LazyLock<SyntaxSet> = LazyLock::new(SyntaxSet::load_defaults_newlines);

// OnceLock: 可设置一次
static SCOPE_MATCHERS: OnceLock<ScopeMatchers> = OnceLock::new();
```

**核心区别**：`LazyLock` 初始化函数在定义时就绑定；`OnceLock` 在运行时 `.set()`。两者都是线程安全的。

### 8.5 RefCell — 单线程内部可变性

```rust
// thread_local! 确保每个线程独立一份
thread_local! {
    static SCRATCH: RefCell<String> = const { RefCell::new(String::new()) };
}

// 使用时：
SCRATCH.with(|cell| {
    let mut s = cell.borrow_mut();
    s.push_str("hello");
});
```

---

## 9. 并发与异步

本项目大量使用 tokio 异步运行时。

### 9.1 async fn / .await

```rust
async fn fetch_data() -> Result<Data> {
    let response = client.get("https://...").await?;  // .await 暂停执行
    Ok(response.json().await?)
}
```

`async fn` 会将函数编译为一个匿名 Future 类型。只有调用 `.await` 时才真正执行。

**本项目示例** (`crates/pi-shell/src/shell.rs:234-240`)：
```rust
async fn run_shell_session(
    session: Arc<TokioMutex<Option<ShellSessionCore>>>,
    abort_state: ShellAbortState,
    config: ShellConfig,
    run_config: ShellRunConfig,
    on_chunk: Option<mpsc::UnboundedSender<String>>,
    ct: &mut CancelToken,
) -> Result<ShellRunResult> { /* ... */ }
```

### 9.2 tokio::spawn — 启动异步任务

**本项目示例** (`crates/pi-shell/src/shell.rs:245-260`)：
```rust
let mut run_task = tokio::spawn({
    let session = session.clone();
    async move {
        // 在独立 task 中运行 shell 会话
    }
});
```

`async move { ... }` 将外部变量所有权移动到闭包内。

### 9.3 tokio::select! — 并发等待多个 Future

这是 tokio 中最重要的宏之一，类似于 Go 的 `select {}`：

**本项目示例** (`crates/pi-shell/src/shell.rs:262-286`)：
```rust
let res = tokio::select! {
    res = &mut run_task => res,                    // 分支 1: 任务完成
    reason = ct.wait() => {                        // 分支 2: 收到取消信号
        tokio_cancel.cancel();
        // ...
    }
};
```

**带 if guard 的 select!** (`crates/pi-shell/src/shell.rs:863-880`)：
```rust
tokio::select! {
    res = &mut stdout_handle, if !stdout_finished => { /* ... */ }
    res = &mut stderr_handle, if !stderr_finished => { /* ... */ }
    msg = activity_rx.recv() => { /* ... */ }
    () = &mut idle_timer => break,
    () = &mut max_timer => break,
}
```

### 9.4 tokio::sync 通道

```rust
// mpsc: 多生产者单消费者
let (tx, mut rx) = mpsc::channel::<String>(64);
tx.send("hello".to_string()).await?;
let msg = rx.recv().await;

// oneshot: 单次投递
let (tx, rx) = tokio::sync::oneshot::channel::<i32>();
tx.send(42).unwrap();
let value = rx.await.unwrap();
```

**本项目示例** — `oneshot` 获取子进程 PID (`crates/pi-shell/src/shell.rs:1719`)：
```rust
let (pid_tx, pid_rx) = tokio::sync::oneshot::channel::<i32>();
```

### 9.5 CancellationToken — 优雅取消

**本项目示例** (`crates/pi-shell/src/shell.rs:242, 265`)：
```rust
let tokio_cancel = CancellationToken::new();
// ... 传给 task
tokio_cancel.cancel();  // 从外部取消
```

### 9.6 Atomic 原子类型

**本项目示例** — `AtomicU8` 无锁状态 (`crates/pi-shell/src/cancel.rs:36-63`)：
```rust
struct Flag {
    reason:   AtomicU8,
    notifier: Notify,
}

fn abort(&self, reason: AbortReason) {
    let old = self.reason.swap(reason as u8, Ordering::SeqCst);
    if old == 0 {
        self.notifier.notify_waiters();
    }
}
```
`Ordering::SeqCst` 保证全局顺序一致性。

### 9.7 parking_lot::Mutex

比标准库 `std::sync::Mutex` 更快：

**本项目示例** (`crates/pi-natives/src/prof.rs:10`)：
```rust
use parking_lot::Mutex;
static PROFILE_BUFFER: LazyLock<Mutex<CircularBuffer>> =
    LazyLock::new(|| Mutex::new(CircularBuffer::new(MAX_SAMPLES)));
```

### 9.8 rayon — 数据并行

```rust
use rayon::prelude::*;
items.par_iter().for_each(|item| process(item));  // 并行处理
```

**本项目示例** — 并行搜索文件 (`crates/pi-natives/src/grep.rs:1187-1191`)：
```rust
let raw: Vec<Option<FileSearchResult>> = entries
    .par_iter()          // 并行迭代，等价于 .iter() 但多线程
    .map_init(
        || build_searcher_for_params(file_params),
        |searcher, entry| {
            let bytes = read_file_bytes(&entry.path).ok()??;
            // ...
        },
    )
    .collect();
```

---

## 10. 宏系统

### 10.1 声明宏 macro_rules!

类似 C 预处理器的模板替换，但有语法感知。

**本项目的 `env_uint!` 宏** (`crates/pi-natives/src/utils.rs:1-26`)：

```rust
#[macro_export]
macro_rules! env_uint {
    // 模式 1: 带 clamp 范围的
    ($( $vis:vis static $name:ident : $type:ty = $env:literal or $default:expr
       => [$min:expr, $max:expr];)*) => {
        $(
            $vis static $name: std::sync::LazyLock<$type> = std::sync::LazyLock::new(|| {
                std::env::var($env)
                    .ok()
                    .and_then(|v| std::str::FromStr::from_str(&v).ok())
                    .unwrap_or($default)
                    .clamp($min, $max)
            });
        )*
    };
    // 模式 2: 不带 clamp 范围的
    ($( $vis:vis static $name:ident : $type:ty = $env:literal or $default:expr;)*) => {
        $(
            $vis static $name: std::sync::LazyLock<$type> = std::sync::LazyLock::new(|| {
                std::env::var($env)
                    .ok()
                    .and_then(|v| std::str::FromStr::from_str(&v).ok())
                    .unwrap_or($default)
            });
        )*
    };
}

// 使用：
env_uint! {
    pub(crate) static MAX_LINES: u32 = "GJC_MAX_LINES" or 1000 => [1, 10000];
    pub(crate) static TIMEOUT_MS: u64 = "GJC_TIMEOUT" or 5000;
}
```

**`execute_lang_method!`** — 50+ 种语言的宏分发 (`crates/pi-ast/src/language/mod.rs:638-737`)：
```rust
macro_rules! execute_lang_method {
    ($me:expr, $method:ident, $($pname:tt),*) => {
        use SupportLang as S;
        match *$me {
            S::Bash => Bash.$method($($pname,)*),
            S::C => C.$method($($pname,)*),
            S::Rust => Rust.$method($($pname,)*),
            // ... 50+ arms ...
        }
    };
}
```

### 10.2 派生宏 #[derive(...)]

最常用，编译期自动为类型生成 trait 实现：

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MinimizerResult { /* ... */ }
```

常用 derive：
| 宏 | 生成的 trait | 作用 |
|----|-------------|------|
| `#[derive(Debug)]` | `std::fmt::Debug` | 调试打印 `{:?}` |
| `#[derive(Clone)]` | `std::clone::Clone` | 深拷贝 `.clone()` |
| `#[derive(Copy)]` | `std::marker::Copy` | 按位复制（只能用于小类型） |
| `#[derive(Default)]` | `std::default::Default` | 默认值 |
| `#[derive(PartialEq, Eq)]` | 相等比较 | `==` 和 `!=` |
| `#[derive(Hash)]` | `std::hash::Hash` | 可放入 HashMap 的 key |
| `#[derive(Serialize, Deserialize)]` | serde | JSON/TOML 序列化 |

### 10.3 #[napi] 过程宏

过程宏比 `macro_rules!` 更强大，可执行任意 Rust 代码。

**`#[napi]`** — 将 Rust 函数/结构体暴露为 N-API 绑定（详见第 12 章）。

---

## 11. Unsafe Rust 与 FFI

本项目有 **119 处 `// SAFETY:` 注释** 分布在 24 个文件中，属于对 unsafe 有节制的使用。

### 11.1 何时需要 unsafe

Rust 编译器无法验证以下操作的安全性的情况：

1. 解引用裸指针 (`*const T`, `*mut T`)
2. 调用 FFI（`extern "C"` 函数）
3. 访问/修改可变静态变量
4. 实现 unsafe trait（如 `Send`, `Sync`）
5. 访问 union 字段
6. 使用 `std::mem::transmute` 等

### 11.2 unsafe 块 + SAFETY 注释

**本项目规范**：每个 `unsafe {}` 前必须有 `// SAFETY:` 注释解释为什么安全。

**libc 系统调用** (`crates/pi-shell/src/process.rs:243-251`)：
```rust
fn open_pidfd(pid: i32) -> Option<Arc<OwnedFd>> {
    // SAFETY: `pidfd_open` takes the PID by value and does not read caller-owned
    // memory. Flags are zero, which is valid.
    let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
    if fd < 0 { return None; }
    // SAFETY: `fd` is non-negative and was just returned by `pidfd_open`
    Some(Arc::new(unsafe { OwnedFd::from_raw_fd(fd as RawFd) }))
}
```

**fcntl 设置非阻塞** (`crates/pi-shell/src/shell.rs:1404-1410`)：
```rust
fn set_nonblocking<T: std::os::fd::AsRawFd>(file: &T) -> io::Result<()> {
    // SAFETY: `fd` is owned by `file` and remains valid for the duration of
    // these `fcntl` calls.
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    // ...
}
```

### 11.3 extern FFI 声明

**macOS libproc** (`crates/pi-shell/src/process.rs:301-304`)：
```rust
#[link(name = "proc", kind = "dylib")]
unsafe extern "C" {
    fn proc_listallpids(buffer: *mut i32, buffersize: i32) -> i32;
    fn proc_pidpath(pid: i32, buffer: *mut std::ffi::c_void, buffersize: u32) -> i32;
}
```

**Windows kernel32** (`crates/pi-shell/src/process.rs:748-793`)：
```rust
#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateToolhelp32Snapshot(dwFlags: u32, th32ProcessID: u32) -> Handle;
    fn Process32FirstW(hSnapshot: Handle, lppe: *mut PROCESSENTRY32W) -> i32;
    fn Process32NextW(hSnapshot: Handle, lppe: *mut PROCESSENTRY32W) -> i32;
    fn CloseHandle(hObject: Handle) -> i32;
}
```

- `extern "C"` — 标准 C ABI
- `extern "system"` — Windows 系统 API ABI

### 11.4 transmute / zeroed / MaybeUninit

**transmute** — 位级类型转换：

```rust
// SAFETY: we know Utf16String == struct(Vec<u16>)
unsafe { std::mem::transmute(data) }
```

**zeroed** — 零初始化 C 结构体：

```rust
// SAFETY: `proc_bsdinfo` is a plain C data struct. Zero initialization is
// valid because every field is an integer or fixed-size integer array.
let mut info = unsafe { std::mem::zeroed::<libc::proc_bsdinfo>() };
```

**MaybeUninit** — 延迟初始化（比 `zeroed` 更安全的选择）：

```rust
let mut value = mem::MaybeUninit::<T>::uninit();
// ... ReadProcessMemory 填充 value ...
// SAFETY: The successful `ReadProcessMemory` call above initialized exactly
// `size_of::<T>()` bytes in `value`.
Some(unsafe { value.assume_init() })
```

---

## 12. N-API 绑定

`pi-natives` crate 是 Node.js 原生 addon，通过 N-API/Napi-rs 暴露 Rust 能力给 JavaScript。

### 12.1 Crate 类型

```toml
# crates/pi-natives/Cargo.toml
[lib]
crate-type = ["cdylib"]  # 编译为动态链接库，供 Node.js 加载
```

### 12.2 #[napi] 标注函数

最基础的绑定——普通函数：

```rust
// crates/pi-natives/src/sixel.rs:24-44
#[napi]
pub fn encode_sixel(
    bytes: Uint8Array,
    target_width_px: u32,
    target_height_px: u32,
) -> Result<String> {
    // ... 图像编码为 SIXEL 转义序列 ...
}
```

编译后在 JS 端可直接调用 `encodeSixel(bytes, w, h)`（驼峰命名自动转换）。

### 12.3 #[napi] 标注类

**结构体 + 构造函数 + 方法**：

```rust
// crates/pi-natives/src/shell.rs:180-200
#[napi]
pub struct Shell {
    inner: Arc<CoreShell>,
}

#[napi]
impl Shell {
    #[napi(constructor)]
    pub fn new(options: Option<ShellOptions>) -> Self {
        Self { inner: Arc::new(CoreShell::new(options.map(Into::into))) }
    }

    #[napi]
    pub fn execute(&self, /* ... */) -> Result<ShellExecuteResult> {
        // ...
    }
}
```

JS 端使用：
```js
const shell = new Shell({ sessionEnv: { HOME: '/tmp' } });
const result = shell.execute('ls -la');
```

### 12.4 #[napi(object)] — 映射为 JS 普通对象

```rust
#[napi(object)]
pub struct ShellExecuteOptions<'env> {
    pub command: String,
    pub timeout_ms: Option<u32>,
    pub signal: Option<AbortSignal<'env>>,
    pub on_chunk: Option<ThreadsafeFunction<String>>,
}
```

### 12.5 #[napi(string_enum)] — 映射为 TypeScript 字符串联合

```rust
#[napi(string_enum)]
pub enum GrepOutputMode {
    Content,
    FilesWithMatches,
    Count,
}
```

JS 端：`"content" | "filesWithMatches" | "count"`

### 12.6 ThreadsafeFunction

将 JS 回调函数转为跨线程安全的消息通道：

```rust
fn bridge_chunks(
    on_chunk: Option<ThreadsafeFunction<String>>,
) -> (Option<mpsc::UnboundedSender<String>>, Option<JoinHandle<()>>) {
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let handle = napi::tokio::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            on_chunk.call(Ok(chunk), ThreadsafeFunctionCallMode::NonBlocking);
        }
    });
    (Some(tx), Some(handle))
}
```

### 12.7 Either\<T, U\> 返回类型

允许返回不同的 JS 类型：

```rust
pub fn truncate_to_width(...) -> Result<Either<JsString<'_>, Utf16String>> {
    // 可能返回 JS 管理的引用，也可能返回自有缓冲区
}
```

### 12.8 AbortSignal 集成

```rust
if let Some(signal) = signal.and_then(|value| AbortSignal::from_unknown(value).ok()) {
    let abort_token = result.emplace_abort_token();
    signal.on_abort(move || abort_token.abort(AbortReason::Signal));
}
```

---

## 13. 属性与条件编译

### 13.1 #[cfg(...)] — 条件编译

根据目标平台、feature 等条件决定是否编译代码。

**平台条件**：
```rust
#[cfg(unix)]        // 所有 Unix-like (Linux, macOS)
#[cfg(windows)]     // Windows
#[cfg(target_os = "linux")]    // 仅 Linux
#[cfg(target_os = "macos")]    // 仅 macOS
```

**本项目示例** — 跨平台函数 (`crates/pi-shell/src/shell.rs:416-428`)：
```rust
#[cfg(windows)]
const fn normalize_env_key(key: &str) -> &str {
    if key.eq_ignore_ascii_case("PATH") { "PATH" } else { key }
}

#[cfg(not(windows))]
const fn normalize_env_key(key: &str) -> &str { key }
```

**Feature 条件**：
```rust
#[cfg(feature = "full-langs")]
Astro,   // 只在启用 full-langs feature 时编译此变体
```

**条件导入模块** (`crates/pi-shell/src/lib.rs:6-7`)：
```rust
#[cfg(windows)]
pub mod windows;
```

### 13.2 #[allow(...)] / #![allow(...)]

压制 lint 警告：

```rust
#![allow(clippy::trailing_empty_array, reason = "generated by napi macro")]
```
`#!` 前缀表示作用于整个 crate，无 `!` 作用于紧跟的项。

**本项目示例** — 带 reason 的 allow (`crates/pi-iso/src/lib.rs:85-88`)：
```rust
#[allow(
    clippy::should_implement_trait,
    reason = "Option<Self> return is more ergonomic than FromStr's Result"
)]
pub fn from_str(s: &str) -> Option<Self> { /* ... */ }
```

### 13.3 #[must_use] — 返回值不应丢弃

```rust
#[must_use]
pub fn labeled(mut self, filter: &'static str) -> Self {
    self.filter_label = Some(filter);
    self
}
```
如果调用者忽略返回值，编译器会警告。

### 13.4 #[inline] — 内联提示

```rust
#[inline]
fn clamp_tab_width_for_ops(width: u32) -> usize {
    (width.clamp(1, 16) as usize).max(2)
}
```

### 13.5 const fn

可在编译期求值的函数：

```rust
pub const fn as_str(self) -> &'static str {
    match self {
        Self::Apfs => "apfs",
        Self::Overlayfs => "overlayfs",
        // ...
    }
}
```

---

## 14. 序列化（Serde）

Serde 是 Rust 事实上的序列化框架。

### 14.1 基本 derive

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MinimizerResult {
    pub filter:        String,
    pub text:          String,
    pub original_text: String,
    pub input_bytes:   u32,
    pub output_bytes:  u32,
}
```

### 14.2 常用 serde 属性

**禁止未知字段** (`crates/pi-shell/src/minimizer/pipeline.rs:32`)：
```rust
#[derive(Debug, Deserialize, Default)]
#[serde(deny_unknown_fields)]  // 遇到未知字段报错而非忽略
pub struct PipelineDef { /* ... */ }
```

**字段默认值**：
```rust
#[serde(default)]
pub description: Option<String>,   // 反序列化缺失时用 Option::default()
```

**重命名字段**：
```rust
#[serde(rename = "camelCase")]     // JSON 用驼峰
pub struct Foo { ... }
```

### 14.3 serde_json

```toml
serde_json = { version = "1.0", features = ["preserve_order"] }
```
`preserve_order` 保持 JSON 对象的键序。

### 14.4 toml

```toml
toml = "1.1"
```
项目的 minimizer 配置（数百条过滤规则）通过 TOML 文件定义，编译时通过 `build.rs` 合并到二进制中。

---

## 15. 测试与 Cargo 工作区

### 15.1 #[test] 单元测试

```rust
#[cfg(test)]          // 只编译在 test 模式下
mod tests {
    use super::*;     // 导入父模块所有项

    #[test]
    fn strips_trailing_head_tail() {
        let input = "some output\nhead\n";
        let result = fixup(input);
        assert_eq!(result, "some output\n");
    }
}
```

### 15.2 #[tokio::test] 异步测试

**本项目示例** (`crates/pi-shell/src/shell.rs:1694-1702`)：
```rust
#[cfg(unix)]
#[tokio::test(flavor = "multi_thread")]
async fn embedded_external_command_runs_in_its_own_session() {
    let shell = Shell::new(None);
    let result = shell.execute("echo hello").await.unwrap();
    assert_eq!(result.exit_code, 0);
}
```

`flavor = "multi_thread"` 表示用多线程 tokio runtime。

### 15.3 常用断言宏

```rust
assert!(condition);                      // 条件为真
assert_eq!(actual, expected);            // 相等
assert_ne!(actual, unexpected);          // 不等
assert!(matches!(value, Pattern::A));    // 模式匹配
```

**带消息的断言** (`crates/pi-shell/src/process.rs:1662`)：
```rust
assert!(
    selection.pgids.is_empty(),
    "no pgid should be added when leaders live outside the new descendant set; got {:?}",
    selection.pgids,
);
```

### 15.4 Cargo Workspace

本项目的根 `Cargo.toml` 是 workspace 清单：

```toml
[workspace]
members = ["crates/*"]
exclude = ["crates/brush-core-vendored", "crates/brush-builtins-vendored"]
resolver = "3"

[workspace.package]
version = "0.5.0"
edition = "2024"
license = "MIT"
```

**`[workspace.dependencies]`** — 统一管理依赖版本：
```toml
[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
napi = { version = "3", features = ["napi10", "tokio_rt", "tokio_time"] }
```

各子 crate 用 `foo.workspace = true` 引用：
```toml
[dependencies]
serde.workspace = true
```

### 15.5 Feature Flags

**定义 feature** (`crates/pi-ast/Cargo.toml`)：
```toml
[features]
default = []
full-langs = [
    "dep:tree-sitter-astro",
    "dep:tree-sitter-clojure",
    # ... 30+ optional tree-sitter parsers
]
```

**传播 feature** (`crates/pi-natives/Cargo.toml`)：
```toml
[features]
full-langs = ["pi-ast/full-langs"]  # 传递给依赖
```

### 15.6 Platform-Specific Dependencies

```toml
[target.'cfg(target_os = "linux")'.dependencies]
parking_lot.workspace = true

[target.'cfg(windows)'.dependencies]
winreg.workspace = true
```

### 15.7 build.rs — 构建脚本

`build.rs` 是在编译前运行的 Rust 程序，可用于代码生成、设置环境变量：

```rust
// crates/pi-natives/build.rs
println!("cargo:rerun-if-changed={}", defs_dir.display());
// 当 defs/ 目录变动时，Cargo 重新运行 build.rs
```

---

## 附录

### A. 本项目 Rust 概念速查表

| 概念 | 文件位置 | 关键行 |
|------|---------|--------|
| 模块系统 | `crates/pi-natives/src/lib.rs` | 24-54 |
| `pub use` 重导出 | `crates/pi-shell/src/lib.rs` | 9-14 |
| `#[cfg]` 条件模块 | `crates/pi-shell/src/lib.rs` | 6-7 |
| 结构体 | `crates/pi-shell/src/shell.rs` | 69-74, 121-125 |
| 枚举 + match | `crates/pi-iso/src/lib.rs` | 46-81, 176-178 |
| `#[repr(C)]` | `crates/pi-shell/src/process.rs` | 673-685 |
| `#[repr(u8)]` | `crates/pi-shell/src/cancel.rs` | 12-19 |
| Trait 定义 | `crates/pi-iso/src/lib.rs` | 224-246 |
| `#[async_trait]` | `crates/pi-iso/src/lib.rs` | 224 |
| 泛型 + trait bound | `crates/pi-natives/src/task.rs` | 209-218 |
| From/Into | `crates/pi-natives/src/shell.rs` | 47-56 |
| TryFrom | `crates/pi-shell/src/cancel.rs` | 21-33 |
| `let-else` | `crates/pi-shell/src/shell.rs` | 1035-1037 |
| `matches!` | `crates/pi-shell/src/shell.rs` | 593, 1084 |
| `let` / `let mut` 变量绑定 | `crates/brush-builtins-vendored/src/printf.rs` | 33, 73 |
| `as` 类型转换 | `crates/brush-builtins-vendored/src/shift.rs` | 24-25 |
| 元组解构 | `crates/brush-builtins-vendored/src/times.rs` | 17 |
| 数组字面量 | `crates/pi-shell/src/minimizer/filters/system.rs` | 425 |
| `HashMap::new` | `crates/brush-builtins-vendored/src/factory.rs` | 27-28 |
| `Vec::new` | `crates/brush-builtins-vendored/src/printf.rs` | 29 |
| Result + ? | `crates/brush-builtins-vendored/src/let_.rs` | 29-30 |
| 自定义错误 | `crates/pi-iso/src/lib.rs` | 176-209 |
| `tokio::spawn` | `crates/pi-shell/src/shell.rs` | 245-260 |
| `tokio::select!` | `crates/pi-shell/src/shell.rs` | 262-286 |
| `tokio::pin!` | `crates/pi-shell/src/shell.rs` | 1484 |
| CancellationToken | `crates/pi-shell/src/shell.rs` | 242 |
| `macro_rules!` | `crates/pi-ast/src/language/mod.rs` | 20-46, 638-746 |
| `#[napi]` | `crates/pi-natives/src/shell.rs` | 180-251 |
| `#[napi(string_enum)]` | `crates/pi-natives/src/grep.rs` | 40-52 |
| unsafe + SAFETY | `crates/pi-shell/src/shell.rs` | 1404-1410 |
| unsafe syscall | `crates/pi-shell/src/process.rs` | 243-251 |
| transmute | `crates/pi-natives/src/text.rs` | 45 |
| `extern "C"` | `crates/pi-shell/src/process.rs` | 301-304, 748-793 |
| `Box::new` | `crates/brush-builtins-vendored/src/declare.rs` | 427-428 |
| `Box<dyn FnOnce>` | `crates/pi-natives/src/task.rs` | 159 |
| `Box::pin` | `crates/pi-shell/src/shell.rs` | 689-690 |
| Arc + Clone | `crates/pi-natives/src/shell.rs` | 192, 209 |
| Arc::downgrade | `crates/pi-shell/src/cancel.rs` | 128, 131 |
| LazyLock | `crates/pi-ast/src/language/mod.rs` | 485 |
| OnceLock | `crates/pi-natives/src/highlight.rs` | 13-14 |
| thread_local! | `crates/pi-natives/src/text.rs` | 406-408 |
| AtomicU8 + Ordering | `crates/pi-shell/src/cancel.rs` | 36-63 |
| parking_lot::Mutex | `crates/pi-natives/src/prof.rs` | 10 |
| rayon | `crates/pi-natives/src/grep.rs` | 1187-1191 |
| phf_map! | `crates/pi-ast/src/language/mod.rs` | 923-977 |
| serde derive | `crates/pi-shell/src/shell.rs` | 91-98 |
| Drop impl (RAII) | `crates/pi-shell/src/process.rs` | 813-820 |
| `#[must_use]` | `crates/pi-shell/src/minimizer.rs` | 83, 92 |
| `const fn` | `crates/pi-iso/src/lib.rs` | 70-81 |
| `#[tokio::test]` | `crates/pi-shell/src/shell.rs` | 1694, 1799 |
| build.rs | `crates/pi-natives/build.rs` | 1-64 |

### B. 本项目独特的 Rust 设计模式

1. **宏驱动语言分发**：`crats/pi-ast/src/language/mod.rs` 中 `execute_lang_method!` 用宏为 50+ 种 tree-sitter 语言生成方法分发代码
2. **跨平台进程抽象**：`crats/pi-shell/src/process.rs` 用 `#[cfg(target_os = "...")]` 模块级条件编译，分别实现 Linux/macOS/Windows 进程管理
3. **Weak/Arc 取消机制**：`crats/pi-shell/src/cancel.rs` 用 `Arc<Flag>` 共享状态 + `Weak<Flag>` 外部取消，避免循环引用
4. **UTF-16 优先的文本处理**：`crats/pi-natives/src/text.rs` 直接在 `u16` 切片上操作，避免 JavaScript ↔ Rust 间的编码转换
5. **编译期 TOML 拼接**：`build.rs` 在编译时合并所有 `.toml` 过滤器定义到单一 `builtin_filters.toml`

### C. 推荐学习资源

- [Rust 语言圣经 (中文)](https://course.rs/) — 最推荐的中文 Rust 教程
- [The Rust Book (英文原版)](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/stable/rust-by-example/)
- [Tokio 教程](https://tokio.rs/tokio/tutorial)
- [Napi-rs 文档](https://napi.rs/)
