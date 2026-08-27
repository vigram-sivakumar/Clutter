// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import { createEditorView, syncMarkdownIntoView } from './createEditorView';

describe('createEditorView — initial cursor position', () => {
  it('places a collapsed selection at doc.length, not position 0', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const view = createEditorView({ doc: 'Hello, world', parent });

    expect(view.state.selection.main.anchor).toBe(view.state.doc.length);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('places the cursor at 0 for an empty document — doc.length is still the correct end position', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const view = createEditorView({ doc: '', parent });

    expect(view.state.selection.main.anchor).toBe(0);
  });
});

/**
 * Regression coverage for a real bug: with no keymap binding Enter at all,
 * a real Enter keydown had nothing to dispatch to. In a browser this fell
 * through to contentEditable's own native paragraph-split handling, which
 * CM6 then had to reconcile via DOM-mutation observation — the actual
 * source of the double-newline and stuck-until-refocus symptoms. jsdom
 * implements no such native contentEditable fallback, so these tests
 * dispatch a genuine `keydown` at `view.contentDOM` (not a direct command
 * call) — the same path a real keypress takes — and would have seen zero
 * newlines inserted before `keymap.of(defaultKeymap)` was added.
 */
describe('createEditorView — Enter key, via a real keydown dispatch', () => {
  function mountView(doc: string): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    return createEditorView({ doc, parent });
  }

  function pressEnter(view: EditorView): void {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  }

  it('inserts exactly one newline, not zero or two', () => {
    const view = mountView('hello');
    view.dispatch({ selection: { anchor: 5 } });

    pressEnter(view);

    expect(view.state.doc.toString()).toBe('hello\n');
    expect(view.state.selection.main.head).toBe(6);
  });

  it('two separate Enter presses insert exactly two newlines, not four', () => {
    const view = mountView('hello');
    view.dispatch({ selection: { anchor: 5 } });

    pressEnter(view);
    pressEnter(view);

    expect(view.state.doc.toString()).toBe('hello\n\n');
  });
});

/**
 * Regression coverage for a real, confirmed bug (docs/editor-architecture-
 * decisions.md's `syncMarkdownIntoView` history-exclusion entry, 2026-08-27):
 * `syncMarkdownIntoView` — dispatched by `MarkdownEditor.tsx` whenever the
 * `markdown` prop changes while the editor is unfocused (e.g.
 * `PageOperations.mutateBody()`, a task-checkbox toggle from a different UI
 * surface acting on the same open-but-unfocused page) — used to be a plain,
 * undo-able transaction. Confirmed two distinct failure modes, both
 * reproduced here directly against CM6's own `undo`/`redo`/`undoDepth`
 * commands (a history-mechanics question, not a rendering one — no real
 * browser needed):
 *   - unannotated: the sync silently merged into the *same* undo group as
 *     the immediately-preceding real user edit, so one `undo()` reverted
 *     both together;
 *   - `addToHistory: false` alone, with the *previous* full-document-replace
 *     change shape: excluding the sync from history is not the same as
 *     exempting it from history's change-*mapping* — a full `{from: 0, to:
 *     doc.length}` replace degenerated the still-open prior edit's mapped
 *     position into nothing, dropping it (`undoDepth` fell to `0`,
 *     permanently losing the user's own unsaved edit from undo).
 * The fix is both a minimal (common-prefix/suffix) diff *and*
 * `addToHistory: false` together — each addresses a different one of the
 * two failure modes above, confirmed independently in the investigation
 * that produced this fix, not applied as an unexamined pair.
 */
