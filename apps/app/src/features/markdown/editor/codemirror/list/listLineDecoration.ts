import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type EditorState, type Extension, type Line } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { getLeadingWhitespaceWidthPx } from '../../../../../design-system/markdownIndent';
import { taskMarkerOfListItem } from '../task/taskEngagement';
import {
  classifyMarkerText,
  isListItemNode,
  separatorRangeAfter,
} from './listMarkerDecoration';
import {
  getBulletMarkerFootprintPx,
  getOrderedMarkerFootprintPx,
  getTaskMarkerFootprintPx,
  getTaskSeparatorWidthPx,
} from './listMarkerWidth';

/**
 * Hanging indent for list items — the wrapped-line counterpart to
 * `listMarkerDecoration.ts`'s marker rendering, modeled directly on
 * `blockquoteLineDecoration.ts`'s own line-ownership algorithm (per-line
 * probe at the first non-whitespace character, walk to the nearest owning
 * ancestor). Purely presentational: adds a `Decoration.line` class with a
 * per-line custom property, never touches `state.doc`, never depends on
 * selection/engagement.
 *
 * **Root cause this fixes**: a `Decoration.mark`'s box only affects
 * layout on the physical line it's actually on — it contributes nothing
 * to a browser-soft-wrapped continuation row of that same `.cm-line`.
 * `listMarkerDecoration.ts` only ever wraps the marker+separator
 * characters in an inline mark, so without this file, a wrapped list-item
 * row falls back to the line's own left edge instead of the content
 * column. `blockquoteLineDecoration.ts` already solves the identical
 * problem for blockquote via `padding-left`/negative `text-indent` on a
 * `Decoration.line` class; this is the list-side equivalent, reinstating
 * what `listLineDecoration.ts` did before it was deleted 2026-08-28
 * alongside the old widget-based marker architecture (git history:
 * `84ae8dbb`) and never given back a replacement once marker rendering
 * was rebuilt (`b485cb3e` onward) on today's real-text `Decoration.mark`
 * architecture.
 *
 * **Why this needs per-item pixel geometry, not a depth multiplier**
 * (unlike blockquote's `--quote-depth * var(--md-marker-width)`):
 * blockquote's formula is exact because a quote marker's box is
 * CSS-forced to a *constant* width regardless of nesting depth, so N
 * levels really is N copies of one fixed box. A list item's own marker
 * is not always that fixed — bullets and task checkboxes are (`--md-marker-width`),
 * but ordered markers grow past that floor for 2+ digit numbers, and by
 * an amount that isn't predictable from digit count alone (see
 * `listMarkerWidth.ts`'s own doc comment for the live measurement that
 * ruled out a `ch`-based formula). So this file computes one real pixel
 * value per governing list item — leading-whitespace width plus that
 * item's own marker footprint — rather than a structural depth count.
 *
 * **Why nesting needs no summing, unlike blockquote's own depth walk**:
 * nested `>>` quote markers physically repeat on the *same* line
 * (`">> nested"`), so blockquote must sum every ancestor level's own
 * marker box. Nested list markers never repeat this way — a nested
 * item's own marker appears once, on its own line, preceded by literal
 * source indentation (leading spaces/tabs) that
 * `leadingIndentDecoration.ts` already renders independently, per
 * character, with no awareness of this file. So the indent this file
 * reserves for *any* physical line is always exactly one thing: the
 * *nearest* owning `ListItem`'s own leading-whitespace width plus its own
 * marker footprint — never a sum across ancestors, and never a second,
 * competing rendering of the leading whitespace itself (this file adds
 * no decoration over the leading-whitespace character range; it only
 * reads that line's raw text to size the reserved gutter).
 *
 * **Why every physical line belonging to an item — not just the item's
 * own marker line — reuses that *same* one number**: the value is always
 * derived from the owning item's own marker line (`state.doc.lineAt(marker.from)`),
 * never from the *currently probed* physical line's own leading
 * whitespace. This is deliberate, and matches the original
 * `listLineDecoration.ts`'s own stated purpose ("full physical-line
 * coverage... fixes lazy continuation, second paragraphs... being
 * skipped when they weren't the ListItem's own starting line," commit
 * `655dfb86`): a lazy-continuation or blank-separated second-paragraph
 * line legitimately has less (or no) leading whitespace of its own in
 * `state.doc`, yet must still align to the *item's* content column, not
 * to whatever whitespace happens to precede it on its own line.
 */
