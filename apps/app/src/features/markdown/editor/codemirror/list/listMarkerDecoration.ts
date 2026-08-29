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
 * Live Preview rendering for **unordered/bullet** list markers (`-`, `*`,
 * `+`) — the first, deliberately narrow slice of list rendering. Ordered
 * lists, task checklists, and any editing-behavior work (Tab/Shift-Tab
 * beyond what `markdownIndentContext.ts` already resolves, structural
 * Backspace/Enter) are out of scope for this slice; see
 * docs/editor-architecture-decisions.md for that boundary.
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
function getBulletMarkRange(node: SyntaxNode, state: EditorState): { from: number; to: number } | null {
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

function markerMark(raw: string): Decoration {
  if (raw === '*') {
    return MARKER_MARK_DOT;
  }
  return raw === '+' ? MARKER_MARK_PLUS : MARKER_MARK_DASH;
}

function buildDecorations(view: EditorView): DecorationSet {
  const pending: { from: number; to: number }[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (!isBulletListItemNode(node.name)) {
          return;
        }

        const range = getBulletMarkRange(node.node, view.state);
        if (range) {
          pending.push(range);
        }
      },
    });
  }

  // Sorted once via Decoration.set(_, true) rather than inserted in tree
  // visitation order via RangeSetBuilder: a nested item's marker starts
  // after its parent's own marker, but iteration order across levels isn't
  // guaranteed strictly ascending by construction.
  return Decoration.set(
    pending.map(({ from, to }) => {
      const raw = view.state.sliceDoc(from, from + 1);
      return markerMark(raw).range(from, to);
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
function bulletContentStart(state: EditorState, pos: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (isBulletListItemNode(node.name)) {
      const range = getBulletMarkRange(node, state);
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
    if (!range.empty || range.assoc !== -1 || !bulletContentStart(tr.state, range.head)) {
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
