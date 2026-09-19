import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { findTableStartingAt } from '../table/tableGeometry';
import { BLOCK_SPACING_PARTICIPANTS } from './blockSpacingParticipants';
import { lineProbePos, resolveBoundaryHeight, type SeparatorHeight } from './separatorScope';

/**
 * One shared, empty, fixed-height block widget for every separator this
 * file emits — genuinely CM6-measured geometry (per `@codemirror/view`'s
 * own `WidgetDecorationSpec.block` doc comment: block-level decorations
 * participate in the editor's own height/position model), unlike
 * `margin` or CSS padding, neither of which this file uses. A widget was
 * specifically chosen over per-line CSS padding (an earlier version of
 * this system used `Decoration.line` classes for the physical-line case)
 * because a widget never touches any `.cm-line`'s own CSS properties —
 * confirmed by direct live-rendering comparison that a padding class
 * competing with `FencedCode`'s own `--first`/`--last` card-inset
 * padding on the same longhand property silently loses the cascade,
 * while a widget's own height is entirely unaffected by whatever
 * padding a neighboring line carries. That's what let `FencedCode` join
 * `separatorScope.ts`'s atomic set with no special-casing at all.
 */
class SeparatorWidget extends WidgetType {
  constructor(
    readonly height: Exclude<SeparatorHeight, 0>,
    /**
     * The table's own `.from` when this separator sits immediately above
     * that table's first line — `null` for every other separator (the
     * overwhelming common case). Purely additive: it changes nothing about
     * `height`, `toDOM()`'s visual output, or `estimatedHeight` — the only
     * difference is `toDOM()` attaching one `mousedown` listener when it's
     * non-null (below). Part of `eq()` so a table shifting position (an
     * edit elsewhere in the document) correctly rebuilds this widget with a
     * fresh closure over the new position, rather than CM6 reusing stale
     * DOM with a listener still bound to the old `tableFrom`.
     */
    readonly tableFrom: number | null = null
  ) {
    super();
  }

  override eq(other: SeparatorWidget): boolean {
    return other.height === this.height && other.tableFrom === this.tableFrom;
  }

  override toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement('div');
    dom.className = 'cm-block-separator';
    dom.style.height = `${this.height}px`;
    // Table-specific click-to-insert-a-line-above affordance — every other
    // separator (`tableFrom === null`) gets no listener at all and stays
    // exactly as inert as before this feature existed. Deliberately not a
    // generic "clickable separator" mechanism: only a table's own leading
    // separator is ever tagged with a non-null `tableFrom` in the first
    // place (`buildLineBoundarySeparators`, below).
    if (this.tableFrom !== null) {
      const tableFrom = this.tableFrom;
      // Identification only (mirrors `TableWidget`'s own `data-table-from`
      // convention) — no visual effect, not read by this listener itself.
      dom.dataset.tableFrom = String(tableFrom);
      dom.addEventListener('mousedown', (event) => {
        // Same pairing `TableWidget`'s own non-cell-click suppression uses
        // (`tableWidget.ts`): `preventDefault()` blocks the browser's
        // default action, `stopPropagation()` stops root CM6's own
        // `contentDOM` mousedown handling from also running for the same
        // click. `WidgetType.ignoreEvent()`'s own default (`true`) already
        // keeps CM6 from trying to place a caret here itself, for every
        // separator, table-tagged or not — this listener only adds the
        // insert-a-line behavior on top, never removes CM6's existing
        // "don't touch my own click handling" default.
        event.preventDefault();
        event.stopPropagation();
        // One blank line immediately before the table's own source range:
        // inserting a single `\n` at `tableFrom` pushes the table (and
        // everything after it) forward by one line without touching the
        // table's own text or anything below it, and the new blank line's
        // own start is `tableFrom` itself in the resulting document — the
        // exact position the cursor should land on.
        view.dispatch({
          changes: { from: tableFrom, to: tableFrom, insert: '\n' },
          selection: { anchor: tableFrom },
          scrollIntoView: true,
        });
      });
    }
    return dom;
  }

  override get estimatedHeight(): number {
    return this.height;
  }
}

