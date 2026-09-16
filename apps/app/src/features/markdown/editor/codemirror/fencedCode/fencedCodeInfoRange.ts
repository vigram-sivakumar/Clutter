import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

export interface FencedCodeInfoRange {
  /** The `CodeInfo` node's own range, or — when there's no info string at all — the zero-width insertion point right after the opening fence marker. */
  readonly from: number;
  readonly to: number;
  /** The raw, as-typed info text (`''` when there's no `CodeInfo` node). */
  readonly rawInfo: string;
}

/**
 * Re-resolves the live `FencedCode` node itself fresh from the syntax
 * tree, given only its own stable `.from` — the "never trust a captured
 * range, re-resolve at click/select time" contract every fenced-code
 * control in this codebase follows (`fencedCodeCopyButtonDecoration.ts`'s
 * own `nearestFencedCodeFrom` established the identical resolve-then-
 * walk-up shape first). Shared by every resolver in this file so the walk
 * itself is written once, not once per resolver.
 */
function resolveFencedCodeNode(state: EditorState, fencedCodeFrom: number): SyntaxNode | null {
  let node = syntaxTree(state).resolveInner(fencedCodeFrom + 1, 1);
  for (; node; node = node.parent!) {
    if (node.name === 'FencedCode' && node.from === fencedCodeFrom) {
      return node;
    }
  }
  return null;
}

/**
 * Re-resolves a fenced code block's `CodeInfo` (language identifier) range
 * fresh from the live syntax tree, given only the block's own stable
 * `FencedCode.from`.
 *
 * Used by `FencedCodeActionsMenu.tsx`'s "Change Language" submenu, both to
 * read the block's *current* language (for the submenu's checkmark) and,
 * on selection, to compute the exact `[from, to)` to replace — never the
 * code content itself, only the info string, whether or not one already
 * exists (`from === to` when absent, so a plain insert at that position
 * adds one rather than needing a separate no-info-string code path).
 */
export function resolveFencedCodeInfoRange(
  state: EditorState,
  fencedCodeFrom: number
): FencedCodeInfoRange | null {
  const node = resolveFencedCodeNode(state, fencedCodeFrom);
  if (!node) {
    return null;
  }

  const openMark = node.firstChild;
  if (!openMark || openMark.name !== 'CodeMark') {
    return null;
  }

  const codeInfo = node.getChild('CodeInfo');
  if (codeInfo) {
    return { from: codeInfo.from, to: codeInfo.to, rawInfo: state.sliceDoc(codeInfo.from, codeInfo.to) };
  }
  return { from: openMark.to, to: openMark.to, rawInfo: '' };
}

/**
 * Re-resolves a fenced code block's own code content — the `CodeText`
 * node, never the fences or the info string — fresh from the live syntax
 * tree, given only the block's own stable `FencedCode.from`. Mirrors
 * `fencedCodeCopyButtonDecoration.ts`'s own `getCode` closure exactly (the
 * same "one contiguous `CodeText` node, no fence, no info string, no
 * trailing newline before the closing fence" fact that closure's own doc
 * comment already established), factored out here so "Download code"
 * doesn't duplicate that resolution a second time. Returns `''` for a
 * `FencedCode` node with no `CodeText` child at all (a genuinely empty
 * block, or one whose fence is never closed) — never `null`; unlike the
 * info range, there is no meaningful "block not found" distinction a
 * caller needs to react to differently than "no content."
 */
export function resolveFencedCodeText(state: EditorState, fencedCodeFrom: number): string {
  const node = resolveFencedCodeNode(state, fencedCodeFrom);
  const codeText = node?.getChild('CodeText');
  return codeText ? state.sliceDoc(codeText.from, codeText.to) : '';
}

/**
 * Re-resolves a fenced code block's own `CodeText` *range* (not its text) —
 * the same node `resolveFencedCodeText` reads, exposed as a range for
 * "Format code" (`MarkdownEditor.tsx`'s `handleFormatFencedCode`), which
 * needs to dispatch a replace against it, the same shape
 * `fencedCodeFormatButtonDecoration.ts`'s own (now-removed) widget used
 * via its `getCodeRange` closure. Returns `null` for a `FencedCode` node
 * with no `CodeText` child — same "no content to format" signal Format's
 * own formattability gate already handles by not offering the action.
 */
export function resolveFencedCodeTextRange(
  state: EditorState,
  fencedCodeFrom: number
): { from: number; to: number } | null {
  const node = resolveFencedCodeNode(state, fencedCodeFrom);
  const codeText = node?.getChild('CodeText');
  return codeText ? { from: codeText.from, to: codeText.to } : null;
}

/**
 * Re-resolves a fenced code block's live opening-fence line element fresh
 * from the DOM, given only its stable `FencedCode.from` — never a captured
 * DOM node.
 *
 * **Why this exists — a real bug, not speculative hardening.** The
 * Actions/Copy button widgets both render at the same computed position
 * (`CodeInfo.to`/the opening `CodeMark`'s own end). Any edit to the info
 * string itself — exactly what "Change Language" does — moves that
 * position, and CM6 does not migrate the existing widget DOM nodes to the
 * new position; it tears down and rebuilds them, even when
 * `WidgetType.eq()` says the widget is unchanged. Confirmed live via a
 * temporary trace: `MarkdownEditor.tsx`'s `fencedCodeMenu.anchor.current`
 * (the Actions button captured in React state when its menu opened)
 * measured `isConnected: false` immediately after a language change —
 * the button the menu was anchored to had already been replaced. Cleanup
 * code that then called `.closest(...)` on that stale node silently found
 * nothing (or the wrong, detached subtree) and skipped clearing
 * `--menu-open`/`--active` on the real, live buttons, leaving Copy
 * permanently visible.
 *
 * **Retargeted from `.closest('.cm-code-block')` to `.closest('.cm-code-block-line')`
 * (2026-09-16, wrapper-removal migration)** — `fencedCodeBlockWrapper.ts`'s
 * `.cm-code-block` no longer carries any visual/hover-scoping role (see
 * `docs/editor-architecture-decisions.md`), and both buttons this resolves
 * for have only ever lived on the opening-fence *line* regardless, so the
 * line element itself is the correct, narrower closest-ancestor target.
 *
 * `view.domAtPos(pos)` — CM6's own position→live-DOM-node lookup — is
 * what makes this reliable across that rebuild: it's resolved fresh, at
 * call time, against whatever the view's *current* DOM actually is, not
 * against anything captured earlier.
 */
export function resolveFencedCodeOpeningLine(
  view: EditorView,
  fencedCodeFrom: number
): HTMLElement | null {
  const info = resolveFencedCodeInfoRange(view.state, fencedCodeFrom);
  if (!info) {
    return null;
  }
  const { node } = view.domAtPos(info.to);
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el?.closest<HTMLElement>('.cm-code-block-line') ?? null;
}
