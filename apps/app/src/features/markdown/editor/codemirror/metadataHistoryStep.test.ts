// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { EditablePageMetadata } from '@core/application/page/PageOperations';
import {
  createEditorView,
  captureEditorHistory,
  type EditorHistorySnapshot,
  syncMarkdownIntoView,
} from './createEditorView';
import { __clearAllCachedEditorHistoryForTests } from './editorHistoryCache';
import { applyBodyWithMetadataStep } from './metadataHistoryStep';

/**
 * A metadata step is one logical entry in the editor's own undo stack: undoing it reports its inverse, redoing
 * it reports the step, and neighbouring typing never does. The step is an effect on the history entry itself, so
 * it moves with the entry through trimming, mapping and the per-note history cache (which carries the history
 * value in memory — CodeMirror's JSON form of the history drops effects).
 */

const STEP = {
  patch: { icon: '📅', tags: ['a', 'b'] } as Partial<EditablePageMetadata>,
  inverse: { icon: '📝', tags: ['a'] } as Partial<EditablePageMetadata>,
};
/** What the host is told for an undo and for a redo of `STEP`. */
const UNDONE = { apply: STEP.inverse, expect: STEP.patch };
const REDONE = { apply: STEP.patch, expect: STEP.inverse };

beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
});

function mount(doc = '', restoreHistory?: EditorHistorySnapshot) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const onStep = vi.fn();
  const view = createEditorView({
    doc,
    parent,
    restoreHistory,
    onMetadataHistoryStep: onStep,
  });

  return { view, onStep };
}

const type = (view: EditorView, text: string, at = view.state.doc.length) =>
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: 'input.type',
    annotations: isolateHistory.of('full'),
  });