function separatorRange(height: SeparatorHeight, pos: number, side: -1 | 1, tableFrom: number | null = null): Range<Decoration> | null {
  if (height === 0) {
    return null;
  }
  return Decoration.widget({ widget: new SeparatorWidget(height, tableFrom), block: true, side }).range(pos);
}

function firstNonWhitespaceOffset(text: string): number {
  return text.length - text.trimStart().length;
}

function nearestParticipant(state: EditorState, probePos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(probePos, 1);
  for (; node; node = node.parent) {
    if (BLOCK_SPACING_PARTICIPANTS.has(node.name)) {
      return node;
    }
  }
  return null;
}

/**
 * Every physical-line boundary in the document — the general case,
 * covering ordinary paragraphs (including a `Paragraph`'s own multiple
 * physical lines, which get no special treatment here — see
 * `resolveBoundaryHeight`'s own doc comment), blank lines, and entry/exit
 * of every grouping/atomic construct, uniformly, via one comparison per
 * adjacent line pair. This is also what makes empty-line editing stable:
 * the boundary is defined by line *position*, which typing into an
 * existing line never changes, so a separator can never appear,
 * disappear, or move just because the user filled in a blank line —
 * only inserting or removing a line does.
 *
 * Runs over the whole document on every edit, not just the visible
 * viewport — a `StateField` has no `view.visibleRanges` to scope
 * against (only a `ViewPlugin` does, and block decorations can't come
 * from one), so this is a real, unmeasured cost for very long documents
 * that a future pass may want to address (e.g. incremental re-resolution
 * around the changed range instead of a full rebuild) rather than
 * something already solved here.
 *
 * **A `FencedCode` node's own opening line needed no special-casing here
 * even before the 2026-09-16 wrapper-removal migration finished — the
 * remaining special-casing (a distinct zero-width-widget decoration shape
 * for exactly that line) existed solely to dodge `fencedCodeBlockWrapper.ts`'s
 * `EditorView.blockWrappers` absorbing a `side: -1` widget landing on its
 * own inclusive `.from` boundary. With that wrapper deleted entirely,
 * there is no such boundary to collide with — every line boundary in the
 * document, fenced-code entry included, uses this function's one ordinary
 * `separatorRange(height, line.from, -1)` path uniformly, with zero
 * per-construct branching.** See `docs/editor-architecture-decisions.md`'s
 * wrapper-removal entry for the fuller before/after account.
 */
/**
 * The click-to-insert-a-line-above affordance is **only** for the specific
 * case a table has no real document content above it at all — a table
 * that already has *any* line/content above it (the ordinary case the
 * ordinary per-boundary loop below handles) gets a ordinary, untagged,
 * non-interactive separator, identical to what it rendered before this
 * feature existed. That boundary is deliberately never tagged: clicking a
 * separator that already sits above real content must be a true no-op
 * (per this feature's own product requirement — inserting a *second* line
 * there was an earlier, incorrect design), so the correct implementation
 * is simply "never attach the affordance there," not "attach it, then
 * make the transaction a no-op." `state.readOnly` (a note embed's nested
 * view) never gets the leading tag either — that view has no write path
 * for the insert-a-line-above transaction to use, so the affordance must
 * not exist there at all, same "omit the capability entirely" gate this
 * codebase's other table interactions already apply for read-only views
 * (`tableWidget.ts`'s own `controller: undefined` case).
 */
function leadingTableClickTag(state: EditorState): number | null {
  if (state.readOnly) {
    return null;
  }
  return findTableStartingAt(state, state.doc.line(1).from)?.from ?? null;
}

