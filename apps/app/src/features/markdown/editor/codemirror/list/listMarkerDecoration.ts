import { syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, Transaction, type Extension } from '@codemirror/state';
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
 * Live Preview rendering for **bullet** (`-`, `*`, `+`) **and ordered**
 * (`1.`, `1)`, ...) list markers. Task checklists and any editing-behavior
 * work beyond what this file and `markdownEnterKeymap.ts` already cover are
 * still out of scope; see docs/editor-architecture-decisions.md for that
 * boundary and docs/list-item-architecture-odr.md for the full record.
 *
 * **Bullet and ordered markers share one `buildDecorations` pass and one
 * `seenLines` set (2026-08-29, ordered-list extension) — not two
 * independent plugins.** This is load-bearing, not a style choice: the
 * same-line CommonMark empty-item ambiguity §7/§12 of the ODR documents for
 * bullets (`- - - - Text`) reproduces identically **across** marker kinds
 * — confirmed directly against the installed parser — `"- 1. Text"` parses
 * as a `BulletList` whose sole item's content is an `OrderedList`, all on
 * one physical line, exactly like same-kind collapsing. If bullet and
 * ordered decoration were two separate `ViewPlugin`s each keeping their own
 * `seenLines`, a mixed line like that would render **two** markers (one
 * per plugin), silently breaking the "first `ListMark` per physical line"
 * policy the moment a line mixes kinds. One shared set, keyed by
 * `line.from` and populated by kind-agnostic tree order, is the only way to
 * keep the policy true for a mixed-kind line without duplicating the
 * dedup logic in two files (`ARCHITECTURE_RULES`-style "one rule, one
 * implementation" — this module's own version of that rule).
 *
 * Ordered markers are never glyph-substituted (no `*→•`-style pseudo-
 * element): a real digit sequence has no product-approved substitute glyph,
 * so `data-marker-glyph`/`::before` painting (§3 of the ODR) is bullet-only
 * machinery, not reused here. The marker span is real, visible text,
 * right-aligned within its own box (`text-align: right`/`min-width`, not
 * bullets' fixed `width`; see `MarkdownEditor.css`'s own doc comment for
 * the measured caveat — this does not unify content-start *across* items
 * of different digit counts, only flushes each item's own separator end
 * against its own box's right edge). Unlike bullets' `text-align: center`
 * starting point, there is no glyph-vs-box mismatch to fix for
 * `listMarkerCaretAssoc()`: the real, visible text's own right edge always
 * coincides with its own box's right edge by construction, so no §4/§5-
 * style caret or selection gap was ever introduced for this kind.
 *
 * **Real, source-backed marker — a plain `Decoration.mark`, no widget, no
 * concealment, no visual transformation (2026-08-29).** Modeled directly
 * on `blockquoteMarkerDecoration.ts`'s own structural pattern (a standalone
 * `ViewPlugin`, not the shared `liveMarkDecoration`/`liveMarkSelectionSnap`
 * mechanism heading uses) for the same reason that file's own doc comment
 * states: `liveMarkDecoration` exists specifically to *replace* a marker
 * range with something else (`Decoration.replace`), and this construct
 * deliberately never does that.
 *
 * Unlike blockquote, this construct has **no reveal/conceal state at all**
 * — the marker is real text, always rendered exactly as written, in both
 * "engaged" and "at rest" states. `- Bullet` always shows as `- Bullet`,
 * never `• Bullet`. This was an explicit, deliberate product requirement,
 * verified live in the running app before landing: an isolated probe
 * decoration (a plain `Decoration.mark` with no CSS attached at all) was
 * mounted temporarily in `MarkdownEditor.tsx`, and every position/gesture
 * tested — click before the marker, between the marker and its separator,
 * at content-start, mid-word; ArrowLeft/ArrowRight stepping through the
 * marker one character at a time; Backspace/Delete at the boundary —
 * behaved exactly like ordinary undecorated text, because it *is* ordinary
 * text with a styling hook, not a replaced range.
 *
 * This retires the prior architecture entirely (`ListBulletWidget.ts`,
 * `Decoration.replace`, a `•` glyph standing in for the source). That
 * architecture was never an approved decision (see the file's own former
 * doc comment / commit `b485cb3e`, "list bullet progress day 1" — no
 * rationale recorded) and had a real, traced consequence: a click landing
 * exactly at content-start (the position immediately after the replaced
 * range — the legitimate resting position before the item's own text) was
 * misidentified by `liveMarkSelectionSnap.ts` as "inside the replaced
 * range" and redirected backward into the marker. A real, source-backed
 * mark has no replaced range for any such correction to exist for.
 *
 * The marker carries its own construct-specific class
 * (`cm-bullet-list-marker`, `MarkdownEditor.css`) styled identically to
 * blockquote's own marker (`--marker-width`/`--marker-foreground`,
 * `text-indent: 0`) for visual consistency with every other marker in the
 * editor — a color tint and a predictable column width, never a
 * character substitution. It deliberately does not carry the shared
 * `cm-marker`/`cm-list-marker` naming-contract hooks: those exist for a
 * different (currently unused) global-marker-color feature and would
 * double-apply the same tint redundantly, not for any product reason
 * specific to this construct.
 *
 * Enter/Backspace/Tab behavior is unaffected by this migration — confirmed
 * directly, not assumed: `insertNewlineContinueMarkupCommand` and
 * `deleteMarkupBackward` (`@codemirror/lang-markdown`) operate purely on
 * `state.doc`/`syntaxTree` positions, with no coupling to which decoration
 * (if any) is active over those positions. Verified three independent
 * ways this session: decoration present vs. absent (byte-identical
 * results), a fully undecorated control mount, and this exact
 * `Decoration.mark`-based probe — Enter at content-start still produces
 * `"-\n- Bullet"` (the separator moves to the new line's own fresh
 * marker) in every case. That is a real, separate, upstream CM6
 * characteristic, out of scope for this change.
 *
 * `ListItem`'s `firstChild` is always `ListMark` (confirmed against the
 * installed `@lezer/markdown@1.7.2`, for bullet, ordered, and task markers
 * alike). This module claims a `ListMark` whose text is `-`/`*`/`+`
 * (bullet) or matches `\d{1,9}[.)]` (ordered, CommonMark's own start-number
 * limit — confirmed against the installed parser: `"1234567890. Text"`,
 * ten digits, does not parse as a list at all), as long as its item is not
 * a task (`TaskList` is enabled at the grammar level for both bullet and
 * ordered items alike — confirmed directly, `"1. [ ] task"` produces a
 * `Task`/`TaskMarker` child exactly like `"- [ ] task"` — but checklist
 * *rendering* is explicitly out of scope this slice, so a `- [ ] …`/
 * `1. [ ] …` item is left completely unrendered here).
 *
 * Nesting requires no special handling: a nested `ListItem` is visited by
 * the same tree walk as any other, entirely independently of its parent's
 * own marker decoration. Leading indentation before a nested marker is
 * already rendered by the construct-agnostic `leadingIndentDecoration.ts`
 * (per-character, any line, no syntax-tree awareness) — this module must
 * not, and does not, re-decorate that range a second time.
 */