describe('syncMarkdownIntoView — external syncs must not corrupt undo history', () => {
  function mountWithEdits(doc: string): { view: EditorView; edits: string[] } {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const edits: string[] = [];
    const view = createEditorView({ doc, parent, onDocChange: (markdown) => edits.push(markdown) });
    return { view, edits };
  }

  it('a real user edit enters history: undo reverts it, redo restores it', () => {
    const { view } = mountWithEdits('hello');
    view.dispatch({ changes: { from: 5, to: 5, insert: ' world' } });
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(view.state.doc.toString()).toBe('hello');

    redo(view);
    expect(view.state.doc.toString()).toBe('hello world');
  });

  it('an external sync is never itself an undo-able step', () => {
    const { view } = mountWithEdits('hello');
    syncMarkdownIntoView(view, 'synced content'); // no prior user edit at all
    expect(view.state.doc.toString()).toBe('synced content');
    expect(undoDepth(view.state)).toBe(0);

    undo(view); // no-op: nothing to undo
    expect(view.state.doc.toString()).toBe('synced content');
  });

  it('undo after an external sync reverts the PRECEDING USER EDIT, not the sync — the sync\'s own content is left in place', () => {
    const { view } = mountWithEdits('hello');
    view.dispatch({ changes: { from: 5, to: 5, insert: ' world' } }); // user edit
    syncMarkdownIntoView(view, 'hello world [toggled elsewhere]'); // external sync, unfocused

    expect(view.state.doc.toString()).toBe('hello world [toggled elsewhere]');
    // The sync did not create a second undo step, and did not erase the
    // still-open user-edit step either.
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    // Reverts exactly the user's own " world" — the externally-synced
    // "[toggled elsewhere]" suffix is untouched, because it was never part
    // of the user's action being undone.
    expect(view.state.doc.toString()).toBe('hello [toggled elsewhere]');
  });

  it('redo after that undo restores the user\'s own edit', () => {
    const { view } = mountWithEdits('hello');
    view.dispatch({ changes: { from: 5, to: 5, insert: ' world' } });
    syncMarkdownIntoView(view, 'hello world [toggled elsewhere]');
    undo(view);
    expect(redoDepth(view.state)).toBe(1);

    redo(view);
    expect(view.state.doc.toString()).toBe('hello world [toggled elsewhere]');
  });

  it('repeated external syncs (e.g. several task toggles) do not accumulate history entries, and undo still reaches the one real user edit', () => {
    const { view } = mountWithEdits('hello');
    view.dispatch({ changes: { from: 5, to: 5, insert: ' world' } });

    syncMarkdownIntoView(view, 'hello world [x]');
    syncMarkdownIntoView(view, 'hello world [ ]');
    syncMarkdownIntoView(view, 'hello world [x]');
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(view.state.doc.toString()).toBe('hello [x]');
  });

  it('a normal user edit made AFTER an external sync still enters history normally', () => {
    const { view, edits } = mountWithEdits('hello');
    syncMarkdownIntoView(view, 'hello [synced]');
    expect(edits).toEqual([]); // externalSync must not fire onDocChange

    view.dispatch({ changes: { from: view.state.doc.length, to: view.state.doc.length, insert: '!' } });
    expect(edits).toEqual(['hello [synced]!']); // the real edit does fire it
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(view.state.doc.toString()).toBe('hello [synced]');
  });

  it('a sync whose content already matches the document is a true no-op — no dispatch, no history entry', () => {
    const { view, edits } = mountWithEdits('hello');
    view.dispatch({ changes: { from: 5, to: 5, insert: '!' } });
    const depthBefore = undoDepth(view.state);

    syncMarkdownIntoView(view, 'hello!'); // already matches
    expect(undoDepth(view.state)).toBe(depthBefore);
    expect(edits).toEqual(['hello!']); // only from the real edit above, sync fired nothing
  });

  it('note switching is already isolated per note: destroying one view and creating another (React\'s key={activePageId} remount) starts with zero history, regardless of the previous note\'s edits', () => {
    const { view: noteA } = mountWithEdits('note A');
    noteA.dispatch({ changes: { from: 0, to: 0, insert: 'EDITED: ' } });
    expect(undoDepth(noteA.state)).toBe(1);
    noteA.destroy(); // exactly what MarkdownEditor's mount-effect cleanup does on a key change

    const { view: noteB } = mountWithEdits('note B');
    expect(undoDepth(noteB.state)).toBe(0);
    expect(noteB.state.doc.toString()).toBe('note B');

    // Switching back to note A is, in the real app, a THIRD fresh
    // createEditorView call (a new React mount under the same key) seeded
    // from that note's own persisted/session markdown — not a resurrection
    // of the destroyed view or its history. Undo history does not survive
    // a note round-trip today; nothing in this fix changes that, since it
    // was already true before it (verified against the pre-fix
    // syncMarkdownIntoView too — this is a `key`/remount property, not
    // something either version of the sync function controls).
    noteB.destroy();
    const { view: noteAAgain } = mountWithEdits('EDITED: note A');
    expect(undoDepth(noteAAgain.state)).toBe(0);
  });
});
