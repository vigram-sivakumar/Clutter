import type { Extension, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type PluginValue, type ViewUpdate } from '@codemirror/view';

import './tableColumnWidthsConcealment.css';
import { resolveExistingAttributeLineRange } from './tableColumnWidthMetadata';
import { findAllTables } from './tableGeometry';

/**
 * Conceals a table's own `{table-col-widths="..."}` attribute line
 * permanently — never revealed, in either engaged or at-rest state. Same
 * requirement shape, and the same mechanism, as
 * `task/taskCompletionMetadataDecoration.ts`'s own concealment of
 * `@completed:<date>`: presentation metadata that must stay in the
 * document and remain readable by the tools that need it (here,
 * `resolveTableColumnWidths`/the resize commit path), but must never
 * appear as visible text in the rendered editor, and has no "edit the raw
 * syntax in place" use case to preserve a reveal-on-engagement state for.
 * `Decoration.replace({})` — zero-width, no widget, no DOM text node — is
 * the same concealment primitive that file already uses, for the same
 * documented reason (a `display:none` text node still participates in
 * native hit-testing; a real `Decoration.replace` with nothing rendered
 * does not).
 *
 * **Found via table adjacency, not a syntax-tree node.** Unlike
 * `TaskCompletionMetadata`, the attribute line has no dedicated Lezer
 * grammar node of its own — by design, per `tableColumnWidthMetadata.ts`'s
 * own top doc comment: it's deliberately plain paragraph text so the
 * table's own GFM grammar never has to change. So the candidate range here
 * comes from `resolveExistingAttributeLineRange` (this table's own
 * immediately-following line, if it's shaped like this attribute at all)
 * rather than a tree walk for a node type — the exact same lax,
 * shape-only check the resize commit path (`tableColumnResizeHandle.ts`)
 * already uses to decide where to write, reused here rather than a second
 * "is this line ours" test. Using the lax check (not the strict,
 * validating `resolveTableColumnWidths`) is deliberate: a malformed or
 * stale-count attribute line is still *our* metadata syntax, never meant
 * for a human to read directly, whether or not it currently parses
 * cleanly — concealing it regardless of validity is what keeps "invalid
 * metadata still gets hidden" true, matching `resolveTableColumnWidths`'s
 * own unchanged fallback-to-auto-sizing behavior for width *resolution*,
 * which this file has no opinion on and never touches.
 *
 * **Whole-document scan (`findAllTables`), not viewport-scoped**, unlike
 * `taskCompletionMetadataDecoration.ts`'s own `view.visibleRanges` loop —
 * deliberately: `findAllTables` already does its own full-tree walk
 * internally (the same call `tableWidgetField.ts`'s own
 * `buildTableDecorations` already makes unconditionally for table
 * rendering itself), so scoping this file's own outer loop to the
 * viewport would not actually skip that inner cost, only risk a
 * still-hidden-until-scrolled edge case for no real savings. Matches the
 * table feature's own established whole-document convention, not the
 * syntax-node-scan convention `taskCompletionMetadataDecoration.ts`
 * follows for an unrelated reason (there, the *tree iteration itself* is
 * genuinely viewport-scoped, so skipping out-of-view work is real).
 *
 * **A whole-line `Decoration.line()` class collapses the now-empty line's
 * own box to zero height** (`tableColumnWidthsConcealment.css`) — the text
 * concealment alone would still leave a blank line's worth of vertical
 * space between the table and whatever follows it, which reads as a
 * stray gap, not "the metadata paragraph itself should not be visible."
 * `Decoration.line()` needs no `StateField` (unlike a `block: true`
 * replace/widget decoration, which `tableWidgetField.ts`'s own doc
 * comment notes CM6 refuses from a plugin) — a plain `ViewPlugin` is
 * sufficient, confirmed against this codebase's own existing precedent
 * (`hr/horizontalRuleDecoration.ts` already combines line + replace
 * decorations from a `ViewPlugin` the same way).
 *
 * **Applies unconditionally, editable or read-only** — registered
 * alongside `tableWidgetDecoration()` in `buildEditorExtensions.ts`,
 * neither gated behind `!readOnly`: this is pure presentation, with
 * exactly the same relevance to a read-only note-embed's own nested table
 * rendering as to the top-level editor.
 */

const HIDDEN_LINE_CLASS = 'cm-table-col-widths-hidden-line';
const hiddenLineDecoration = Decoration.line({ class: HIDDEN_LINE_CLASS });

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  for (const table of findAllTables(view.state)) {
    const range = resolveExistingAttributeLineRange(view.state, table);
    if (!range) {
      continue;
    }
    decorations.push(Decoration.replace({}).range(range.from, range.to));
    decorations.push(hiddenLineDecoration.range(range.from));
  }
  return Decoration.set(decorations, true);
}

interface TableColumnWidthsConcealmentPlugin extends PluginValue {
  decorations: DecorationSet;
}

export function tableColumnWidthsConcealment(): Extension {
  return ViewPlugin.fromClass<TableColumnWidthsConcealmentPlugin>(
    class implements TableColumnWidthsConcealmentPlugin {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (p) => p.decorations }
  );
}
