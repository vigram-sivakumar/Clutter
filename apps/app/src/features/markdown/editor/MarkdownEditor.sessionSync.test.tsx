// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { redo, undo, undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';

import { useDocumentSession } from '@app/hooks/useDocumentSession';
import { DocumentSession } from '@core/engine/DocumentSession';
import { DocumentTransaction } from '@core/engine/DocumentTransaction';

import { MarkdownEditor } from './MarkdownEditor';
import { __clearAllCachedEditorHistoryForTests } from './codemirror/editorHistoryCache';

/**
 * The editor as PageHost drives it, with the real DocumentSession: the host reads the session's text
 * at render time (toResourcePageModel -> `markdown: session.currentRevision.markdown`) and the editor's
 * own edits reach the session synchronously (onDocChange -> onEdit -> commitEdit -> session.commit).
 *
 * These pin the invariant MarkdownEditor's layout-effect sync relies on: the `markdown` prop is the
 * session's live text, and the view and the session only differ when something OTHER than the editor
 * changed the document. docs/editor-architecture-decisions.md, "External Markdown changes sync…".
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
});

afterEach(() => {
  cleanup();
});

function Host({
  session,
  onEdit,
}: {
  session: DocumentSession;
  onEdit?: (markdown: string) => void;
}) {
  useDocumentSession(session);

  return (
    <MarkdownEditor
      pageId={session.id}
      markdown={session.currentRevision.markdown}
      onEdit={(markdown) => {
        onEdit?.(markdown);
        session.commit(new DocumentTransaction(markdown));
      }}
    />
  );
}

function mount(initial: string) {
  const session = new DocumentSession('page', initial);
  const onEdit = vi.fn();
  const { container } = render(<Host session={session} onEdit={onEdit} />);
  const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
  view.focus();

  /** A real user keystroke: enters history, reaches the session synchronously through onEdit. */
  const type = (text: string, at = view.state.doc.length) =>
    view.dispatch({
      changes: { from: at, insert: text },
      selection: { anchor: at + text.length },
      userEvent: 'input.type',
    });
  /** Something other than the editor writes the document (PageOperations.mutateBody, a template, …). */
  const external = (next: string) =>
    act(() => {
      session.commit(new DocumentTransaction(next));
    });

  return { session, view, onEdit, type, external };
}