function firstNonWhitespaceOffset(text: string): number {
  return text.length - text.trimStart().length;
}

function nearestListItem(state: EditorState, probePos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (isListItemNode(node.name)) {
      return node;
    }
  }
  return null;
}

/**
 * **Structural membership vs. visual list-line ownership — the distinction
 * this function exists to draw.** `nearestListItem()` answers "does this
 * position resolve somewhere inside a `ListItem`'s subtree" — true for
 * *every* physical line CommonMark's own lazy-continuation and loose-list
 * rules let a single `ListItem`/`Paragraph` node span, including plain,
 * zero-indentation lines that were never actually typed as list content
 * (confirmed live: three consecutive non-blank lines — a list item's own
 * long sentence, then two ordinary unindented sentences, zero blank lines
 * anywhere — parse as one `Paragraph` node covering all three physical
 * lines, entirely inside one `ListItem`). That membership check alone is
 * not sufficient to decide whether *this specific* physical line should
 * ever have received `cm-list-line`'s hanging indent — confirmed against
 * Obsidian's own real DOM for the identical source text: only the
 * physical line that itself contains the list marker gets
 * `HyperMD-list-line`; the other two, despite being part of the same
 * lazily-continued node, get a bare `cm-line`.
 *
 * This function is the missing second check: given the `item` a probe
 * position resolved into, is the *current* physical `line` actually one
 * this item's own hanging indent should apply to?
 *
 * - **The item's own marker line** (`line.from === markerLine.from`) —
 *   always yes. This is CM6's own document-line unit, not a visual one:
 *   a long marker line that soft-*wraps* to several on-screen rows is
 *   still exactly one document line and one `.cm-line` element, so this
 *   check (and the hanging-indent CSS it enables) already covers every
 *   wrapped visual row of the marker's own line for free — nothing about
 *   soft-wrap ever reaches this function as a *separate* line to
 *   evaluate.
 * - **A later document line** genuinely indented to (or past) the
 *   marker's own content-start column — yes: this is real, intentional
 *   list-item continuation (a second loose-list paragraph, or lazy
 *   continuation the author actually indented), indistinguishable in
 *   spirit from typing more text directly onto the marker line itself.
 * - **A later document line with less indentation than that** — no, even
 *   though `nearestListItem()` still found an enclosing `ListItem` for
 *   it: this is exactly the case CommonMark's own leniency produces
 *   (zero-indent text merged into the same node purely because no blank
 *   line interrupted it), which is what real editors do not decorate.
 */
function lineOwnsListIndent(state: EditorState, item: SyntaxNode, line: Line): boolean {
  const marker = item.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return false;
  }

  const markerLine = state.doc.lineAt(marker.from);
  if (line.from === markerLine.from) {
    return true;
  }

  const separator = separatorRangeAfter(state, marker);
  if (!separator) {
    return false;
  }

  const requiredColumn = separator.to - markerLine.from;
  return firstNonWhitespaceOffset(line.text) >= requiredColumn;
}

/**
 * The real, unconcealed separator run between a `TaskMarker`'s own `]`
 * and the item's real content — deliberately **not** a reuse of
 * `listMarkerDecoration.ts`'s `separatorRangeAfter` (which bounds the gap
 * against `marker.nextSibling.from`). Confirmed directly against the
 * installed parser (`@lezer/markdown` + this codebase's own `TaskList`
 * extension) that `TaskMarker` has **no sibling at all** within its
 * `Task` node — `"- [ ]   task item"` parses as `Task[TaskMarker]` only,
 * the remaining `"   task item"` is not a tree node here. Reusing
 * `separatorRangeAfter` against a marker with no sibling silently falls
 * into its `marker.nextSibling ? ... : from + 1` fallback, which
 * always reports exactly one character of gap — correct only for the
 * single-space case, quietly wrong (under-measuring) for the multi-space
 * one. This walks the raw characters directly instead, bounded only by
 * the physical line's own end (mirroring how `leadingIndentDecoration.ts`
 * already treats raw whitespace runs — counted from `state.doc`, not
 * inferred from tree structure).
 */
