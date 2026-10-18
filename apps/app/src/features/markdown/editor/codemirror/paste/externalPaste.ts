import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Compact formatting for text pasted from outside Clutter.
 *
 * Other apps write one blank line between every block (Notion puts one between each paragraph, list and task).
 * Clutter keeps consecutive blocks on consecutive lines, so an external paste is compacted; text Clutter itself
 * put on the clipboard is pasted as it is.
 *
 * Built on CodeMirror's own `clipboardOutputFilter` / `clipboardInputFilter`, so the normal paste (selection
 * replacement, one undoable `input.paste` transaction) is untouched, and table pasting — which handles its own
 * `paste` event before the default — is not involved.
 */

/**
 * The text Clutter last wrote to the clipboard — by CodeMirror's copy and cut (any editor, including an embedded
 * note's) or by a Copy button in the editor. An external copy replaces the clipboard, so a paste whose text is not
 * this text did not come from Clutter. Only an external copy of text identical to Clutter's last copy is
 * indistinguishable, and pasting that unchanged is the harmless side.
 */
let lastInternalClipboardText: string | null = null;

const normalizeNewlines = (text: string): string =>
  text.replace(/\r\n?/g, '\n');

/** Marks `text` as the content Clutter just placed on the clipboard, so pasting it keeps its formatting. */
export function recordInternalClipboardText(text: string): void {
  lastInternalClipboardText = normalizeNewlines(text);
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])(?:[ \t]|$)/;
/** A task marker whose brackets an exporter backslash-escaped (`- \\[ \\] Task`), which Markdown reads as literal text, not a task. */
const TASK_ESCAPED = /^(\s*(?:[-*+]|\d+[.)])[ \t]+)\\\[([ xX])\\\](?=[ \t]|$)/;
const TASK_GAP = /^(\s*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\])[ \t]{2,}(?=\S)/;
/** A line that starts a block of its own (so it can follow a list or quote line without becoming part of it). */
const BLOCK_START =
  /^(?:\s*(?:[-*+]|\d+[.)])(?:[ \t]|$)|\s*>|\s{0,3}#{1,6}(?:[ \t]|$)|\s{0,3}(?:`{3,}|~{3,})|\s{0,3}(?:\*{3,}|_{3,}|-{3,})\s*$)/;
const TABLE_ROW = /^\s*\|/;
const SETEXT_UNDERLINE = /^ {0,3}(?:-+|=+)[ \t]*$/;
const INDENTED = /^(?: {4}|\t)/;

/**
 * Whether the blank line between `prev` and `next` is what keeps them apart. Removing it must never change what
 * the Markdown means: a plain line right after a list item or quote line would become its lazy continuation, a
 * line right after a table row would become a table row, a table straight after a paragraph is no longer a
 * table, `---` / `===` right after a paragraph would turn it into a heading, and a blank line inside indented
 * code is part of the code.
 */
function blankSeparates(prev: string, next: string): boolean {
  if (TABLE_ROW.test(prev) !== TABLE_ROW.test(next)) {
    return true;
  }

  if (SETEXT_UNDERLINE.test(next)) {
    return true;
  }

  if (
    !BLOCK_START.test(next) &&
    (LIST_ITEM.test(prev) || /^\s*>/.test(prev) || /^(?: {2,}|\t)/.test(prev))
  ) {
    return true;
  }

  return INDENTED.test(prev) && INDENTED.test(next) && !BLOCK_START.test(next);
}

/** A list item line indented with spaces only: indent, marker, the 1–4 spaces after it (none when the item is empty), the rest. */
const SPACED_LIST_LINE = /^( *)([-*+]|\d+[.)])( {1,4}|$)(.*)$/;

/** Clutter's nesting step: one level is 4 spaces, the only width at which a nested marker lines up with its parent's text (see `INDENT_STEP_SPACES`). */
const LEVEL_SPACES = 4;

/**
 * Re-expresses one run of consecutive list item lines with Clutter's indentation (4 spaces per level), keeping
 * the nesting the Markdown already has: an item is nested under the nearest earlier item whose content column
 * (marker included) it reaches, exactly as the parser decides. Other apps nest with 2 spaces (or 3 under
 * `1.`), which parses fine but renders as a sub-level step, left of its parent's text. Returns the run
 * unchanged whenever the result could not keep the same structure: it starts indented, an item sits 4+ columns
 * past its parent's content (that is code or a continuation, not an item), or a parent's marker is wider than 4
 * columns (`100. `), which a 4-space child would not reach.
 */
