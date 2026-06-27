#!/usr/bin/env bun

const CSI = "\x1b[";

function cursorTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

const CLEAR_LINE_END = `${CSI}K`;
const CLEAR_SCREEN_END = `${CSI}J`;
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const ENTER_ALT_SCREEN = `${CSI}?1049h`;
const EXIT_ALT_SCREEN = `${CSI}?1049l`;

const SGR_RESET = `${CSI}0m`;
const SGR_BOLD = `${CSI}1m`;
const SGR_DIM = `${CSI}2m`;

function fg(code: number, text: string): string {
  return `${CSI}${code}m${text}${SGR_RESET}`;
}

const Styles = {
  reset: SGR_RESET,
  bold: (t: string) => fg(1, `${SGR_BOLD}${t}`),
  dim: (t: string) => `${SGR_DIM}${t}${SGR_RESET}`,
  accent: (t: string) => fg(36, t),   // cyan
  text: (t: string) => fg(37, t),     // white
  success: (t: string) => fg(32, t),  // green
  warning: (t: string) => fg(33, t),  // yellow
  border: (t: string) => fg(90, t),   // bright black (gray)
  muted: (t: string) => fg(90, t),
};

const BoxSharp = {
  horizontal: "─",
  vertical: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
};

const Cursor = "▶";

class Terminal {
  private rawMode = false;

  /** 进入 raw mode，可以逐字节读取键盘输入 */
  enter(): void {
    if (this.rawMode) return;
    // 切换到备用屏幕缓冲区
    process.stdout.write(ENTER_ALT_SCREEN);
    process.stdout.write(HIDE_CURSOR);
    // 设置 stdin 为原始模式
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    this.rawMode = true;
  }

  /** 退出 raw mode，恢复终端 */
  leave(): void {
    if (!this.rawMode) return;
    process.stdout.write(SHOW_CURSOR);
    process.stdout.write(EXIT_ALT_SCREEN);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    this.rawMode = false;
  }

  /** 获取终端尺寸 */
  getSize(): { rows: number; cols: number } {
    return {
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80,
    };
  }

  /** 清屏并移动光标到左上角 */
  clear(): void {
    process.stdout.write(cursorTo(1, 1) + CLEAR_SCREEN_END);
  }

  /** 在指定位置写文本 */
  writeAt(row: number, col: number, text: string): void {
    process.stdout.write(cursorTo(row, col) + CLEAR_LINE_END + text);
  }
}

interface SelectorOptions {
  title: string;
  options: string[];
  multi?: boolean;
  recommended?: number;
  timeout?: number;
  outline?: boolean;
  helpText?: string;
  customInput?: {
    label: string;
    placeholder?: string;
  };
}

interface SelectorResult {
  selected: string[];
  customInput?: string;
  timedOut: boolean;
  cancelled: boolean;
}