function isListItemNode(nodeName: string): boolean {
  return nodeName === 'ListItem';
}

const BULLET_MARKER_CHARACTERS: ReadonlySet<string> = new Set(['-', '*', '+']);

/**
 * CommonMark's own ordered-marker shape: 1-9 digits (its own start-number
 * limit — a 10th digit and the line stops parsing as a list at all,
 * confirmed against the installed parser) followed by `.` or `)`. Matched
 * against the raw `ListMark` text, never against the surrounding line —
 * this is a classification of an already-parsed node's own text, not a
 * second, parser-duplicating regex scan of raw source.
 */
const ORDERED_MARKER_PATTERN = /^\d{1,9}[.)]$/;

export type ListMarkerKind = 'bullet' | 'ordered';

/**
 * Exported so `markdownEnterKeymap.ts`'s marker-kind guards (content-start
 * split preservation, Backspace) classify a `ListMark`'s raw text via the
 * identical rule this file's own rendering uses, rather than keeping a
 * second `BULLET_MARKER_CHARACTERS`-style set nearby "because it's easier
 * than importing it" (the exact duplication `ARCHITECTURE_RULES.md` rule 5
 * warns about, applied to this file's own business rule).
 */
export function classifyMarkerText(raw: string): ListMarkerKind | null {
  if (BULLET_MARKER_CHARACTERS.has(raw)) {
    return 'bullet';
  }
  return ORDERED_MARKER_PATTERN.test(raw) ? 'ordered' : null;
}

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
 * Markdown this must still mark correctly, extending the decoration to
 * cover the full real separator rather than assuming a fixed width.
 *
 * Bounded to the marker's own physical line (`Math.min(to, line.to)`):
 * confirmed by direct inspection of a real parsed tree (`"-\n  - nested"`)
 * that `ListMark`'s next sibling can be a nested list starting on a
 * *later* line, with only whitespace (including the intervening `\n`)
 * physically between them — an ungated "whitespace-only gap" check would
 * misidentify that real line break as separator whitespace and try to
 * extend this same-line decoration across it. A separator span, by
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