function taskSeparatorRangeAfter(
  state: EditorState,
  taskMarker: SyntaxNode
): { from: number; to: number } | null {
  const from = taskMarker.to;
  const lineEnd = state.doc.lineAt(from).to;

  let to = from;
  while (to < lineEnd && /[ \t]/.test(state.sliceDoc(to, to + 1))) {
    to++;
  }

  return to > from ? { from, to } : null;
}

/**
 * The owning item's own hanging-indent pixel value, or `0` if this item's
 * marker isn't actually renderable yet (a bare marker with no real
 * separator — the same gate `listMarkerDecoration.ts`'s own
 * `getListMarkRange` uses, so an item with nothing reserved for it yet
 * gets nothing reserved here either).
 *
 * Task items are handled uniformly with bullet/ordered ones, not
 * excluded the way `listMarkerDecoration.ts`'s own `getListMarkRange` is:
 * `taskCheckboxDecoration.ts` conceals the marker + its own separator +
 * `[ ]` run (own doc comment: "`1. [ ] Task` -> `☐ Task`, number included
 * in the concealed range") and replaces it with one fixed-width checkbox
 * widget — so a task item's *own* footprint is always
 * `getTaskMarkerFootprintPx()`, regardless of bullet/ordered kind or
 * digit count, never the measured ordered-marker width. That concealment
 * stops exactly at the `TaskMarker` node's own end, though — the real
 * separator character(s) between `]` and the item's actual content are
 * deliberately left as ordinary, visible source text (confirmed by
 * reading `taskCheckboxDecoration.ts` directly), so this function adds
 * one further term for task items specifically: that separator's own
 * measured width (`getTaskSeparatorWidthPx()`), the same "real rendered
 * text, not a token" measurement approach `getOrderedMarkerFootprintPx()`
 * already uses for the ordered marker's own digits.
 */
function ownListItemIndentPx(
  view: EditorView,
  item: SyntaxNode,
  state: EditorState
): number {
  const marker = item.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return 0;
  }

  const raw = state.sliceDoc(marker.from, marker.to);
  const kind = classifyMarkerText(raw);
  if (!kind) {
    return 0;
  }

  const separator = separatorRangeAfter(state, marker);
  if (!separator) {
    return 0;
  }

  const markerLine = state.doc.lineAt(marker.from);
  const leadingPx = getLeadingWhitespaceWidthPx(markerLine.text);

  const taskMarker = taskMarkerOfListItem(item);
  if (taskMarker) {
    // The real, unconcealed separator between TaskMarker's own "]" and
    // the item's real content (`taskCheckboxDecoration.ts` conceals only
    // up to `taskMarker.to`, never past it). Absent (e.g. no space typed
    // yet after "]") means nothing extra to reserve. See
    // `taskSeparatorRangeAfter`'s own doc comment for why this can't
    // reuse `separatorRangeAfter` as-is.
    const taskSeparator = taskSeparatorRangeAfter(state, taskMarker);
    const separatorText = taskSeparator
      ? state.sliceDoc(taskSeparator.from, taskSeparator.to)
      : '';
    return (
      leadingPx +
      getTaskMarkerFootprintPx(view) +
      getTaskSeparatorWidthPx(view, separatorText)
    );
  }

  const markerFootprintPx =
    kind === 'ordered'
      ? getOrderedMarkerFootprintPx(view, state.sliceDoc(marker.from, separator.to))
      : getBulletMarkerFootprintPx(view);

  return leadingPx + markerFootprintPx;
}

function listLineMark(indentPx: number): Decoration {
  return Decoration.line({
    attributes: { class: 'cm-list-line', style: `--list-indent-px: ${indentPx}px` },
  });
}

function buildListLineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);

        const probePos = line.from + firstNonWhitespaceOffset(line.text);
        const item = nearestListItem(view.state, probePos);
        if (item && lineOwnsListIndent(view.state, item, line)) {
          const indentPx = ownListItemIndentPx(view, item, view.state);
          if (indentPx > 0) {
            builder.add(line.from, line.from, listLineMark(indentPx));
          }
        }
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

interface ListLineDecorationPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function listLineDecoration(): Extension {
  return ViewPlugin.fromClass<ListLineDecorationPlugin>(
    class implements ListLineDecorationPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildListLineDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildListLineDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}
