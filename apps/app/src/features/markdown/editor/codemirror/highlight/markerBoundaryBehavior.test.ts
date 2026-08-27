// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  deleteCharBackward,
  deleteCharForward,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
} from '@codemirror/commands';
import { markdownLanguageExtension } from '../markdownLanguage';
import { inlineLivePreviewRegion } from './inlineLivePreviewRegion';
import { createInlineLivePreviewParticipants } from './inlineLivePreviewParticipants';

const noResolvers = { resolveTag: () => undefined, resolveDate: () => undefined };

function mount(doc: string, pos: number): EditorView {
  const parent = document.createElement('div');
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownLanguageExtension(), inlineLivePreviewRegion(createInlineLivePreviewParticipants(noResolvers))],
  });
  return new EditorView({ state, parent });
}

const CASES: Array<{ name: string; doc: string; markerLen: number }> = [
  { name: 'Emphasis', doc: '*italic*', markerLen: 1 },
  { name: 'StrongEmphasis', doc: '**bold**', markerLen: 2 },
  { name: 'Strikethrough', doc: '~~strike~~', markerLen: 2 },
  { name: 'Highlight', doc: '==highlight==', markerLen: 2 },
  { name: 'InlineCode', doc: '`code`', markerLen: 1 },
];

describe('Backspace/Delete at marker boundaries (real CM6 commands)', () => {
  for (const { name, doc, markerLen } of CASES) {
    it(`${name}: Backspace right after opening marker deletes exactly the last marker character`, () => {
      const view = mount(doc, markerLen); // caret right after opening marker
      const ok = deleteCharBackward(view);
      expect(ok).toBe(true);
      // exactly one character removed, and it was the marker's own last char, not content
      expect(view.state.doc.toString()).toBe(doc.slice(0, markerLen - 1) + doc.slice(markerLen));
      view.destroy();
    });

    it(`${name}: Delete right before opening marker's last char deletes exactly that char`, () => {
      const view = mount(doc, markerLen - 1); // caret before the LAST marker char (mid-marker for 2-char markers)
      const ok = deleteCharForward(view);
      expect(ok).toBe(true);
      expect(view.state.doc.toString()).toBe(doc.slice(0, markerLen - 1) + doc.slice(markerLen));
      view.destroy();
    });

    it(`${name}: Backspace at the very start of the document is a no-op (nothing to delete), doc unchanged`, () => {
      const view = mount(doc, 0);
      deleteCharBackward(view);
      expect(view.state.doc.toString()).toBe(doc);
      view.destroy();
    });
  }
});

describe('StrongEmphasis: cursor strictly between the two opening * characters', () => {
  it('is a real, independently addressable document position (offset 1 in "**bold**")', () => {
    const view = mount('**bold**', 1);
    expect(view.state.selection.main.head).toBe(1);
    // Backspace from here deletes exactly the first '*', leaving "*bold**"
    const ok = deleteCharBackward(view);
    expect(ok).toBe(true);
    expect(view.state.doc.toString()).toBe('*bold**');
    view.destroy();
  });

  it('Delete from between the two opening * removes exactly the second *, leaving "*bold**"', () => {
    const view = mount('**bold**', 1);
    const ok = deleteCharForward(view);
    expect(ok).toBe(true);
    expect(view.state.doc.toString()).toBe('*bold**');
    view.destroy();
  });
});

describe('Home/End through a concealed marker run (real CM6 commands)', () => {
  const doc = 'prefix **bold** suffix';
  it('cursorLineBoundaryForward (End) from inside the construct lands at true end of line, not the marker edge', () => {
    const view = mount(doc, doc.indexOf('bold'));
    const ok = cursorLineBoundaryForward(view);
    expect(ok).toBe(true);
    expect(view.state.selection.main.head).toBe(doc.length);
    view.destroy();
  });

  it('cursorLineBoundaryBackward (Home) from inside the construct lands at true start of line, not the marker edge', () => {
    const view = mount(doc, doc.indexOf('bold'));
    const ok = cursorLineBoundaryBackward(view);
    expect(ok).toBe(true);
    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });

  it('End from a position before the construct still reaches true end of line', () => {
    const view = mount(doc, 2); // inside "prefix"
    cursorLineBoundaryForward(view);
    expect(view.state.selection.main.head).toBe(doc.length);
    view.destroy();
  });

  it('Home from a position after the construct still reaches true start of line', () => {
    const view = mount(doc, doc.length - 2); // inside "suffix"
    cursorLineBoundaryBackward(view);
    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });
});