function reindentListRun(run: readonly string[]): string[] {
  const stack: { contentCol: number; width: number }[] = [];
  const result: string[] = [];

  for (const line of run) {
    const match = SPACED_LIST_LINE.exec(line)!;
    const indent = match[1]!.length;
    const width = match[2]!.length + Math.max(match[3]!.length, 1);

    while (stack.length > 0 && stack[stack.length - 1]!.contentCol > indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    if (
      (parent ? indent - parent.contentCol >= LEVEL_SPACES : indent >= LEVEL_SPACES) ||
      (parent && parent.width > LEVEL_SPACES) ||
      (stack.length === 0 && result.length === 0 && indent > 0)
    ) {
      return [...run];
    }

    result.push(' '.repeat(stack.length * LEVEL_SPACES) + line.slice(indent));
    stack.push({ contentCol: indent + width, width });
  }

  return result;
}

/** Applies `reindentListRun` to every run of list item lines outside fenced code; every other line is kept. */
function reindentLists(lines: readonly string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  let fence: { readonly char: string; readonly length: number } | null = null;

  const endRun = (): void => {
    out.push(...reindentListRun(run));
    run = [];
  };

  for (const line of lines) {
    if (fence) {
      out.push(line);

      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`).test(line)) {
        fence = null;
      }

      continue;
    }

    if (SPACED_LIST_LINE.test(line)) {
      run.push(line);
      continue;
    }

    endRun();
    out.push(line);

    const open = FENCE_OPEN.exec(line);

    if (open) {
      fence = { char: open[1]![0]!, length: open[1]!.length };
    }
  }

  endRun();

  return out;
}

/**
 * Compacts external Markdown text:
 *
 *  - a single blank line between two blocks is removed (unless that would change the Markdown's meaning, see
 *    `blankSeparates`); a run of two or more blank lines — an intentional gap — becomes one blank line;
 *  - leading and trailing blank lines are reduced to one newline;
 *  - the extra spaces after a task marker are removed (`- [ ]  Task` → `- [ ] Task`), and a task marker an
 *    exporter backslash-escaped right after the list marker is restored (`- \\[ \\] Task` → `- [ ] Task`; an
 *    escape anywhere else in a line is literal text and stays);
 *  - nested list items are re-indented to Clutter's 4 spaces per level, keeping the nesting they already have;
 *  - the inside of a fenced code block (``` or ~~~) is kept exactly, blank lines and whitespace included.
 *
 * Line-based, with no Markdown parsing: the rules only need to know fences, list/quote/table/heading line
 * starts, and blank lines.
 */
export function normalizeExternalPaste(input: string): string {
  const lines = normalizeNewlines(input).split('\n');
  const out: string[] = [];
  let fence: { readonly char: string; readonly length: number } | null = null;
  let blanks = 0;
  let previous: string | null = null;

  for (const line of lines) {
    if (fence) {
      out.push(line);
      previous = line;

      if (
        new RegExp(`^ {0,3}${fence.char}{${fence.length},}[ \\t]*$`).test(line)
      ) {
        fence = null;
      }

      continue;
    }

    if (line.trim() === '') {
      blanks++;
      continue;
    }

    const compact = line
      .replace(TASK_ESCAPED, (_all, head: string, mark: string) => `${head}[${mark}]`)
      .replace(TASK_GAP, '$1 ');

    if (
      blanks > 0 &&
      (previous === null || blanks > 1 || blankSeparates(previous, compact))
    ) {
      out.push('');
    }

    blanks = 0;
    out.push(compact);
    previous = compact;

    const open = FENCE_OPEN.exec(line);

    if (open) {
      fence = { char: open[1]![0]!, length: open[1]!.length };
    }
  }

  if (previous === null) {
    return input;
  }

  if (blanks > 0) {
    out.push('');
  }

  return reindentLists(out).join('\n');
}

/**
 * Records every copy/cut Clutter makes and compacts every paste that did not come from one. Install in every
 * editor view (a note embed's nested view copies too).
 */
export function externalPasteNormalization(): Extension {
  return [
    EditorView.clipboardOutputFilter.of((text) => {
      recordInternalClipboardText(text);
      return text;
    }),
    EditorView.clipboardInputFilter.of((text) =>
      normalizeNewlines(text) === lastInternalClipboardText
        ? text
        : normalizeExternalPaste(text)
    ),
  ];
}
