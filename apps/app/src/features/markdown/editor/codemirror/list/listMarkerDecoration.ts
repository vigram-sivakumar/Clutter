import { syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * Live Preview rendering for **unordered/bullet** list markers (`-`, `*`,
 * `+`) — the first, deliberately narrow slice of list rendering. Ordered
 * lists, task checklists, and any editing-behavior work (Tab/Shift-Tab
 * beyond what `markdownIndentContext.ts` already resolves, structural
 * Backspace/Enter) are out of scope for this slice; see
 * docs/editor-architecture-decisions.md for that boundary.
 *
 * **Real, source-backed marker — `Decoration.mark`, never `Decoration.replace`
 * (migrated 2026-08-29).** The original slice (commit `b485cb3e`) replaced
 * `[marker.from, separator.to)` with `ListBulletWidget` via
 * `Decoration.replace`, going through the shared `liveMarkDecoration`
 * mechanism heading uses. That choice was never reviewed against
 * `docs/markdown-dom-structure-agreement.md` §1.5 ("keep the real Markdown
 * characters in the DOM... when a construct needs source-backed geometry for
 * correct caret, selection, or layout behavior") — the doc's own audit
 * (§5.3) still describes the pre-existing, un-shipped plan as a real-text
 * `Decoration.mark`, and no ADR or decision entry ever approved the
 * replace-based pivot. A real caret-boundary defect traced directly to the
 * replace-based DOM (a click landing exactly at content-start — the
 * legitimate resting position immediately after the marker — was
 * misidentified by `liveMarkSelectionSnap.ts` as "inside the replaced
 * range" and snapped backward) confirmed the concern concretely, and a
 * side-by-side prototype (an isolated `EditorView` mounted with a
 * `Decoration.mark`-based bullet renderer, real browser `coordsAtPos`/click
 * testing) showed every tested position resolves correctly with zero
 * snap-correction code, at every nesting depth tried, with identical line
 * geometry to an undecorated line. This file now follows that pattern —
 * the same one `blockquoteMarkerDecoration.ts` already established for
 * `>` — rather than the shared `liveMarkDecoration`/`liveMarkSelectionSnap`
 * mechanism, which exists specifically for constructs that DO replace their
 * marker range and therefore DO need the boundary correction (heading).
 * Bullet lists no longer have a replaced range for that mechanism to
 * correct.
 *
 * Enter/Backspace/Tab behavior is unaffected by this migration — confirmed
 * directly, not assumed: `insertNewlineContinueMarkupCommand` and
 * `deleteMarkupBackward` (`@codemirror/lang-markdown`) operate purely on
 * `state.doc`/`syntaxTree` positions, with no coupling to which decoration
 * (if any) is active over those positions. A controlled A/B test (identical
 * document and cursor position, this decoration present vs. absent)
 * produced byte-identical results.
 *
 * `ListItem`'s `firstChild` is always `ListMark` (confirmed against the
 * installed `@lezer/markdown@1.7.2`, for bullet, ordered, and task markers
 * alike). This module only claims the ones whose marker text is `-`, `*`,
 * or `+` and whose item is not a task (`TaskList` is enabled at the
 * grammar level — v1-scoped — but checklist *rendering* is explicitly out
 * of scope this slice, so a `- [ ] …`/`- [x] …` item is left completely
 * unrendered here, exactly as an ordered item is).
 *
 * Nesting requires no special handling: a nested `ListItem` is visited by
 * the same tree walk as any other, entirely independently of its parent's
 * own marker decoration. Leading indentation before a nested marker is
 * already rendered by the construct-agnostic `leadingIndentDecoration.ts`
 * (per-character, any line, no syntax-tree awareness) — this module must
 * not, and does not, re-decorate that range a second time.
 */
function isBulletListItemNode(nodeName: string): boolean {
  return nodeName === 'ListItem';
}

const BULLET_MARKER_CHARACTERS: ReadonlySet<string> = new Set(['-', '*', '+']);

function hasTaskChild(listItem: SyntaxNode): boolean {
  for (let child = listItem.firstChild; child; child = child.nextSibling) {
    if (child.name === 'Task') {
      return true;
    }
  }
  return false;
}

/**
 * The delimiter whitespace between a marker and its content is never its
 * own syntax node (confirmed directly against the installed
 * `@lezer/markdown@1.7.2`: `ListMark`'s sibling is whichever real content
 * node follows — `Paragraph`, a nested `BulletList`, etc. — with an
 * unclaimed gap of raw whitespace between them). CommonMark allows 1-4
 * spaces there before the marker "gives up" and the line stops being that
 * item's own first line at all, so this walks the actual gap up to
 * whatever node comes next, rather than assuming exactly one space —
 * `-  Text`/`-   Text` (2/3-space separators) are valid, non-canonical
 * Markdown this must still conceal correctly, not leave a stray visible
 * space between the bullet and the text.
 *
 * Bounded to the marker's own physical line (`Math.min(to, line.to)`):
 * confirmed by direct inspection of a real parsed tree (`"-\n  - nested"`)
 * that `ListMark`'s next sibling can be a nested list starting on a
 * *later* line, with only whitespace (including the intervening `\n`)
 * physically between them — an ungated "whitespace-only gap" check would
 * misidentify that real line break as separator whitespace and try to
 * collapse it into this same-line widget. A separator span, by
 * definition, is CommonMark's own same-line marker-to-content gap only.
 */
function separatorRangeAfter(
  state: EditorState,
  marker: SyntaxNode
): { from: number; to: number } | null {
  const from = marker.to;
  const lineEnd = state.doc.lineAt(from).to;
  const to = Math.min(marker.nextSibling ? marker.nextSibling.from : from + 1, lineEnd, state.doc.length);

  if (to <= from) {
    return null;
  }

  const gapText = state.sliceDoc(from, to);
  return gapText.trim() === '' ? { from, to } : null;
}

interface BulletMarkRange {
  readonly from: number;
  readonly to: number;
}

/**
 * A bare marker with nothing after it on its own physical line (`-`,
 * cursor still mid-keystroke before the separator space is typed) is a
 * syntactically valid, complete, empty `ListItem` per CommonMark — the
 * parser is right to produce a `ListMark` for it (confirmed directly
 * against the installed `@lezer/markdown`: `ListMark[0,1)` for `"-"` is
 * byte-identical to `ListMark[0,1)` for `"- "`). But Clutter's Live
 * Preview should not visually replace it until the marker actually *has*
 * something after it — otherwise the very first keystroke of typing a
 * list item flashes a bullet before the user has finished writing the
 * marker. `separatorRangeAfter` already computes exactly this signal (a
 * real, same-line whitespace gap, or — via its own `Math.min(...,
 * lineEnd, ...)` clamp — correctly `null` when the only thing "after" the
 * marker is a sibling on a *later* line, e.g. a same-line-bare parent
 * immediately followed by a nested child list). `separator === null`
 * alone is sufficient here, with no separate `!marker.nextSibling` check
 * needed: CommonMark itself requires at least one whitespace character
 * between a marker and any real content sibling on the same line (a
 * marker with content directly adjacent — zero gap — doesn't parse as a
 * `ListMark` at all, per the same grammar), so whenever a content sibling
 * truly follows on this line, `separatorRangeAfter` is guaranteed to find
 * that whitespace and return non-null; `null` therefore already means,
 * completely, "there is genuinely nothing — no separator, no content —
 * after this marker on its own line."
 */
function getBulletMarkRange(node: SyntaxNode, state: EditorState): BulletMarkRange | null {
  const marker = node.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return null;
  }

  const raw = state.sliceDoc(marker.from, marker.to);
  if (!BULLET_MARKER_CHARACTERS.has(raw) || hasTaskChild(node)) {
    return null;
  }

  const separator = separatorRangeAfter(state, marker);
  if (!separator) {
    return null;
  }

  return { from: marker.from, to: separator.to };
}

/**
 * The overlap test is `selection.from < range.to && selection.to > range.from`
 * — a genuine interval overlap, not boundary-inclusive containment. The one
 * boundary position that matters here, `- |Text` (a collapsed caret exactly
 * at the marker range's own `to`, immediately before the content), must NOT
 * engage: that position is reached by ordinary cursor movement while editing
 * the item's text (e.g. Home, or arriving from the left), not an attempt to
 * edit the marker. A collapsed cursor strictly inside the range (`-|-Text`
 * between the dash and the separator, i.e. `from < pos < to`), or any
 * selection that spans into it, does engage.
 */
function isMarkerRangeEngaged(state: EditorState, range: BulletMarkRange): boolean {
  const selection = state.selection.main;
  return selection.from < range.to && selection.to > range.from;
}

const MARKER_MARK = Decoration.mark({ class: 'cm-list-marker cm-bullet-list-marker' });
const MARKER_MARK_CONCEALED = Decoration.mark({
  class: 'cm-list-marker cm-bullet-list-marker cm-bullet-list-marker--concealed',
});

interface PendingMark {
  readonly from: number;
  readonly to: number;
  readonly decoration: typeof MARKER_MARK;
}

function buildDecorations(view: EditorView): DecorationSet {
  const pending: PendingMark[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isBulletListItemNode(node.name)) {
          return;
        }

        const range = getBulletMarkRange(node.node, view.state);
        if (!range) {
          return;
        }

        const engaged = isMarkerRangeEngaged(view.state, range);
        pending.push({ from: range.from, to: range.to, decoration: engaged ? MARKER_MARK : MARKER_MARK_CONCEALED });
      },
    });
  }

  // Sorted once via Decoration.set(_, true) rather than inserted in tree
  // visitation order via RangeSetBuilder: a nested item's marker starts
  // after its parent's own marker, but iteration order across levels isn't
  // guaranteed strictly ascending by construction.
  return Decoration.set(
    pending.map(({ from, to, decoration }) => decoration.range(from, to)),
    true
  );
}

interface ListMarkerPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function listMarkerDecoration(): Extension {
  return ViewPlugin.fromClass<ListMarkerPlugin>(
    class implements ListMarkerPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