/**
 * A bare marker with nothing after it on its own physical line (`-`,
 * cursor still mid-keystroke before the separator space is typed) is a
 * syntactically valid, complete, empty `ListItem` per CommonMark — the
 * parser is right to produce a `ListMark` for it (confirmed directly
 * against the installed `@lezer/markdown`: `ListMark[0,1)` for `"-"` is
 * byte-identical to `ListMark[0,1)` for `"- "`). But this construct's own
 * marker class should not apply until the marker actually *has* a real
 * separator after it — the same bare-marker gate as before, unchanged by
 * the widget-to-mark migration.
 */
interface ListMarkRange {
  readonly from: number;
  readonly to: number;
  readonly kind: ListMarkerKind;
}

function getListMarkRange(node: SyntaxNode, state: EditorState): ListMarkRange | null {
  const marker = node.firstChild;
  if (!marker || marker.name !== 'ListMark') {
    return null;
  }

  const raw = state.sliceDoc(marker.from, marker.to);
  const kind = classifyMarkerText(raw);
  if (!kind || hasTaskChild(node)) {
    return null;
  }

  const separator = separatorRangeAfter(state, marker);
  if (!separator) {
    return null;
  }

  return { from: marker.from, to: separator.to, kind };
}

/**
 * Shared with `markdownEnterKeymap.ts` — the same "first `ListMark` per
 * physical line" fact `buildDecorations` below establishes for rendering
 * (a same-line CommonMark empty-item chain like `- - - - Text` is visually
 * collapsed to one marker), queried here for a single position instead of
 * accumulated across a whole rebuild. Reuses `isListItemNode`/
 * `getListMarkRange` — the exact same node-matching and range rules the
 * decoration itself uses — rather than re-deriving "what counts as a list
 * marker" a second time.
 *
 * **Kind-agnostic (2026-08-29, ordered-list extension)**: the same-line
 * collapse ambiguity is not bullet-specific — confirmed against the
 * installed parser that `"1. - 1. Text"` (ordered/bullet/ordered, all one
 * physical line) is exactly as valid and exactly as nested as an all-bullet
 * chain. This walk collects `ListMark` ranges of *either* kind and returns
 * whichever starts first, regardless of kind — a caller that needs to know
 * which kind won reads `.kind` off the result, same as `buildDecorations`
 * does.
 *
 * Walks every `ListItem` ancestor of `pos` (not just the innermost one),
 * keeping only the ones whose own marker starts on `pos`'s exact physical
 * line, then returns the smallest-`.from` (outermost/first) of those.
 * Returns `null` whenever fewer than two such markers exist on the line —
 * meaning there is nothing "collapsed" here at all: a single-level item,
 * or an ancestor whose marker is genuine different-line nesting (e.g.
 * `- Parent` / `  - Child` — Parent's own marker sits on a different
 * physical line than Child's, so only Child's counts, length stays 1).
 */
export function firstSameLineListMark(state: EditorState, pos: number): ListMarkRange | null {
  const line = state.doc.lineAt(pos);
  const sameLine: ListMarkRange[] = [];

  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (!isListItemNode(node.name)) {
      continue;
    }
    const range = getListMarkRange(node, state);
    if (range && state.doc.lineAt(range.from).from === line.from) {
      sameLine.push(range);
    }
  }

  if (sameLine.length < 2) {
    return null;
  }

  return sameLine.reduce((a, b) => (a.from < b.from ? a : b));
}

/**
 * TEMPORARY PROTOTYPE (2026-08-29) — investigating whether the real marker
 * text can lay out flush-left (fixing the `text-align: center`-caused
 * selection-boundary gap — see this session's own investigation) while
 * still *painting* `-`/`+`/`*→•` at their current, unchanged optical
 * position, via the same `color: transparent` + `::before` technique
 * already proven for `*` alone. All three marker characters now go
 * through this mechanism uniformly. Not a permanent decision: no
 * engagement/editing/keymap code changed, meant to be removed or promoted
 * after the requested verification pass, not committed as-is.
 *
 * `attributes: {'data-marker-glyph': glyph}` supplies the one per-instance
 * fact CSS's `content: attr(data-marker-glyph)` needs — one shared
 * `::before` rule for the flush-left/transparent mechanism, rather than a
 * separate `content: '-'`/`content: '+'`/`content: '•'` rule per kind.
 */
