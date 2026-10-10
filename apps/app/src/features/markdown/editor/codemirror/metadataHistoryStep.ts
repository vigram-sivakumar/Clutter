import { invertedEffects, isolateHistory } from '@codemirror/commands';
import { StateEffect, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { EditablePageMetadata } from '@core/application/page/PageOperations';

/**
 * A change to the page's metadata that undoes and redoes together with a Markdown edit — one logical step.
 * CodeMirror's history only knows the document, so the metadata rides along with the history entry as an
 * effect: `patch` is what the host applied for the edit, `inverse` what puts it back.
 */
export interface MetadataHistoryStep {
  readonly patch: Partial<EditablePageMetadata>;
  readonly inverse: Partial<EditablePageMetadata>;
}

/**
 * What the host is told when the user undoes or redoes a step: write `apply`, but only the properties that still
 * hold the value in `expect` (what the opposite direction wrote). A property the user has changed since is left
 * alone — undo must not overwrite newer work.
 */
export interface MetadataHistoryChange {
  readonly apply: Partial<EditablePageMetadata>;
  readonly expect: Partial<EditablePageMetadata>;
}

type Direction = 'applied' | 'reverted';

/**
 * The step travels as a state effect on the edit's own history entry. `invertedEffects` below tells CodeMirror's
 * history to store the opposite direction as the entry's inverse, so the entry's undo dispatches `reverted` and
 * the redo made from that undo dispatches `applied`. The link is the entry itself — nothing else keeps track of
 * where it is, so trimming the stack, an external change mapping the entry, or a new edit discarding the redo
 * stack cannot leave a step attached to the wrong entry. An effect-only transaction (a template with no body)
 * is recorded as an undo entry because its inverse is non-empty.
 */
const stepEffect = StateEffect.define<{
  readonly step: MetadataHistoryStep;
  readonly direction: Direction;
}>();

/**
 * Installs the step link and its reporting. `onStep` receives what to write when the user undoes or redoes an
 * edit made with `applyBodyWithMetadataStep`; applying the edit itself never reports (the host did that).
 */
export function metadataHistoryStep(
  onStep: (change: MetadataHistoryChange) => void
): Extension {
  return [
    invertedEffects.of((transaction) =>
      transaction.effects.flatMap((effect) =>
        effect.is(stepEffect)
          ? [
              stepEffect.of({
                step: effect.value.step,
                direction:
                  effect.value.direction === 'applied' ? 'reverted' : 'applied',
              }),
            ]
          : []
      )
    ),
    EditorView.updateListener.of((update) => {
      for (const transaction of update.transactions) {
        if (!transaction.isUserEvent('undo') && !transaction.isUserEvent('redo')) {
          continue;
        }

        for (const effect of transaction.effects) {
          if (!effect.is(stepEffect)) {
            continue;
          }

          const { step, direction } = effect.value;

          onStep(
            direction === 'reverted'
              ? { apply: step.inverse, expect: step.patch }
              : { apply: step.patch, expect: step.inverse }
          );
        }
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
    effects: step ? [stepEffect.of({ step, direction: 'applied' })] : [],
    // `isolateHistory: 'full'` makes this its own undo entry, so it never merges with the typing around it.
    annotations: isolateHistory.of('full'),
    userEvent: 'input.template',
    scrollIntoView: true,
  });
}