describe('metadata history step', () => {
  it('applying records one undo entry; undo reports the inverse once and redo reports the step once', () => {
    const { view, onStep } = mount();
    applyBodyWithMetadataStep(view, '# Body', STEP);

    // Applying does not report: the host applied that metadata itself.
    expect(onStep).not.toHaveBeenCalled();
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(view.state.doc.toString()).toBe('');
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(UNDONE);

    redo(view);
    expect(view.state.doc.toString()).toBe('# Body');
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenLastCalledWith(REDONE);
  });

  it('typing before and after is ordinary history: only the template entry reports', () => {
    const { view, onStep } = mount();
    type(view, 'a');
    view.dispatch({
      changes: { from: 0, to: 1 },
      annotations: isolateHistory.of('full'),
    });
    applyBodyWithMetadataStep(view, '# Body', STEP);
    type(view, ' more');

    undo(view); // the typing after
    expect(view.state.doc.toString()).toBe('# Body');
    expect(onStep).not.toHaveBeenCalled();

    undo(view); // the template
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(UNDONE);

    undo(view); // the deletion before it
    expect(view.state.doc.toString()).toBe('a');
    expect(onStep).toHaveBeenCalledTimes(1);

    redo(view);
    redo(view); // the template again
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenLastCalledWith(REDONE);

    redo(view); // the typing after
    expect(view.state.doc.toString()).toBe('# Body more');
    expect(onStep).toHaveBeenCalledTimes(2);
  });

  it('a new edit after an undo discards the redo, so the undone step can no longer be reported', () => {
    const { view, onStep } = mount();
    applyBodyWithMetadataStep(view, '# Body', STEP);
    undo(view);
    onStep.mockClear();

    type(view, 'fresh');
    redo(view); // nothing left to redo
    undo(view); // undoes 'fresh' — never the template

    expect(view.state.doc.toString()).toBe('');
    expect(onStep).not.toHaveBeenCalled();
  });

  it('a step with no text change is still an undo entry and still undoes and redoes', () => {
    const { view, onStep } = mount();
    applyBodyWithMetadataStep(view, '', STEP);
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(onStep).toHaveBeenLastCalledWith(UNDONE);
    redo(view);
    expect(onStep).toHaveBeenLastCalledWith(REDONE);
  });

  it('writes the body only into a blank document, but still records the step', () => {
    const { view, onStep } = mount('typed');

    applyBodyWithMetadataStep(view, '# Body', STEP);

    expect(view.state.doc.toString()).toBe('typed');
    undo(view);
    expect(onStep).toHaveBeenLastCalledWith(UNDONE);
  });

  it('an external sync (not a history entry) neither shifts nor loses the step', () => {
    const { view, onStep } = mount();
    applyBodyWithMetadataStep(view, '# Body', STEP);

    syncMarkdownIntoView(view, '>> # Body');
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(onStep).toHaveBeenLastCalledWith(UNDONE);
    expect(view.state.doc.toString()).toBe('>> ');
  });

  it('survives the history cache: a restored editor still reports the step on undo and redo', () => {
    const first = mount();
    applyBodyWithMetadataStep(first.view, '# Body', STEP);
    type(first.view, ' tail');
    const snapshot = captureEditorHistory(first.view);

    const restored = mount('# Body tail', snapshot);
    expect(undoDepth(restored.view.state)).toBe(2);

    undo(restored.view); // the typing
    expect(restored.onStep).not.toHaveBeenCalled();
    undo(restored.view); // the template
    expect(restored.view.state.doc.toString()).toBe('');
    expect(restored.onStep).toHaveBeenLastCalledWith(UNDONE);

    redo(restored.view);
    expect(restored.onStep).toHaveBeenLastCalledWith(REDONE);
  });

  it('a restored step with no text change can be undone and redone', () => {
    const first = mount('abc');
    applyBodyWithMetadataStep(first.view, '', STEP);
    const restored = mount('abc', captureEditorHistory(first.view));

    undo(restored.view);
    expect(redoDepth(restored.view.state)).toBe(1);
    expect(restored.onStep).toHaveBeenLastCalledWith(UNDONE);
    redo(restored.view);
    expect(restored.onStep).toHaveBeenLastCalledWith(REDONE);
  });

  it('survives being restored twice, with enough later edits that the stack is trimmed', () => {
    const first = mount();
    for (let i = 0; i < 29; i++) type(first.view, 'a');
    applyBodyWithMetadataStep(first.view, '', STEP);
    const second = mount(first.view.state.doc.toString(), captureEditorHistory(first.view));
    for (let i = 0; i < 100; i++) type(second.view, 'b');
    expect(undoDepth(second.view.state)).toBeLessThan(130); // CodeMirror trimmed the oldest entries
    const third = mount(second.view.state.doc.toString(), captureEditorHistory(second.view));

    while (undo(third.view));

    expect(third.onStep).toHaveBeenCalledTimes(1);
    expect(third.onStep).toHaveBeenLastCalledWith(UNDONE);
  });

  it('an identical paste after undoing a restored step is not mistaken for the step', () => {
    const first = mount();
    applyBodyWithMetadataStep(first.view, 'T-BODY', STEP);
    const restored = mount('T-BODY', captureEditorHistory(first.view));
    undo(restored.view);
    restored.onStep.mockClear();

    restored.view.dispatch({
      changes: { from: 0, insert: 'T-BODY' },
      annotations: isolateHistory.of('full'),
      userEvent: 'input.paste',
    });
    undo(restored.view);
    redo(restored.view);

    expect(restored.onStep).not.toHaveBeenCalled();
  });

  it('a step applied late in a long history is found exactly at its own entry (stack at the cap)', () => {
    const { view, onStep } = mount();
    for (let i = 0; i < 130; i++) type(view, 'a');
    applyBodyWithMetadataStep(view, '', STEP);
    for (let i = 0; i < 5; i++) type(view, 'b');

    let undos = 0;
    while (undo(view)) {
      undos += 1;
      if (onStep.mock.calls.length > 0) break;
    }

    expect(undos).toBe(6); // five typing entries, then the step
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it('an external change that rewrites the template body keeps the step with its entry', () => {
    const { view, onStep } = mount();
    applyBodyWithMetadataStep(view, 'TEMPLATE', STEP);

    view.dispatch({
      changes: { from: 2, to: 4, insert: '--' },
      annotations: [Transaction.addToHistory.of(false)],
    });
    undo(view);

    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(UNDONE);
  });

  it('a history that never held a step restores and undoes as before', () => {
    const first = mount();
    type(first.view, 'abc');
    const restored = mount('abc', captureEditorHistory(first.view));

    expect(undoDepth(restored.view.state)).toBe(1);
    undo(restored.view);
    expect(restored.view.state.doc.toString()).toBe('');
    expect(restored.onStep).not.toHaveBeenCalled();
  });

  it('pins the behaviour the cache relies on: a history value started in a new state keeps its entries and their effects', () => {
    const first = mount();
    applyBodyWithMetadataStep(first.view, '# Body', STEP);
    type(first.view, ' tail');
    const snapshot = captureEditorHistory(first.view);

    // Two independent editors started from the same snapshot (React StrictMode mounts twice) do not affect
    // each other or the snapshot.
    const one = mount('# Body tail', snapshot);
    const two = mount('# Body tail', snapshot);
    type(one.view, '!');

    expect(undoDepth(one.view.state)).toBe(3);
    expect(undoDepth(two.view.state)).toBe(2);
    undo(two.view);
    undo(two.view);
    expect(two.onStep).toHaveBeenLastCalledWith(UNDONE);
  });
});