const MARKER_MARK_DASH = Decoration.mark({
  class: 'cm-bullet-list-marker cm-bullet-list-marker--glyph cm-bullet-list-marker--dash',
  attributes: { 'data-marker-glyph': '-' },
});
const MARKER_MARK_PLUS = Decoration.mark({
  class: 'cm-bullet-list-marker cm-bullet-list-marker--glyph cm-bullet-list-marker--plus',
  attributes: { 'data-marker-glyph': '+' },
});
const MARKER_MARK_DOT = Decoration.mark({
  class: 'cm-bullet-list-marker cm-bullet-list-marker--glyph cm-bullet-list-marker--dot',
  attributes: { 'data-marker-glyph': '•' },
});

function bulletMarkerMark(raw: string): Decoration {
  if (raw === '*') {
    return MARKER_MARK_DOT;
  }
  return raw === '+' ? MARKER_MARK_PLUS : MARKER_MARK_DASH;
}

/**
 * The ordered marker's own `Decoration.mark` — real, visible text (no
 * `data-marker-glyph`/`::before` substitution; see this file's own top
 * doc comment for why bullets' glyph-painting mechanism doesn't apply
 * here). `cm-list-marker` is the shared tint class every list-marker kind
 * but bullets opts into (`MarkdownEditor.css`'s own comment on that class
 * already anticipated ordered numbers wanting it); `cm-ordered-list-marker`
 * carries the kind-specific box geometry (`min-width`/`text-align: right`).
 * One shared instance, not one per digit-count: the box's own CSS handles
 * every width, so there is nothing per-instance to parameterize.
 */
const MARKER_MARK_ORDERED = Decoration.mark({
  class: 'cm-list-marker cm-ordered-list-marker',
});

/**
 * Same-line repeat-marker suppression (2026-08-29) — `- - - - hey` is a
 * genuinely valid, CommonMark-correct parse (each `- ` after the first is
 * an empty list item whose own content is *another* list, all on one
 * physical line with no indentation) — confirmed directly against the
 * installed parser, not assumed; see this session's own investigation.
 * Rendering all of them as separate marker columns is structurally
 * accurate but reads as a bug, so only the first `ListMark` encountered
 * on a given physical line gets the marker decoration; every later one on
 * that *same* line is left as ordinary, undecorated source text —
 * `seenLines` (keyed by `line.from`, reset per `buildDecorations` call)
 * is the entire mechanism.
 *
 * **One `seenLines` set for both bullet and ordered markers together**
 * (2026-08-29, ordered-list extension) — not one set per kind. Confirmed
 * against the installed parser that the same-line collapse ambiguity
 * crosses marker kinds (`"- 1. Text"`/`"1. - Text"` are both valid,
 * genuinely nested parses, exactly like an all-bullet chain); two
 * independently-`seenLines`'d passes would each decorate their own kind's
 * first marker on such a line, rendering two markers where the policy
 * calls for one. Tree iteration visits nodes in document order and
 * pre-order visits an outer `ListItem` before its nested child regardless
 * of kind (the same fact §7 of the ODR already established for same-kind
 * chains), so "first encountered per line, across both kinds" is
 * automatically "outermost/leftmost" here too, with no extra sorting.
 *
 * This works without any change to editing behavior because it only
 * decides which `range` gets pushed into `pending` below — nothing about
 * `getListMarkRange`, the document, the syntax tree, or any keymap
 * changes. A later `ListMark` that starts on a *different* physical line
 * (genuine indented nesting, e.g. `- Parent\n  - Child`) is completely
 * unaffected: `seenLines` is keyed per line, so a new line always starts
 * with a clean slate. Rebuilt fresh on every `docChanged`/`viewportChanged`
 * update (same as the rest of this function), so the result depends only
 * on the current tree and line structure — never on typing history, which
 * is what keeps typed, pasted, and reloaded `- - - - hey` all rendering
 * identically.
 */
function buildDecorations(view: EditorView): DecorationSet {
  const pending: ListMarkRange[] = [];
  const seenLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isListItemNode(node.name)) {
          return;
        }

        const range = getListMarkRange(node.node, view.state);
        if (!range) {
          return;
        }

        const lineFrom = view.state.doc.lineAt(range.from).from;
        if (seenLines.has(lineFrom)) {
          return;
        }
        seenLines.add(lineFrom);
        pending.push(range);
      },
    });
  }

  // Sorted once via Decoration.set(_, true) rather than inserted in tree
  // visitation order via RangeSetBuilder: a nested item's marker starts
  // after its parent's own marker, but iteration order across levels isn't
  // guaranteed strictly ascending by construction.
  return Decoration.set(
    pending.map(({ from, to, kind }) => {
      if (kind === 'ordered') {
        return MARKER_MARK_ORDERED.range(from, to);
      }
      const raw = view.state.sliceDoc(from, from + 1);
      return bulletMarkerMark(raw).range(from, to);
    }),
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
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (p) => p.decorations,
    }
  );
}

