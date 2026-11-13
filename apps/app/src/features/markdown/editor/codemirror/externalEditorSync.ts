import { history, isolateHistory } from '@codemirror/commands';
import {
  Annotation,
  Compartment,
  StateEffect,
  StateField,
  Transaction,
  type EditorState,
} from '@codemirror/state';
import { externalTextChanges } from './externalTextChanges';

/** Host updates must not fire onDocChange or become undoable user edits. */
export const externalSync = Annotation.define<boolean>();
export const editorHistoryCompartment = new Compartment();
const clearFootprint = StateEffect.define<null>();
export interface HistoryRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Conflict footprint only: coordinates touched by local edits, never document snapshots, inverse edits or a
 * second undo stack. It conservatively includes undone/trimmed edits until a conflict resets this note's history.
 */
export const localHistoryFootprint = StateField.define<readonly HistoryRange[]>(
  {
    create: () => [],
    update(ranges, tr) {
      if (tr.effects.some((effect) => effect.is(clearFootprint))) return [];
      if (!tr.docChanged) return ranges;
      const mapped: HistoryRange[] = ranges
        .map(({ from, to }) => ({
          from: tr.changes.mapPos(from, 1),
          to: tr.changes.mapPos(to, -1),
        }))
        .map(({ from, to }) => ({
          from: Math.min(from, to),
          to: Math.max(from, to),
        }));
      if (
        !tr.annotation(externalSync) &&
        tr.annotation(Transaction.addToHistory) !== false
      ) {
        tr.changes.iterChangedRanges((_a, _b, from, to) =>
          mapped.push({ from, to })
        );
      }
      mapped.sort((a, b) => a.from - b.from || a.to - b.to);
      const merged: HistoryRange[] = [];
      for (const range of mapped) {
        const last = merged[merged.length - 1];
        if (last && range.from <= last.to)
          merged[merged.length - 1] = {
            from: last.from,
            to: Math.max(last.to, range.to),
          };
        else merged.push(range);
      }
      return merged;
    },
  }
);

/** Same transaction builder for live sync and in-memory cached-state reconciliation. No view callbacks run here. */
export function externalSyncTransactions(
  state: EditorState,
  markdown: string
): Transaction[] {
  if (state.doc.toString() === markdown) return [];
  const diff = externalTextChanges(state.doc.toString(), markdown);
  const changes = state.changes(diff.changes);
  const footprint = state.field(localHistoryFootprint, false);
  let overlap = false;
  changes.iterChangedRanges((from, to) => {
    overlap ||=
      footprint?.some((range) =>
        range.from === range.to
          ? from <= range.from && to >= range.to
          : from === to
            ? from > range.from && from < range.to
            : from < range.to && to > range.from
      ) ?? false;
  });
  const annotations = [
    externalSync.of(true),
    Transaction.addToHistory.of(false),
    isolateHistory.of('full'),
  ];
  const reset = footprint !== undefined && (!diff.precise || overlap);
  if (!reset) return [state.update({ changes, annotations })];

  // Public Compartment reconfiguration removes and re-adds CM's history field, giving it a fresh value.
  // Apply both transactions as one view update: no intermediate unconfigured editor is painted or exposed.
  const remove = state.update({
    effects: [
      editorHistoryCompartment.reconfigure([]),
      clearFootprint.of(null),
    ],
    annotations,
  });
  const sync = remove.state.update({
    effects: editorHistoryCompartment.reconfigure(history()),
    changes,
    annotations,
  });
  return [remove, sync];
}