function askSelector(opts: SelectorOptions): Promise<SelectorResult> {
  return new Promise((resolve) => {
    const term = new Terminal();
    term.enter();

    const {
      title,
      options,
      multi = false,
      recommended = 0,
      timeout = 0,
      outline = false,
      helpText,
      customInput,
    } = opts;

    let selectedIndex = Math.max(0, Math.min(recommended, options.length - 1));
    const selected = new Set<string>();
    let inputMode = false;
    let inputText = "";
    let timedOut = false;
    let countdownTimer: ReturnType<typeof setInterval> | undefined;

    const allOptions = customInput ? [...options, customInput.label] : options;
    const optionCount = allOptions.length;

    if (multi && options[recommended]) {
      selected.add(options[recommended]);
    }

    const OUTLINE_BORDER = outline ? 2 : 0;
    const TITLE_ROWS = 1;
    const HELP_ROWS = 1;
    const SPACER_ROWS = 2;
    const CHROME_ROWS = OUTLINE_BORDER + TITLE_ROWS + HELP_ROWS + SPACER_ROWS;

    function getMaxVisible(): number {
      const { rows } = term.getSize();
      return Math.max(3, rows - CHROME_ROWS - (inputMode ? 3 : 0));
    }

    function render(): void {
      const { rows, cols } = term.getSize();
      const maxVisible = getMaxVisible();

      const halfVisible = Math.floor(maxVisible / 2);
      let startIndex = Math.max(0, selectedIndex - halfVisible);
      const endIndex = Math.min(startIndex + maxVisible, optionCount);
      if (endIndex - startIndex < maxVisible && startIndex > 0) {
        startIndex = Math.max(0, endIndex - maxVisible);
      }

      term.clear();

      let row = 1;

      if (outline) {
        const hLine = BoxSharp.horizontal.repeat(cols - 2);
        term.writeAt(row, 1, Styles.border(BoxSharp.topLeft + hLine + BoxSharp.topRight));
        row++;
      }

      const titleText = countdownTimer
        ? `${title} (${getCountdown()}s)`
        : title;
      const titleLine = multi && selected.size > 0
        ? `(${selected.size} selected) ${titleText}`
        : titleText;
      const titlePrefix = outline ? ` ${BoxSharp.vertical} ` : "";
      term.writeAt(row, 1, titlePrefix + Styles.accent(Styles.bold(titleLine)));
      row++;

      row++;

      for (let i = startIndex; i < endIndex; i++) {
        const opt = allOptions[i]!;
        const isSelected = i === selectedIndex;
        const leftPad = outline ? ` ${BoxSharp.vertical} ` : "";

        let prefix: string;
        if (multi) {
          const checked = selected.has(opt) ? "☑" : "☐";
          prefix = isSelected ? Styles.accent(`${Cursor} ${checked} `) : `  ${checked} `;
        } else {
          prefix = isSelected ? Styles.accent(`${Cursor} `) : "  ";
        }

        const label = (customInput && i === optionCount - 1)
          ? Styles.muted(customInput.label)
          : isSelected ? Styles.accent(opt) : Styles.text(opt);

        const availableWidth = cols - leftPad.length - 4;
        const displayLabel = label.slice(0, availableWidth);

        term.writeAt(row, 1, leftPad + prefix + displayLabel);
        row++;
      }

      if (startIndex > 0 || endIndex < optionCount) {
        const marker = `  (${selectedIndex + 1}/${optionCount})`;
        term.writeAt(row, 1, (outline ? ` ${BoxSharp.vertical} ` : "") + Styles.dim(marker));
        row++;
      }

      if (inputMode) {
        row++;
        const pfx = outline ? `${BoxSharp.vertical} ` : "";
        term.writeAt(row, 1, pfx + `> ${inputText}█`);
        row++;
      }

      row++;
      const defaultHelp = multi
        ? "↑↓/jk 移动  Enter 切换选中  Esc 取消  Ctrl+D 完成"
        : "↑↓/jk 移动  Enter 确认  Esc 取消";
      const finalHelp = helpText ?? defaultHelp;
      term.writeAt(row, 1, (outline ? ` ${BoxSharp.vertical} ` : "") + Styles.dim(finalHelp));
      row++;

      if (outline) {
        const hLine = BoxSharp.horizontal.repeat(cols - 2);
        term.writeAt(row, 1, Styles.border(BoxSharp.bottomLeft + hLine + BoxSharp.bottomRight));
      }
    }

    let countdownStart = 0;
    function getCountdown(): number {
      const elapsed = Date.now() - countdownStart;
      return Math.max(0, Math.ceil((timeout - elapsed) / 1000));
    }

    function startCountdown(): void {
      if (timeout <= 0) return;
      countdownStart = Date.now();
      countdownTimer = setInterval(() => {
        const remaining = getCountdown();
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          countdownTimer = undefined;
          timedOut = true;
          finish();
        } else {
          render();
        }
      }, 1000);
    }

    function finish(): void {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = undefined;
      }

      term.leave();

      let result: SelectorResult;

      if (multi) {
        result = {
          selected: Array.from(selected),
          timedOut,
          cancelled: false,
        };
      } else if (timedOut) {
        result = {
          selected: allOptions[selectedIndex] === customInput?.label
            ? []
            : [allOptions[selectedIndex]!],
          timedOut: true,
          cancelled: false,
        };
      } else {
        const chosen = allOptions[selectedIndex]!;
        if (customInput && chosen === customInput.label) {
          result = {
            selected: [],
            customInput: inputText,
            timedOut: false,
            cancelled: false,
          };
        } else {
          result = {
            selected: [chosen],
            timedOut: false,
            cancelled: false,
          };
        }
      }

      stdinPause();
      resolve(result);
    }

    function cancel(): void {
      if (countdownTimer) clearInterval(countdownTimer);
      term.leave();
      stdinPause();
      resolve({ selected: [], timedOut: false, cancelled: true });
    }

    function handleInput(key: Buffer): void {
      const str = key.toString();
      const char = str[0];

      if (countdownTimer && timeout > 0) {
        clearInterval(countdownTimer);
        startCountdown();
      }

      if (inputMode) {
        if (str === "\x1b") {
          inputMode = false;
          inputText = "";
        } else if (str === "\r" || str === "\n") {
          finish();
          return;
        } else if (str === "\x7f" || str === "\b") {
          inputText = inputText.slice(0, -1);
        } else if (char !== undefined && char >= " " && char <= "~") {
          inputText += str;
        }
        render();
        return;
      }

      switch (str) {
        case "\x1b[A": // ↑
        case "k":
          selectedIndex = Math.max(0, selectedIndex - 1);
          break;

        case "\x1b[B": // ↓
        case "j":
          selectedIndex = Math.min(optionCount - 1, selectedIndex + 1);
          break;

        // 确认 / 选中
        case "\r":
        case "\n": {
          const currentOpt = allOptions[selectedIndex]!;

          if (multi) {
            // 切换 checkbox
            if (selected.has(currentOpt)) {
              selected.delete(currentOpt);
            } else {
              selected.add(currentOpt);
            }
          } else if (customInput && currentOpt === customInput.label) {
            // 进入内联输入模式
            inputMode = true;
          } else {
            // 单选 → 直接完成
            finish();
            return;
          }
          break;
        }

        // Ctrl+D → 多选完成
        case "\x04":
          if (multi && selected.size > 0) {
            finish();
            return;
          }
          break;

        // Esc → 取消
        case "\x1b":
          cancel();
          return;

        // Ctrl+C → 取消
        case "\x03":
          cancel();
          return;
      }

      render();
    }

    function stdinPause(): void {
      process.stdin.removeAllListeners("data");
      process.stdin.pause();
    }

    process.stdin.resume();
    process.stdin.on("data", handleInput);

    startCountdown();
    render();
  });
}