function buildLineBoundarySeparators(state: EditorState): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  // A table at the very start of the document has no preceding line for
  // the loop below to ever compare against (it starts at n=2) — normally
  // correct (nothing needs a leading gap above the document's own first
  // line), but a table specifically still needs its own separator here so
  // the click-to-insert-a-line-above affordance has somewhere to render
  // for a table-only or table-first document. Only `Table` gets this
  // synthetic leading boundary (via `leadingTableClickTag`'s own
  // table-only check) — every other construct at document start still
  // gets no leading separator, unchanged. `12` matches
  // `resolveBoundaryHeight`'s own default top-level case (the height a
  // table entering from ordinary preceding content already gets, below)
  // — tables are never nested inside a list/blockquote in this codebase
  // (`tableActivationNormalization.ts`'s own doc comment), so that
  // default is always the correct height for a leading table, not a
  // guess.
  const leadingTableFrom = leadingTableClickTag(state);
  if (leadingTableFrom !== null) {
    const separator = separatorRange(12, state.doc.line(1).from, -1, leadingTableFrom);
    if (separator) {
      ranges.push(separator);
    }
  }

  for (let n = 2; n <= state.doc.lines; n++) {
    const prevProbe = lineProbePos(state, n - 1);
    const probe = lineProbePos(state, n);
    const height = resolveBoundaryHeight(state, prevProbe, probe);
    const line = state.doc.line(n);
    // No table-click tag here — see `leadingTableClickTag`'s own doc
    // comment: a boundary reached only via this ordinary per-line loop
    // always has real content/a real line above it, which is exactly the
    // case this feature must leave untouched.
    const separator = separatorRange(height, line.from, -1);
    if (separator) {
      ranges.push(separator);
    }
  }

  return ranges;
}

/**
 * Same-physical-line boundaries around an `Image`/`Embed` that shares
 * its line with real text (`before ![img](url) after`) — invisible to
 * {@link buildLineBoundarySeparators}, which only ever compares whole
 * lines to each other, never positions within one line. Uses the same
 * {@link resolveBoundaryHeight} rule (so an inline embed nested inside a
 * list/blockquote correctly gets 6px here too, not a hardcoded 12), and
 * the same widget/emission mechanism — this is the "one shared boundary
 * resolver, one shared emission mechanism" the physical-line and
 * same-line cases both go through, not two parallel implementations.
 */
function buildInlineParticipantSeparators(state: EditorState): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (!BLOCK_SPACING_PARTICIPANTS.has(node.name)) {
        return;
      }

      const line = state.doc.lineAt(node.from);

      const before = state.sliceDoc(line.from, node.from);
      if (before.trim().length > 0) {
        const height = resolveBoundaryHeight(state, line.from, node.from);
        const separator = separatorRange(height, node.from, -1);
        if (separator) {
          ranges.push(separator);
        }
      }

      const after = node.to <= line.to ? state.sliceDoc(node.to, line.to) : '';
      if (after.trim().length > 0) {
        const probePos = node.to + firstNonWhitespaceOffset(after);
        const following = nearestParticipant(state, probePos);
        const deferredToNextParticipant = following !== null && following.from === probePos;
        if (!deferredToNextParticipant) {
          const height = resolveBoundaryHeight(state, node.to, probePos);
          const separator = separatorRange(height, node.to, 1);
          if (separator) {
            ranges.push(separator);
          }
        }
      }
    },
  });

  return ranges;
}

function buildSeparators(state: EditorState): Range<Decoration>[] {
  return [...buildLineBoundarySeparators(state), ...buildInlineParticipantSeparators(state)];
}

/**
 * A `StateField`, not a `ViewPlugin` and not a view-dependent decorations
 * function — CM6 throws `RangeError: Block decorations may not be
 * specified via plugins` for either of those (confirmed directly against
 * the installed `@codemirror/view`). Block-level decorations must be
 * transaction-synchronized, unlike `EditorView.blockWrappers` (confirmed
 * against the installed `@codemirror/view` source: its facet input does
 * accept a view function) — the two mechanisms are not interchangeable in
 * what's allowed to produce them.
 */
const blockSeparatorField = StateField.define<DecorationSet>({
  create(state) {
    return Decoration.set(buildSeparators(state), true);
  },
  update(value, tr) {
    if (tr.docChanged) {
      return Decoration.set(buildSeparators(tr.state), true);
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * The single, unified spacing system for the editor: resolves every
 * boundary — between physical lines, and between a same-line `Image`/
 * `Embed` and its flanking text — to a height (12/6/0, see
 * `separatorScope.ts`), and emits exactly one `Decoration.widget` when
 * that height is non-zero. Replaces the previous global
 * `.cm-line { padding-block: 3px }` rule entirely (see
 * `MarkdownEditor.css`'s `.cm-line` rule, now `padding-block: 0`) — there
 * is no second, padding-based spacing mechanism anywhere in the editor.
 */
export function blockSeparatorDecoration(): Extension {
  return blockSeparatorField;
}
