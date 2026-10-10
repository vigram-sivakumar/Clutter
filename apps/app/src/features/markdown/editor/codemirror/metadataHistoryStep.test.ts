// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isolateHistory, redo, undo, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import type { EditablePageMetadata } from '@core/application/page/PageOperations';
import {
  createEditorView,
  serializeEditorHistory,
  syncMarkdownIntoView,
} from './createEditorView';
import { __clearAllCachedEditorHistoryForTests } from './editorHistoryCache';
import { applyBodyWithMetadataStep } from './metadataHistoryStep';

/**
 * A metadata step is one logical entry in the editor's own undo stack: undoing it reports its inverse, redoing
 * it reports the step, and neighbouring typing never does. The log survives the per-note history cache.
 */

const STEP = {
  patch: { icon: '📅', tags: ['a', 'b'] } as Partial<EditablePageMetadata>,
  inverse: { icon: '📝', tags: ['a'] } as Partial<EditablePageMetadata>,
};

beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
});

function mount(doc = '', restoreHistoryJSON?: unknown) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const onStep = vi.fn();
  const view = createEditorView({
    doc,
    parent,
    restoreHistoryJSON,
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
    expect(onStep).toHaveBeenLastCalledWith(STEP.inverse);

    redo(view);
    expect(view.state.doc.toString()).toBe('# Body');
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenLastCalledWith(STEP.patch);
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
    expect(onStep).toHaveBeenLastCalledWith(STEP.inverse);

    undo(view); // the deletion before it
    expect(view.state.doc.toString()).toBe('a');
    expect(onStep).toHaveBeenCalledTimes(1);

    redo(view);
    redo(view); // the template again
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenLastCalledWith(STEP.patch);

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
    expect(onStep).toHaveBeenLastCalledWith(STEP.inverse);
    redo(view);
    expect(onStep).toHaveBeenLastCalledWith(STEP.patch);
  });

  it('writes the body only into a blank document, but still records the step', () => {
    const { view, onStep } = mount('typed');

    applyBodyWithMetadataStep(view, '# Body', STEP);

    expect(view.state.doc.toString()).toBe('typed');
    undo(view);
    expect(onStep).toHaveBeenLastCalledWith(STEP.inverse);
  });

  it('an external sync (not a history entry) neither shifts nor loses the step', () => {
    const { view, onStep } = mount();
    applyBodyWithMetadataStep(view, '# Body', STEP);

    syncMarkdownIntoView(view, '>> # Body');
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(onStep).toHaveBeenLastCalledWith(STEP.inverse);
    expect(view.state.doc.toString()).toBe('>> ');
  });

  it('survives the history cache: a restored editor still reports the step on undo and redo', () => {
    const first = mount();
    applyBodyWithMetadataStep(first.view, '# Body', STEP);
    type(first.view, ' tail');
    const snapshot = JSON.parse(
      JSON.stringify(serializeEditorHistory(first.view))
    );

    const restored = mount('# Body tail', snapshot);
    expect(undoDepth(restored.view.state)).toBe(2);

    undo(restored.view); // the typing
    expect(restored.onStep).not.toHaveBeenCalled();
    undo(restored.view); // the template
    expect(restored.view.state.doc.toString()).toBe('');
    expect(restored.onStep).toHaveBeenLastCalledWith(STEP.inverse);

    redo(restored.view);
    expect(restored.onStep).toHaveBeenLastCalledWith(STEP.patch);
  });

  it('a history cached before this existed (no step log) still restores', () => {
    const first = mount();
    type(first.view, 'abc');
    const snapshot = JSON.parse(
      JSON.stringify(serializeEditorHistory(first.view))
    );
    delete snapshot.metadataSteps;

    const restored = mount('abc', snapshot);

    expect(undoDepth(restored.view.state)).toBe(1);
    undo(restored.view);
    expect(restored.view.state.doc.toString()).toBe('');
    expect(restored.onStep).not.toHaveBeenCalled();
  });
});
