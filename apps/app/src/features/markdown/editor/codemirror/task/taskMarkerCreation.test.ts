// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterKeymap } from '../enter/markdownEnterKeymap';
import { markdownIndentKeymap } from '../indent/markdownIndentKeymap';
import { insertTaskMarkerOnSpace, TASK_MARKER } from './taskMarkerCreation';

/**
 * Typing `[]` at the start of a line and pressing Space makes an unchecked task. These press real keys on a real
 * editor, through the same `markdownEnterKeymap()` the app installs, so the generated marker meets the existing Enter
 * and Backspace behavior for tasks, not a copy of it.
 */
const mounted: EditorView[] = [];
afterEach(() => {
  mounted.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

/** `|` marks the cursor. */
function mount(source: string): EditorView {
  const pos = source.indexOf('|');
  const doc = source.slice(0, pos) + source.slice(pos + 1);
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: [markdownLanguageExtension(), markdownEnterKeymap(), markdownIndentKeymap()],
  });
  view.dispatch({ selection: { anchor: pos } });
  mounted.push(view);
  return view;
}

function press(view: EditorView, key: string, code: string, keyCode = 0): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, code, keyCode, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const space = (view: EditorView) => press(view, ' ', 'Space', 32);
const enter = (view: EditorView) => press(view, 'Enter', 'Enter', 13);
const backspace = (view: EditorView) => press(view, 'Backspace', 'Backspace', 8);
const text = (view: EditorView, insert: string) =>
  view.dispatch({ changes: { from: view.state.selection.main.head, insert }, selection: { anchor: view.state.selection.main.head + insert.length } });
const doc = (view: EditorView) => view.state.doc.toString();
const head = (view: EditorView) => view.state.selection.main.head;

function nodeNames(view: EditorView): string[] {
  const names: string[] = [];
  syntaxTree(view.state).iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

describe('[] + Space makes an unchecked task', () => {
  it('turns [] into "- [ ] " and takes over the Space', () => {
    const view = mount('[]|');
    const event = space(view);
    expect(doc(view)).toBe(TASK_MARKER);
    expect(doc(view)).toBe('- [ ] ');
    expect(event.defaultPrevented).toBe(true);
  });

  it('puts the cursor at the end of the marker, ready for the task text', () => {
    const view = mount('[]|');
    space(view);
    expect(head(view)).toBe(6);
    text(view, 'Buy milk');
    expect(doc(view)).toBe('- [ ] Buy milk');
  });

  it('keeps the indentation as typed', () => {
    const view = mount('    []|');
    space(view);
    expect(doc(view)).toBe('    - [ ] ');
    expect(head(view)).toBe(10);
    const tab = mount('\t[]|');
    space(tab);
    expect(doc(tab)).toBe('\t- [ ] ');
  });

  it('works on a later line, and under an item as a nested task', () => {
    const later = mount('Intro\n\n[]|');
    space(later);
    expect(doc(later)).toBe('Intro\n\n- [ ] ');
    const nested = mount('- a\n    []|');
    space(nested);
    expect(doc(nested)).toBe('- a\n    - [ ] ');
    expect(head(nested)).toBe(nested.state.doc.length);
  });

  it('is a real task: the parser makes it a Task with a TaskMarker', () => {
    const view = mount('[]|');
    space(view);
    text(view, 't');
    expect(nodeNames(view)).toEqual(expect.arrayContaining(['BulletList', 'ListItem', 'ListMark', 'Task', 'TaskMarker']));
    // and the one a person types by hand is the same tree
    const byHand = mount('- [ ] t|');
    expect(nodeNames(byHand)).toEqual(nodeNames(view));
  });
});

describe('[] + Space leaves everything else alone', () => {
  const declines = (source: string) => {
    const view = mount(source);
    const before = doc(view);
    const event = space(view);
    expect(doc(view), source).toBe(before);
    expect(event.defaultPrevented, source).toBe(false);
  };

  it('does nothing for [] in the middle of text', () => {
    declines('see []|');
    declines('a [] b|'.replace(' b', ''));
    declines('word[]|');
  });

  it('does nothing when text follows the cursor on the line', () => {
    declines('[]|text');
    declines('[|]');
  });

  it('does nothing for brackets that are not a bare empty pair', () => {
    declines('[ ]|');
    declines('[x]|');
    declines('[a]|');
    declines('[[]]|');
  });

  it('does nothing after a list or quote marker: that [] is the item’s own text', () => {
    declines('- []|');
    declines('1. []|');
    declines('> []|');
  });

  it('does nothing inside fenced code', () => {
    declines('```\n[]|\n```');
  });

  it('does nothing with a selection', () => {
    const view = mount('[]|');
    view.dispatch({ selection: { anchor: 0, head: 2 } });
    const event = space(view);
    expect(doc(view)).toBe('[]');
    expect(event.defaultPrevented).toBe(false);
  });

  it('the command declines (false) outside its shape, so the Space is typed as usual', () => {
    const view = mount('plain|');
    expect(insertTaskMarkerOnSpace({ state: view.state, dispatch: () => {} })).toBe(false);
  });
});

describe('the other markers are unchanged', () => {
  it('a bare ordered marker + Space is still numbered', () => {
    const view = mount('1. a\n2. b\n9.|');
    space(view);
    expect(doc(view)).toBe('1. a\n2. b\n3. ');
  });

  it('a bullet marker + Space is still left to the default', () => {
    const view = mount('-|');
    const event = space(view);
    expect(doc(view)).toBe('-');
    expect(event.defaultPrevented).toBe(false);
  });

  it('a task typed by hand still works', () => {
    const view = mount('- [ ] t|');
    enter(view);
    expect(doc(view)).toBe('- [ ] t\n- [ ] ');
  });
});

describe('the generated task meets the existing Enter and Backspace behavior', () => {
  it('Enter after its text continues the task', () => {
    const view = mount('[]|');
    space(view);
    text(view, 'one');
    enter(view);
    expect(doc(view)).toBe('- [ ] one\n- [ ] ');
    expect(head(view)).toBe(doc(view).length);
    text(view, 'two');
    expect(doc(view)).toBe('- [ ] one\n- [ ] two');
  });

  it('Enter on the still-empty generated task removes it', () => {
    const view = mount('[]|');
    space(view);
    enter(view);
    expect(doc(view)).toBe('');
  });

  it('Backspace on the empty generated task removes the whole marker', () => {
    const view = mount('[]|');
    space(view);
    backspace(view);
    expect(doc(view)).toBe('');
    expect(head(view)).toBe(0);
  });

  it('Backspace on an empty generated task after another item removes just that marker', () => {
    const view = mount('- [ ] one\n[]|');
    space(view);
    expect(doc(view)).toBe('- [ ] one\n- [ ] ');
    backspace(view);
    expect(doc(view)).toBe('- [ ] one\n');
  });

  it('Backspace right after the text removes a character, not the marker', () => {
    const view = mount('[]|');
    space(view);
    text(view, 'ab');
    backspace(view);
    expect(doc(view)).toBe('- [ ] a');
  });
});
