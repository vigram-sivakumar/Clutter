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
 * No CSS is attached to the marker span deliberately, not by omission:
 * this construct's own shared naming-contract hooks (`cm-marker`,
 * `cm-list-marker`) already carry a `color: var(--marker-foreground)` tint
 * in `MarkdownEditor.css`, which would itself be a (small) visual change
 * from plain, undecorated source text — exactly what this construct's
 * product requirement rules out. The marker still carries its own
 * construct-specific class (`cm-bullet-list-marker`) as a stable styling
 * hook for future, deliberate work, but nothing currently targets it with
 * a rule.
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

const MARKER_MARK = Decoration.mark({ class: 'cm-bullet-list-marker' });

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
    pending.map(({ from, to }) => MARKER_MARK.range(from, to)),
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
