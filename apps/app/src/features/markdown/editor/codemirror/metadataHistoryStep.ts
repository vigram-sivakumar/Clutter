import {
  invertedEffects,
  isolateHistory,
  undoDepth,
} from '@codemirror/commands';
import {
  StateEffect,
  StateField,
  Transaction,
  type Extension,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { EditablePageMetadata } from '@core/application/page/PageOperations';

/**
 * A change to the page's metadata that undoes and redoes together with a Markdown edit — one logical step.
 * CodeMirror's history only knows the document, so the metadata is kept beside it: `patch` is what the host
 * applied for the edit, `inverse` what puts it back.
 */
export interface MetadataHistoryStep {
  readonly patch: Partial<EditablePageMetadata>;
  readonly inverse: Partial<EditablePageMetadata>;
}

interface LoggedStep extends MetadataHistoryStep {
  /** The step's place in the undo stack once recorded (`undoDepth` right after it). */
  readonly depth: number;
}

interface StepLog {
  readonly steps: readonly LoggedStep[];
  /** The patch to hand the host for the transaction that just ran (an undo or redo of a logged step), if any. */
  readonly fired: Partial<EditablePageMetadata> | null;
}

/** Carries a step on the transaction that applies it; `depth` is where that edit lands in the undo stack. */
const applyStepEffect = StateEffect.define<LoggedStep>();

/** Inert: only there so a step with no text change is still recorded as an undo step (see below). */
const recordedMarker = StateEffect.define<null>();

/**
 * Remembers which undo-stack entries carry a metadata step, and reports the step whenever the user undoes
 * or redoes one. The link is the entry's depth in the undo stack, not an effect on the history event:
 * CodeMirror serializes a history's changes and selections but not its effects, so an effect-based link
 * would be lost the moment the per-note history cache restores a note, leaving its text undoable and its
 * metadata not. The log is a state field with its own `toJSON`/`fromJSON`, serialized with the history
 * (see `serializeEditorHistory`).
 *
 * Kept consistent with CodeMirror's own rules:
 *  - a new undoable edit made after an undo discards the redo stack, so steps beyond the current depth go;
 *  - a transaction that is not recorded in history (an external sync, `addToHistory: false`) changes nothing.
 * A step is reported only for the undo/redo of the entry at its depth, never for neighbouring typing.
 */
const stepLogField = StateField.define<StepLog>({
  create: () => ({ steps: [], fired: null }),
  update(log, transaction) {
    const applied = transaction.effects.find((effect) =>
      effect.is(applyStepEffect)
    );

    if (applied) {
      const step = applied.value as LoggedStep;

      return {
        steps: [
          ...log.steps.filter((logged) => logged.depth < step.depth),
          step,
        ],
        fired: null,
      };
    }

    if (transaction.isUserEvent('undo')) {
      const depth = undoDepth(transaction.startState);

      return {
        steps: log.steps,
        fired: log.steps.find((step) => step.depth === depth)?.inverse ?? null,
      };
    }

    if (transaction.isUserEvent('redo')) {
      const depth = undoDepth(transaction.startState) + 1;

      return {
        steps: log.steps,
        fired: log.steps.find((step) => step.depth === depth)?.patch ?? null,
      };
    }

    if (
      transaction.docChanged &&
      transaction.annotation(Transaction.addToHistory) !== false
    ) {
      const depth = undoDepth(transaction.startState);
      const kept = log.steps.filter((step) => step.depth <= depth);

      return kept.length === log.steps.length
        ? { steps: log.steps, fired: null }
        : { steps: kept, fired: null };
    }

    return log.fired === null ? log : { steps: log.steps, fired: null };
  },
  toJSON: (log) => log.steps,
  fromJSON: (json) => ({ steps: json as readonly LoggedStep[], fired: null }),
});

/** The field `serializeEditorHistory` and the restore path carry beside `historyField`. */
export const metadataStepLogField = stepLogField;

/**
 * Installs the step log and its reporting. `onStep` receives the metadata patch to apply when the user
 * undoes (the step's inverse) or redoes (the step itself) an edit made with `applyBodyWithMetadataStep`.
 */
export function metadataHistoryStep(
  onStep: (patch: Partial<EditablePageMetadata>) => void
): Extension {
  return [
    stepLogField,
    // A step with no text change is an effect-only transaction, which CodeMirror's history records only if
    // some effect needs inverting; this inert one makes it do so — for the edit, for its undo (so a redo exists),
    // and for that redo.
    invertedEffects.of((transaction) =>
      transaction.effects.some(
        (effect) => effect.is(applyStepEffect) || effect.is(recordedMarker)
      )
        ? [recordedMarker.of(null)]
        : []
    ),
    EditorView.updateListener.of((update) => {
      const fired = update.state.field(stepLogField).fired;

      if (fired) {
        onStep(fired);
      }
    }),
  ];
}

/**
 * Puts a body into an empty document as one undoable edit, together with the metadata step (if any) that
 * came with it — its own history step, so one undo reverses the whole application and not just the typing
 * before it. Reported to the host like any user edit (onDocChange), not as an external sync.
 *
 * The body is only written while the document is still blank: text typed in the meantime is never replaced,
 * but the metadata step is still recorded.
 */
export function applyBodyWithMetadataStep(
  view: EditorView,
  markdown: string,
  step: MetadataHistoryStep | undefined
): void {
  const blank = view.state.doc.toString().trim() === '';
  const changes =
    blank && markdown !== ''
      ? { from: 0, to: view.state.doc.length, insert: markdown }
      : undefined;

  if (!changes && !step) {
    return;
  }

  view.dispatch({
    changes,
    // `isolateHistory: 'full'` makes this its own undo entry, so it lands one deeper than the stack is now.
    effects: step
      ? applyStepEffect.of({ ...step, depth: undoDepth(view.state) + 1 })
      : [],
    annotations: isolateHistory.of('full'),
    userEvent: 'input.template',
    scrollIntoView: true,
  });
}