describe('Shift-selection spanning a concealed marker boundary is not snapped', () => {
  it('a selection anchored between the two opening * and extended into content keeps its exact endpoints', () => {
    const view = mount('**bold**', 1);
    view.dispatch({ selection: EditorSelection.range(1, 5) }); // between *'s -> middle of "bold"
    expect(view.state.selection.main.anchor).toBe(1);
    expect(view.state.selection.main.head).toBe(5);
    view.destroy();
  });

  it('a selection spanning the whole construct including both markers keeps its exact endpoints', () => {
    const view = mount('before **bold** after', 0);
    const from = 'before '.length;
    const to = from + '**bold**'.length;
    view.dispatch({ selection: EditorSelection.range(from, to) });
    expect(view.state.selection.main.anchor).toBe(from);
    expect(view.state.selection.main.head).toBe(to);
    view.destroy();
  });
});

describe('Repeated/multi-step edit sequences recompute decorations correctly at every step', () => {
  function concealedMarkerCount(view: EditorView): number {
    return view.dom.querySelectorAll('.cm-marker--concealed').length;
  }
  function markerCount(view: EditorView): number {
    return view.dom.querySelectorAll('.cm-marker').length;
  }

  it('typing a construct character-by-character concealment only appears once both delimiters exist', () => {
    const view = mount('', 0);
    const chars = '**bold**'.split('');
    for (const ch of chars) {
      view.dispatch(view.state.replaceSelection(ch));
    }
    expect(view.state.doc.toString()).toBe('**bold**');
    // caret is at doc end (inside the closing marker's own boundary) -> engaged, markers present but unconcealed
    expect(markerCount(view)).toBe(2);
    view.destroy();
  });

  it('engage then disengage then re-engage across several selection moves toggles concealment consistently', () => {
    const view = mount('before **bold** after', 0);
    const insideFrom = 'before '.length + 2; // inside "bold"
    const outsideFrom = 0;

    view.dispatch({ selection: EditorSelection.cursor(outsideFrom) });
    expect(concealedMarkerCount(view)).toBe(2);

    view.dispatch({ selection: EditorSelection.cursor(insideFrom) });
    expect(concealedMarkerCount(view)).toBe(0);
    expect(markerCount(view)).toBe(2);

    view.dispatch({ selection: EditorSelection.cursor(outsideFrom) });
    expect(concealedMarkerCount(view)).toBe(2);
    view.destroy();
  });

  it('deleting content down to an empty construct, then deleting a marker character, stays consistent', () => {
    const view = mount('**bold**', 2); // caret at start of "bold"
    // delete all 4 content chars one at a time (forward)
    for (let i = 0; i < 4; i++) {
      deleteCharForward(view);
    }
    expect(view.state.doc.toString()).toBe('****');
    // now delete one marker char
    deleteCharForward(view);
    expect(view.state.doc.toString()).toBe('***');
    view.destroy();
  });

  it('mixed constructs: editing one construct does not perturb a sibling construct\'s decorations', () => {
    const view = mount('**bold** and ~~strike~~', 0);
    view.dispatch({ selection: EditorSelection.cursor(2) }); // engage bold
    expect(view.dom.querySelector('.cm-strike-marker.cm-marker--concealed')).not.toBeNull();
    expect(view.dom.querySelector('.cm-strong-marker.cm-marker--concealed')).toBeNull();

    view.dispatch({ selection: EditorSelection.cursor(view.state.doc.toString().indexOf('strike')) });
    expect(view.dom.querySelector('.cm-strong-marker.cm-marker--concealed')).not.toBeNull();
    expect(view.dom.querySelector('.cm-strike-marker.cm-marker--concealed')).toBeNull();
    view.destroy();
  });
});
