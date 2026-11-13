// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import {
  captureEditorHistory,
  createEditorView,
  syncMarkdownIntoView,
  type EditorHistorySnapshot,
} from './createEditorView';
import { applyBodyWithMetadataStep } from './metadataHistoryStep';

const views: EditorView[] = [];
function mount(
  doc: string,
  restoreHistory?: EditorHistorySnapshot,
  enableHistory = true
) {
  const onDocChange = vi.fn(),
    onMetadataHistoryStep = vi.fn();
  const view = createEditorView({
    doc,
    parent: document.body.appendChild(document.createElement('div')),
    restoreHistory,
    enableHistory,
    onDocChange,
    onMetadataHistoryStep,
  });
  views.push(view);
  return { view, onDocChange, onMetadataHistoryStep };
}
afterEach(() => {
  views.splice(0).forEach((view) => {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  });
});

describe('external changes and CodeMirror history', () => {
  it('resets overlapping undo and redo, suppresses callbacks, then records fresh local edits normally', () => {
    const { view, onDocChange } = mount('old');
    view.dispatch({ changes: { from: 0, to: 3, insert: 'local' } });
    onDocChange.mockClear();
    syncMarkdownIntoView(view, 'peer');
    expect(onDocChange).not.toHaveBeenCalled();
    expect(undoDepth(view.state)).toBe(0);
    expect(redoDepth(view.state)).toBe(0);
    expect(undo(view)).toBe(false);
    view.dispatch({ changes: { from: 4, insert: '!' } });
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('peer');
  });

  it('invalidates an overlapping pending redo rather than replaying the old replacement', () => {
    const { view } = mount('old');
    view.dispatch({ changes: { from: 0, to: 3, insert: 'local' } });
    undo(view);
    expect(redoDepth(view.state)).toBe(1);
    syncMarkdownIntoView(view, 'peer');
    expect(redo(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('peer');
  });

  it('protects a local deletion’s zero-length inverse anchor from an incoming insertion at the same position', () => {
    const { view } = mount('aOLDz');
    view.dispatch({ changes: { from: 1, to: 4 } });
    syncMarkdownIntoView(view, 'aNEWz');
    expect(undo(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('aNEWz');
  });

  it('keeps history when remote insertions are adjacent to, rather than inside, the local edit', () => {
    const { view } = mount('end');
    view.dispatch({ changes: { from: 0, insert: 'local ' } });
    syncMarkdownIntoView(view, 'peer local end');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('peer end');
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('peer local end');
  });

  it('clears unsafe history when the bounded diff cannot preserve unchanged regions', () => {
    const { view } = mount('a'.repeat(2000));
    view.dispatch({ changes: { from: 100, insert: 'local' } });
    syncMarkdownIntoView(view, 'b'.repeat(2000));
    expect(undo(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('b'.repeat(2000));
  });

  it('does not introduce history into history-disabled embedded editors', () => {
    const { view } = mount('old', undefined, false);
    syncMarkdownIntoView(view, 'peer');
    expect(view.state.doc.toString()).toBe('peer');
    expect(undoDepth(view.state)).toBe(0);
  });

  it('maps a cached selection and redo without mutating or replaying the snapshot', () => {
    const { view } = mount('base');
    view.dispatch({ changes: { from: 4, insert: ' local' } });
    undo(view);
    view.dispatch({ selection: { anchor: 2 } });
    const snapshot = captureEditorHistory(view);
    const { view: reopened, onDocChange } = mount('peer base', snapshot);
    expect(reopened.state.selection.main.head).toBe(7);
    expect(onDocChange).not.toHaveBeenCalled();
    expect(redo(reopened)).toBe(true);
    expect(reopened.state.doc.toString()).toBe('peer base local');
    expect(snapshot.doc).toBe('base');
    expect(snapshot.selection.main.head).toBe(2);
    const { view: original } = mount('base', snapshot);
    expect(redo(original)).toBe(true);
    expect(original.state.doc.toString()).toBe('base local');
  });

  it('retains metadata effects through unrelated cached-state mapping, firing them only for a real undo', () => {
    const { view } = mount('');
    const step = { patch: { icon: 'new' }, inverse: { icon: 'old' } };
    applyBodyWithMetadataStep(view, '# Body', step);
    const {
      view: reopened,
      onMetadataHistoryStep,
      onDocChange,
    } = mount('peer # Body', captureEditorHistory(view));
    expect(onDocChange).not.toHaveBeenCalled();
    expect(onMetadataHistoryStep).not.toHaveBeenCalled();
    undo(reopened);
    expect(reopened.state.doc.toString()).toBe('peer ');
    expect(onMetadataHistoryStep).toHaveBeenCalledExactlyOnceWith({
      apply: step.inverse,
      expect: step.patch,
    });
  });

  it('drops obsolete metadata history on overlap without applying its effects', () => {
    const { view, onMetadataHistoryStep } = mount('');
    applyBodyWithMetadataStep(view, '# Body', {
      patch: { icon: 'new' },
      inverse: { icon: 'old' },
    });
    syncMarkdownIntoView(view, 'peer');
    expect(undo(view)).toBe(false);
    expect(onMetadataHistoryStep).not.toHaveBeenCalled();
  });

  it('restores unknown old snapshots only when their document matches exactly', () => {
    const { view } = mount('base');
    view.dispatch({ changes: { from: 4, insert: ' local' } });
    const { footprint: _footprint, ...legacy } = captureEditorHistory(view);
    const { view: matching } = mount('base local', legacy);
    expect(undoDepth(matching.state)).toBe(1);
    syncMarkdownIntoView(matching, 'peer');
    expect(undo(matching)).toBe(false);
    const { view: changed } = mount('peer base local', legacy);
    expect(undoDepth(changed.state)).toBe(0);
  });
});
