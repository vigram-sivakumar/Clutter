import { ensureSyntaxTree } from '@codemirror/language';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { projectableTableSnapshot } from '../table-engine/tableModel';
import { TableProjection } from '../table-engine/tableProjection';
import { tableDeletionSelectionChanged, tableDeletionSelectionField } from './tableDeletionSelection';
import type { OnTableHandleMenuChange } from './tableHandleMenuSync';
import { findAllTables, tableIntersectsSelectionRange } from './tableGeometry';

function buildDecorations(state: EditorState, editable: boolean, onMenu: () => OnTableHandleMenuChange | undefined): DecorationSet {
  // Block replacements must cover the complete document, including tables
  // outside the viewport after history or a structural edit.
  const source = state.doc.toString();
  const tree = ensureSyntaxTree(state, state.doc.length, 5000) ?? sharedMarkdownParser.parse(source);
  const ranges: Range<Decoration>[] = [];
  for (const table of findAllTables(state, tree)) {
    const snapshot = projectableTableSnapshot(source, table.node);
    if (!snapshot) continue;
    const selected = (editable && state.field(tableDeletionSelectionField, false) === table.from) ||
      tableIntersectsSelectionRange(state.selection.main, { ...table, to: snapshot.to });
    ranges.push(Decoration.replace({
      widget: new TableProjection(snapshot, selected, editable, onMenu),
      block: true,
    }).range(table.from, snapshot.to));
  }
  return Decoration.set(ranges, true);
}

/** Single projection for both editable notes and read-only note embeds. */
export function tableWidgetDecoration(
  editable = false,
  onMenu: () => OnTableHandleMenuChange | undefined = () => undefined,
): Extension {
  return StateField.define<DecorationSet>({
    create: state => buildDecorations(state, editable, onMenu),
    update(value, tr) {
      return tr.docChanged || tr.selection || tr.effects.some(effect => effect.is(tableDeletionSelectionChanged))
        ? buildDecorations(tr.state, editable, onMenu) : value;
    },
    provide: field => [
      EditorView.decorations.from(field),
      ...(editable ? [EditorView.atomicRanges.of(view => view.state.field(field))] : []),
    ],
  });
}