/**
 * TEMPORARY PROTOTYPE (2026-08-29) — fixes the caret-rendering asymmetry
 * at a bullet item's content-start position (`- |Text`): arriving via
 * ArrowRight lands the caret rect against the centered `- ` run's own
 * (short-of-`Text`) end, per `SelectionRange.assoc`'s `-1` value, which
 * `RectangleMarker.forRange`'s `coordsAtPos(head, assoc || 1)` then reads
 * literally — arriving via ArrowLeft instead gets `assoc: 1`, which reads
 * `Text`'s own start and touches it correctly. Traced to
 * `@codemirror/view`'s `moveVisually`: `span.forward(forward, dir) ? -1 :
 * 1` — forward (rightward) motion always produces `-1` for ordinary LTR
 * text, backward always produces `1`, independent of any marker CSS. Full
 * investigation: this session's own caret-affinity research.
 *
 * `assoc` is a pure rendering/motion-continuation hint on
 * `SelectionRange`, never part of the document position — `head`/`from`/
 * `to` stay exactly the same integer either way, and Backspace/Delete/
 * insertion all operate on those integers, never on `assoc`. Normalizing
 * it here changes nothing about editing: this only intercepts the
 * *resulting* selection of a transaction and swaps `assoc: -1` for
 * `assoc: 1` at exactly one position (a bullet item's own content-start),
 * leaving every other position, every other construct, and every other
 * transaction untouched.
 */
/**
 * Kind-agnostic (2026-08-29, ordered-list extension): queried for content-
 * start at *any* list item, bullet or ordered. Ordered markers are never
 * expected to actually need this fix in practice — their real, visible,
 * right-aligned text already lays out with its own end flush against the
 * box edge (see this file's own top doc comment), so `coordsAtPos` should
 * already agree from both motion directions without any transaction-filter
 * correction. Kept kind-agnostic anyway rather than gated to bullets only:
 * the guard is a pure "does this transaction's resulting selection land
 * exactly here, with this specific `assoc`" check, so broadening it costs
 * nothing when the mismatch doesn't occur for a given kind, and correctly
 * self-heals if it ever does (a future font/box change, for instance)
 * without a second, kind-specific copy of this filter.
 */
function listContentStart(state: EditorState, pos: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (isListItemNode(node.name)) {
      const range = getListMarkRange(node, state);
      return range !== null && range.to === pos;
    }
  }
  return false;
}

export function listMarkerCaretAssoc(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.selection) {
      return tr;
    }

    const range = tr.selection.main;
    if (!range.empty || range.assoc !== -1 || !listContentStart(tr.state, range.head)) {
      return tr;
    }

    // Returning a bare `{selection}` spec here (as an earlier version of
    // this filter did) is resolved via `resolveTransaction(startState,
    // ...)` — against the *pre*-transaction state, with no `changes` of
    // its own — which silently discards whatever document edit the
    // intercepted transaction carried (confirmed directly: Backspace
    // joining `- ` + a following plain line, `"- \nText"` -> `"- Text"`,
    // instead left the document completely unchanged while moving the
    // caret to where it would have landed *had* the join happened,
    // because the join itself was thrown away). Returning a real
    // `Transaction` (via `startState.update(...)`, carrying `tr.changes`
    // forward) is treated as an already-resolved transaction by
    // `filterTransaction` and used verbatim — the actual fix is
    // preserving `changes`/`effects`/`userEvent`, not the selection
    // rewrite itself, which was never the problem. `Transaction` has no
    // public API to forward its full raw annotation set, so `userEvent`
    // is carried explicitly (the one annotation other extensions — undo
    // grouping in particular — actually key off); every other annotation
    // this codebase sets is internal to a single command's own dispatch
    // and not read back afterward.
    return tr.startState.update({
      changes: tr.changes,
      selection: EditorSelection.cursor(range.head, 1),
      effects: tr.effects,
      userEvent: tr.annotation(Transaction.userEvent),
      scrollIntoView: tr.scrollIntoView,
    });
  });
}