async function main() {
  console.log("=== GJC ask 工具 — 独立交互式选择器演示 ===\n");

  console.log("📌 演示 1: 单选 + 外框\n");
  const result1 = await askSelector({
    title: "Which authentication method should this API use?",
    options: ["JWT", "OAuth2", "Session cookies", "API Key"],
    recommended: 0,
    outline: true,
    timeout: 15_000,
    helpText: "↑↓/jk 移动  Enter 确认  Esc 取消  ⏱ 15s 超时",
  });
  console.log("\n--- 单选结果 ---");
  console.log(`选中: [${result1.selected.join(", ")}]`);
  console.log(`超时: ${result1.timedOut}`);
  console.log(`取消: ${result1.cancelled}\n`);

  console.log("📌 演示 2: 多选 + 自定义输入 (Other)\n");
  const result2 = await askSelector({
    title: "Which features should be enabled?",
    options: ["Authentication", "Rate limiting", "WebSockets", "File upload"],
    multi: true,
    recommended: 0,
    outline: true,
    customInput: {
      label: "Other (type your own)",
      placeholder: "Enter custom feature...",
    },
  });
  console.log("\n--- 多选结果 ---");
  console.log(`选中: [${result2.selected.join(", ")}]`);
  if (result2.customInput) {
    console.log(`自定义输入: "${result2.customInput}"`);
  }
  console.log(`取消: ${result2.cancelled}\n`);

  console.log("📌 演示 3: 无外框轻量模式\n");
  const result3 = await askSelector({
    title: "Select theme:",
    options: ["Red Claw", "Blue Crab", "Dark", "Light", "Monokai", "Solarized"],
    recommended: 1,
    outline: false,
  });
  console.log("\n--- 单选结果 ---");
  console.log(`选中: [${result3.selected.join(", ")}]`);
  console.log(`取消: ${result3.cancelled}\n`);

  console.log("=== 演示完成 ===");
}

main().catch(console.error);
export {};