describe("the markdown prop is the session's live text (the sync's stale-prop invariant)", () => {
  it('a burst of keystrokes before React renders is never reverted by the render that follows', () => {
    const { session, view, onEdit, type } = mount('Hello');
    const revisionBefore = session.currentRevision.number;

    act(() => {
      type('!');
      type('!');
      type('!');
      // Three transactions landed and reached the session before any render read it.
      expect(session.currentRevision.markdown).toBe('Hello!!!');
    });

    expect(view.state.doc.toString()).toBe('Hello!!!');
    expect(session.currentRevision.markdown).toBe('Hello!!!');
    // One commit per keystroke, none added by the sync (no echo, no duplicate transaction).
    expect(session.currentRevision.number - revisionBefore).toBe(3);
    expect(onEdit).toHaveBeenCalledTimes(3);
  });

  it('an editor-only re-render with its previous (older) prop does not revert newer typing', () => {
    // The only way an older prop value reaches the editor: it re-renders on its own state with the props from
    // the last host render. Its `markdown` is then unchanged, so the layout effect (deps: [markdown]) never runs.
    const onEdit = vi.fn();
    const { container, rerender } = render(
      <MarkdownEditor pageId="p" markdown="Hello" onEdit={onEdit} />
    );
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    view.focus();
    view.dispatch({
      changes: { from: 5, insert: '!' },
      selection: { anchor: 6 },
      userEvent: 'input.type',
    });
    expect(view.state.doc.toString()).toBe('Hello!');

    rerender(<MarkdownEditor pageId="p" markdown="Hello" onEdit={onEdit} />);

    expect(view.state.doc.toString()).toBe('Hello!');
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('after any mix of typing and external writes, once React has rendered the view equals the session', () => {
    const { session, view, type, external } = mount('start');
    const steps: Array<() => void> = [
      () => act(() => type('a')),
      () => external(`${session.currentRevision.markdown} [ext1]`),
      () =>
        act(() => {
          type('b');
          type('c');
        }),
      () => external(`[top] ${session.currentRevision.markdown}`),
      () => act(() => type('d', 0)),
      () =>
        external(session.currentRevision.markdown.replace('start', 'START')),
      () => act(() => type('e')),
    ];

    for (const step of steps) {
      step();
      expect(view.state.doc.toString()).toBe(session.currentRevision.markdown);
    }
  });

  it('an external write is not reported back as an edit and adds exactly one revision', () => {
    const { session, view, onEdit, external } = mount('Hello');
    const revisionBefore = session.currentRevision.number;

    external('Hello, world');

    expect(view.state.doc.toString()).toBe('Hello, world');
    expect(onEdit).not.toHaveBeenCalled();
    expect(session.currentRevision.number - revisionBefore).toBe(1);
  });
});

describe('external changes and undo/redo, with real document contents', () => {
  it("undo and redo only move the user's own edit; an external change applied while focused is never lost", () => {
    const { session, view, type, external } = mount('Hello');
    act(() => type(' world'));
    expect(view.state.doc.toString()).toBe('Hello world');

    external('>> Hello world');
    expect(view.hasFocus).toBe(true);
    expect(view.state.doc.toString()).toBe('>> Hello world');
    expect(undoDepth(view.state)).toBe(1);

    undo(view);
    expect(view.state.doc.toString()).toBe('>> Hello');
    expect(session.currentRevision.markdown).toBe('>> Hello');

    redo(view);
    expect(view.state.doc.toString()).toBe('>> Hello world');
    expect(session.currentRevision.markdown).toBe('>> Hello world');
  });

  it("an external change is not an undo step: undoing past the user's edits leaves it in place", () => {
    const { view, type, external } = mount('Hello');
    external('>> Hello');
    act(() => type('!'));
    expect(view.state.doc.toString()).toBe('>> Hello!');

    undo(view);
    expect(view.state.doc.toString()).toBe('>> Hello');

    // Nothing left to undo: the external change stays.
    undo(view);
    expect(view.state.doc.toString()).toBe('>> Hello');

    redo(view);
    expect(view.state.doc.toString()).toBe('>> Hello!');
  });
});

describe('selection mapping for an external change', () => {
  const selectBbb = () => {
    const mounted = mount('aaa bbb ccc');
    mounted.view.dispatch({ selection: { anchor: 4, head: 7 } });
    expect(mounted.view.state.sliceDoc(4, 7)).toBe('bbb');
    return mounted;
  };
  const selected = (view: EditorView) =>
    view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to
    );

  it('a change before the selection shifts it and keeps the same text selected', () => {
    const { view, external } = selectBbb();

    external('XX aaa bbb ccc');

    expect(selected(view)).toBe('bbb');
    expect(view.state.selection.main.from).toBe(7);
  });

  it('a change after the selection leaves it untouched', () => {
    const { view, external } = selectBbb();

    external('aaa bbb ccc XX');

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(7);
    expect(selected(view)).toBe('bbb');
  });

  it('an insertion inside the selection grows it around the inserted text', () => {
    const { view, external } = selectBbb();

    external('aaa bXXbb ccc');

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(9);
    expect(selected(view)).toBe('bXXbb');
  });

  it('a collapsed caret follows the text it was after', () => {
    const { view, type, external } = mount('abc');
    act(() => type('d'));
    expect(view.state.selection.main.head).toBe(4);

    external('ZZ abcd');

    expect(view.state.selection.main.head).toBe(7);
    expect(view.state.selection.main.empty).toBe(true);
  });
});
