// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import {
  createEditorView,
  docTextMatches,
  hasEstablishedEditingPosition,
  serializeEditorHistory,
  syncMarkdownIntoView,
} from './createEditorView';
import {
  __clearAllCachedEditorHistoryForTests,
  clearCachedEditorSession,
  getCachedEditorSession,
  setCachedEditorSession,
} from './editorHistoryCache';

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

/**
 * Regression coverage for per-document CM6 undo/redo history + scroll
 * preservation (docs/editor-architecture-decisions.md's entries of that
 * name). `MarkdownEditor.tsx`'s own mount/unmount effect is the real
 * integration point (`getCachedEditorSession`/`setCachedEditorSession`
 * around `createEditorView`'s `restoreHistoryJSON`/`restoreScrollEffect`
 * options and `serializeEditorHistory`/`view.scrollSnapshot()`) — these
 * tests exercise the same functions directly, at the level a page switch
 * actually operates: "unmount page A" is `serializeEditorHistory` +
 * `scrollSnapshot()` + `setCachedEditorSession` + `view.destroy()`;
 * "mount page A again" is `getCachedEditorSession` +
 * `createEditorView({..., restoreHistoryJSON, restoreScrollEffect})`.
 */
describe('Per-document undo/redo history preservation (editorHistoryCache + restoreHistoryJSON)', () => {
  beforeEach(() => {
    __clearAllCachedEditorHistoryForTests();
  });

  /**
   * Mirrors MarkdownEditor.tsx's mount effect: cache lookup ->
   * createEditorView -> conditional view.focus(). `focusOnOpen` mirrors
   * the `focusOnOpen` prop `PageHost.tsx` computes from the open-time
   * title (empty vs. not) — defaulted to `false` here since most tests
   * below don't exercise note-open focus policy at all.
   */
  function openPage(pageId: string, markdown: string, focusOnOpen = false): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const cached = getCachedEditorSession(pageId);
    const view = createEditorView({
      doc: markdown,
      parent,
      restoreHistoryJSON: cached?.historyJSON,
      restoreScrollEffect: cached?.scrollEffect,
    });
    // Mirrors MarkdownEditor.tsx's own gate exactly: a restorable cached
    // session (exists, its document still matches, AND shows real prior
    // engagement — not just "an entry exists," which gets written on
    // every unmount unconditionally) always wins; `focusOnOpen` only
    // decides when there's no such session.
    const hasRestorableSession =
      cached !== undefined &&
      docTextMatches(cached.historyJSON, markdown) &&
      hasEstablishedEditingPosition(view);
    if (hasRestorableSession || focusOnOpen) {
      view.focus();
    }
    return view;
  }

  /** Mirrors MarkdownEditor.tsx's unmount cleanup: serialize -> cache -> destroy. */
  function closePage(pageId: string, view: EditorView): void {
    setCachedEditorSession(pageId, {
      historyJSON: serializeEditorHistory(view),
      scrollEffect: view.scrollSnapshot(),
      // No real scrollable-ancestor DOM to measure in this test harness
      // (that's `MarkdownEditor.tsx`'s `findScrollableAncestor`, verified
      // live in the real app instead — see the architecture-decisions.md
      // entry); `view.scrollDOM.scrollTop` stands in here purely so the
      // cache-plumbing tests below (G/H) have a real number to round-trip.
      domScrollTop: view.scrollDOM.scrollTop,
    });
    view.destroy();
  }

  it('A: history survives a page switch — only the leaving page\'s own edit is undone on return', () => {
    const a = openPage('page-a', 'A');
    a.dispatch({ changes: { from: 1, to: 1, insert: '1' } }); // "A1"
    closePage('page-a', a);

    const b = openPage('page-b', 'B');
    b.dispatch({ changes: { from: 1, to: 1, insert: '1' } }); // "B1"
    // page A's cache entry is untouched by anything that happened to B
    closePage('page-b', b);

    const aAgain = openPage('page-a', 'A1'); // fresh markdown prop matches what A was left at
    expect(undoDepth(aAgain.state)).toBe(1);
    undo(aAgain);
    expect(aAgain.state.doc.toString()).toBe('A'); // only A's own edit, never B's
  });

  it('B: histories are independent in both directions', () => {
    const a = openPage('page-a', 'A');
    a.dispatch({ changes: { from: 1, to: 1, insert: '1' } });
    closePage('page-a', a);

    const b = openPage('page-b', 'B');
    b.dispatch({ changes: { from: 1, to: 1, insert: '1' } });
    closePage('page-b', b);

    const aRestored = openPage('page-a', 'A1');
    undo(aRestored);
    expect(aRestored.state.doc.toString()).toBe('A');

    const bRestored = openPage('page-b', 'B1');
    undo(bRestored);
    expect(bRestored.state.doc.toString()).toBe('B');
  });

  it('C: multiple undo/redo steps survive a round trip through another page', () => {
    const a = openPage('page-a', 'A');
    // Three separately-grouped edits — CM6 groups consecutive dispatches
    // within its default 500ms `newGroupDelay` window, which every
    // synchronous same-tick test dispatch always falls inside; explicit,
    // widely-spaced `Transaction.time` annotations simulate real,
    // separated user keystrokes instead.
    a.dispatch({ changes: { from: 1, to: 1, insert: '1' }, annotations: Transaction.time.of(1000) });
    a.dispatch({ changes: { from: 2, to: 2, insert: '2' }, annotations: Transaction.time.of(2000) });
    a.dispatch({ changes: { from: 3, to: 3, insert: '3' }, annotations: Transaction.time.of(3000) });
    expect(a.state.doc.toString()).toBe('A123');
    expect(undoDepth(a.state)).toBe(3);
    closePage('page-a', a);

    const b = openPage('page-b', 'B');
    b.dispatch({ changes: { from: 1, to: 1, insert: 'x' } });
    closePage('page-b', b);

    const aRestored = openPage('page-a', 'A123');
    expect(undoDepth(aRestored.state)).toBe(3);

    undo(aRestored);
    expect(aRestored.state.doc.toString()).toBe('A12');
    undo(aRestored);
    expect(aRestored.state.doc.toString()).toBe('A1');
    undo(aRestored);
    expect(aRestored.state.doc.toString()).toBe('A');

    redo(aRestored);
    expect(aRestored.state.doc.toString()).toBe('A1');
    redo(aRestored);
    expect(aRestored.state.doc.toString()).toBe('A12');
    redo(aRestored);
    expect(aRestored.state.doc.toString()).toBe('A123');
  });

  it('D: a page with no cached entry starts with clean, empty history', () => {
    const fresh = openPage('never-opened-before', 'fresh content');
    expect(undoDepth(fresh.state)).toBe(0);
    expect(redoDepth(fresh.state)).toBe(0);
  });

  it('E: selection/caret position is restored alongside history', () => {
    const a = openPage('page-a', 'hello world');
    a.dispatch({ selection: { anchor: 5 } }); // caret between "hello" and " world"
    closePage('page-a', a);

    const aRestored = openPage('page-a', 'hello world');
    expect(aRestored.state.selection.main.anchor).toBe(5);
    expect(aRestored.state.selection.main.head).toBe(5);
  });

  it('F: a cache entry whose document no longer matches the incoming markdown prop is never used — no partial/stale restore, and no corrupted history', () => {
    const a = openPage('page-a', 'A');
    a.dispatch({ changes: { from: 1, to: 1, insert: '1' } }); // "A1"
    closePage('page-a', a); // cache holds doc "A1" + 1 history entry

    // Simulate an external change to page A's content while it was closed
    // (PageOperations.mutateBody() — a task toggle from a different UI
    // surface). The fresh markdown prop on reopen ("A1-external") no
    // longer matches the cached snapshot's own embedded doc ("A1").
    const aReopened = openPage('page-a', 'A1-external');

    // The cached (now-stale) history must be silently ignored — never a
    // partial restore that shows correct-looking content with a
    // corrupted/mismatched history underneath it.
    expect(aReopened.state.doc.toString()).toBe('A1-external'); // real, current content — not the stale cached "A1"
    expect(undoDepth(aReopened.state)).toBe(0); // clean history, exactly like any other cache miss
  });

  it('G: scroll position (both the CM6 scrollEffect and the plain-DOM domScrollTop) is captured and handed back through the cache alongside history (jsdom cannot verify real pixel scrolling — see the real-browser verification in the doc entry for that)', () => {
    const a = openPage('page-a', 'A');
    const scrollEffect = a.scrollSnapshot();
    setCachedEditorSession('page-a', {
      historyJSON: serializeEditorHistory(a),
      scrollEffect,
      domScrollTop: 42,
    });
    a.destroy();

    const cached = getCachedEditorSession('page-a');
    expect(cached?.domScrollTop).toBe(42);
    // The exact same effect object round-trips through the cache — this
    // is the structural guarantee createEditorView's own restoreScrollEffect
    // relies on; the *visual* result of applying it can only be verified
    // in a real browser (jsdom has no layout, so EditorView.scrollDOM's
    // scrollTop is always 0 regardless of what's applied).
    expect(cached?.scrollEffect).toBe(scrollEffect);
  });

  it('H: a stale (doc-mismatched) cache entry discards its scroll effect along with its history — never a partial restore of just one', () => {
    const a = openPage('page-a', 'A');
    closePage('page-a', a); // caches doc "A" + a real scrollEffect

    // Page changed externally while closed (same scenario as F).
    const aReopened = openPage('page-a', 'A-external');

    // createEditorView's own gate (`scrollTo: restoredState ? ... :
    // undefined`) means a stale entry never reaches EditorViewConfig.scrollTo
    // at all — observable here as the reopened view still existing and
    // functioning normally (no exception, no attempted restore) with a
    // clean history, matching F's own assertion for the history half of
    // the same guarantee.
    expect(aReopened.state.doc.toString()).toBe('A-external');
    expect(undoDepth(aReopened.state)).toBe(0);
  });

  it('I: deleting a page clears its cached session — reopening the same id afterward starts completely fresh', () => {
    const a = openPage('page-a', 'A');
    a.dispatch({ changes: { from: 1, to: 1, insert: '1' } });
    closePage('page-a', a);
    expect(getCachedEditorSession('page-a')).not.toBeUndefined();

    clearCachedEditorSession('page-a'); // mirrors PageHost.tsx's onDelete
    expect(getCachedEditorSession('page-a')).toBeUndefined();

    // A page id is never reused after deletion in the real app, but even
    // if something did reopen it, the result is a clean, empty history —
    // never a resurrected stale session.
    const reopened = openPage('page-a', 'fresh content unrelated to the deleted page');
    expect(undoDepth(reopened.state)).toBe(0);
  });

  it('J: rapid A -> B -> A -> B switching keeps each page\'s own history correct at every step — no interleaving, no cross-contamination', () => {
    // Simulates a user clicking through pages faster than they can read —
    // each switch is still a synchronous unmount-then-mount pair (React
    // guarantees cleanup completes before the next effect runs), so
    // "rapid" has no different observable behavior than "deliberate" at
    // this level; this test exists to prove that explicitly rather than
    // leave it assumed.
    let a = openPage('page-a', 'A');
    a.dispatch({ changes: { from: 1, to: 1, insert: '1' } }); // "A1"
    closePage('page-a', a);

    let b = openPage('page-b', 'B');
    b.dispatch({ changes: { from: 1, to: 1, insert: '1' } }); // "B1"
    closePage('page-b', b);

    a = openPage('page-a', 'A1');
    expect(a.state.doc.toString()).toBe('A1');
    expect(undoDepth(a.state)).toBe(1);
    a.dispatch({ changes: { from: 2, to: 2, insert: '!' } }); // "A1!"
    closePage('page-a', a);

    b = openPage('page-b', 'B1');
    expect(b.state.doc.toString()).toBe('B1'); // never "A1!" or any trace of A
    expect(undoDepth(b.state)).toBe(1);
    closePage('page-b', b);

    a = openPage('page-a', 'A1!');
    expect(a.state.doc.toString()).toBe('A1!');
    expect(undoDepth(a.state)).toBe(2); // both of A's own edits, still intact
    undo(a);
    expect(a.state.doc.toString()).toBe('A1');
    undo(a);
    expect(a.state.doc.toString()).toBe('A');
  });

  it('K: an existing note with a non-empty title and no cached session focuses the editor on open (focusOnOpen wins when there is nothing to restore)', () => {
    const fresh = openPage('page-a', 'existing content', /* focusOnOpen */ true);
    expect(fresh.hasFocus).toBe(true);
  });

  it('L: a page opened with focusOnOpen=false (PageHost\'s empty-title policy) does not autofocus the editor — the title stays the first editing target. Body content emptiness is irrelevant here; only the caller-computed flag matters.', () => {
    const fresh = openPage('page-a', 'fresh content', /* focusOnOpen */ false);
    expect(fresh.hasFocus).toBe(false);
  });

  it('M: a page with no cached session and no open-time focus signal never autofocuses', () => {
    const fresh = openPage('never-opened-before', 'fresh content');
    expect(fresh.hasFocus).toBe(false);
  });

  it('N: a restorable cached session always focuses the editor and restores its selection, regardless of whether it was ever focused before, and even overriding focusOnOpen=false (empty title) — an established editing position always wins', () => {
    const a = openPage('page-a', 'hello world');
    a.dispatch({ selection: { anchor: 5 } });
    // Deliberately never focused before closing — this page was open but
    // never clicked into (e.g. only read, or scrolled via the sidebar).
    expect(a.hasFocus).toBe(false);
    closePage('page-a', a);

    // Reopened with focusOnOpen=false (as if its title were empty) — the
    // restorable session still wins per the priority rule: an established
    // session means "ready to edit" outranks the empty-title default.
    const aRestored = openPage('page-a', 'hello world', /* focusOnOpen */ false);
    expect(aRestored.hasFocus).toBe(true);
    expect(aRestored.state.selection.main.anchor).toBe(5);
  });

  it('O: focus decisions are isolated per page — a page\'s own restorable-session/focusOnOpen state is never influenced by what another page did', () => {
    const a = openPage('page-a', 'A', /* focusOnOpen */ true);
    a.dispatch({ changes: { from: 1, to: 1, insert: '1' } }); // real edit -> establishes the session
    closePage('page-a', a); // A now has a restorable session

    // B has never been opened before — no cached session — so its
    // isolated focusOnOpen=false is what decides, unaffected by A having
    // just been focused.
    const b = openPage('page-b', 'B', /* focusOnOpen */ false);
    expect(b.hasFocus).toBe(false);
    // B is intentionally left without ever calling closePage here, so it
    // never acquires a cached session either — the point of the next
    // assertion below.

    const aRestored = openPage('page-a', 'A1', /* focusOnOpen */ false);
    expect(aRestored.hasFocus).toBe(true); // A's own restorable session, not B's state
    closePage('page-a', aRestored);

    const bReopened = openPage('page-b', 'B', /* focusOnOpen */ false);
    expect(bReopened.hasFocus).toBe(false); // still no session of its own — never picks up A's
  });

  it('P: a stale (doc-mismatched) cache entry never grants focus on its own — the still-current focusOnOpen decides instead, following the same all-or-nothing gate as history/scroll', () => {
    const a = openPage('page-a', 'A');
    closePage('page-a', a);

    // Page changed externally while closed (same scenario as F/H) —
    // history/scroll fall back to a fresh state; focus falls back to
    // focusOnOpen exactly the same way, never partially honoring the
    // stale entry.
    const aReopenedNoFocus = openPage('page-a', 'A-external', /* focusOnOpen */ false);
    expect(aReopenedNoFocus.hasFocus).toBe(false);

    const aReopenedWithFocus = openPage('page-a', 'A-external', /* focusOnOpen */ true);
    expect(aReopenedWithFocus.hasFocus).toBe(true);
  });

  it('Q: a cache entry with no real prior engagement (default caret, no edits — e.g. a page opened and closed untouched, or React StrictMode\'s own dev-only double-mount) never forces focus on its own', () => {
    const a = openPage('page-a', 'untouched content'); // never dispatched to, never focused
    closePage('page-a', a);

    // A matching cache entry now exists, but it reflects nothing the user
    // actually did — reopening with focusOnOpen=false must not autofocus.
    const aReopened = openPage('page-a', 'untouched content', /* focusOnOpen */ false);
    expect(aReopened.hasFocus).toBe(false);
  });
});
