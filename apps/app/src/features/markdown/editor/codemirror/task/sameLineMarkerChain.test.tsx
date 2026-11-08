// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';
import { markdownEnterKeymap } from '../enter/markdownEnterKeymap';
import { markdownIndentKeymap } from '../indent/markdownIndentKeymap';
import { listMarkerDecoration } from '../list/listMarkerDecoration';
import { taskCheckboxDecoration } from './taskCheckboxDecoration';
import { taskCompletedContentDecoration } from './taskCompletedContentDecoration';

/**
 * `* - [ ] Buy groceries` is one bullet whose text is the literal `- [ ] Buy groceries`. CommonMark parses a marker
 * that follows another on the same line as a nested list, and that parse is deliberately left alone (the parser is
 * global). The editor's own layers treat every later marker on a physical line as plain text instead: the list marker
 * is drawn once (`listMarkerDecoration.ts`), Enter continues the first marker (`continueFirstSameLineListLevel`), and
 * this file pins the same rule for tasks: no checkbox, no completed styling, no task-specific Enter handling.
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
    extensions: [
      markdownLanguageExtension(),
      listMarkerDecoration(),
      taskCheckboxDecoration(),
      taskCompletedContentDecoration(),
      markdownEnterKeymap(),
      markdownIndentKeymap(),
    ],
  });
  view.dispatch({ selection: { anchor: pos } });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  mounted.push(view);
  return view;
}

function press(view: EditorView, key: string, code: string, keyCode = 0): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, code, keyCode, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const enter = (view: EditorView) => press(view, 'Enter', 'Enter', 13);
const space = (view: EditorView) => press(view, ' ', 'Space', 32);

/** One typed character: Space goes through the keymap as a real key press, everything else is inserted text. */
function typeChar(view: EditorView, char: string) {
  if (char === ' ' && space(view).defaultPrevented) {
    return;
  }
  const head = view.state.selection.main.head;
  view.dispatch({ changes: { from: head, insert: char }, selection: { anchor: head + 1 }, userEvent: 'input.type' });
}
const type = (view: EditorView, chars: string) => [...chars].forEach((char) => typeChar(view, char));

const doc = (view: EditorView) => view.state.doc.toString();
const checkboxes = (view: EditorView) => view.dom.querySelectorAll('.cm-task-checkbox').length;
const completedMarks = (view: EditorView) => view.dom.querySelectorAll('.cm-task-completed').length;
const bulletMarkers = (view: EditorView) => view.dom.querySelectorAll('.cm-bullet-list-marker').length;

function nodeNames(view: EditorView): string[] {
  const names: string[] = [];
  syntaxTree(view.state).iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

describe('same-line marker chain: later markers are literal text', () => {
  it('typing "* - [ ] Buy groceries" keeps exactly the typed source', () => {
    const view = mount('|');
    type(view, '* - [ ] Buy groceries');
    expect(doc(view)).toBe('* - [ ] Buy groceries');
  });

  it('renders one bullet and no checkbox for the typed sequence', () => {
    const view = mount('|');
    type(view, '* - [ ] Buy groceries');
    expect(bulletMarkers(view)).toBe(1);
    expect(checkboxes(view)).toBe(0);
  });

  it('the parser still reads the source as nested; the editor layers are what make it literal text', () => {
    const view = mount('* - [ ] Buy groceries|');
    const names = nodeNames(view);
    expect(names.filter((name) => name === 'ListItem')).toHaveLength(2);
    expect(names).toContain('TaskMarker');
  });

  it('Enter at the end continues the outer bullet at the same level', () => {
    const view = mount('* - [ ] Buy groceries|');
    enter(view);
    expect(doc(view)).toBe('* - [ ] Buy groceries\n* ');
    expect(view.state.selection.main.head).toBe(doc(view).length);
    expect(checkboxes(view)).toBe(0);
  });

  it('keeps the same-level continuation across a typed sequence and a second Enter', () => {
    const view = mount('|');
    type(view, '* - [ ] Buy groceries');
    enter(view);
    type(view, 'Milk');
    enter(view);
    expect(doc(view)).toBe('* - [ ] Buy groceries\n* Milk\n* ');
    expect(checkboxes(view)).toBe(0);
    expect(bulletMarkers(view)).toBe(3);
  });

  it('an empty continuation exits the list, as for any bullet', () => {
    const view = mount('* - [ ] Buy groceries|');
    enter(view);
    enter(view);
    expect(doc(view)).toBe('* - [ ] Buy groceries\n');
  });

  it('works for every bullet marker, ordered outer lists and a checked marker', () => {
    const dash = mount('- - [ ] a|');
    enter(dash);
    expect(doc(dash)).toBe('- - [ ] a\n- ');

    const plus = mount('+ - [ ] a|');
    enter(plus);
    expect(doc(plus)).toBe('+ - [ ] a\n+ ');

    const ordered = mount('1. - [ ] a|');
    enter(ordered);
    expect(doc(ordered)).toBe('1. - [ ] a\n2. ');
    expect(checkboxes(ordered)).toBe(0);

    const checked = mount('* - [x] done|');
    enter(checked);
    expect(doc(checked)).toBe('* - [x] done\n* ');
    expect(checkboxes(checked)).toBe(0);
  });

  it('a checked literal task is not struck through as completed', () => {
    const view = mount('* - [x] done|');
    expect(completedMarks(view)).toBe(0);
  });

  it('a mid-line Enter still splits the text (CodeMirror default, unchanged)', () => {
    const view = mount('* - [ ] Buy| groceries');
    enter(view);
    expect(doc(view).startsWith('* - [ ] Buy\n')).toBe(true);
  });
});

/** The literal text after the first marker deletes one character per Backspace, in a bullet list and an ordered one. */
describe('same-line marker chain: ordered and bullet lists behave the same', () => {
  const OUTER = [
    { name: 'bullet', marker: '- ', next: '- ' },
    { name: 'ordered', marker: '4. ', next: '5. ' },
  ] as const;

  const backspaceFrom = (source: string) => {
    const view = mount(source);
    press(view, 'Backspace', 'Backspace', 8);
    return `${doc(view).slice(0, view.state.selection.main.head)}|${doc(view).slice(view.state.selection.main.head)}`;
  };

  for (const { name, marker, next } of OUTER) {
    describe(name, () => {
      it('Enter at the end of literal "- [ ]" continues the outer list', () => {
        const view = mount(`${marker}- [ ]|`);
        enter(view);
        expect(doc(view)).toBe(`${marker}- [ ]\n${next}`);
      });

      it('Enter after literal "- [ ] " and after literal "- " continues the outer list', () => {
        const withSpace = mount(`${marker}- [ ] |`);
        enter(withSpace);
        expect(doc(withSpace)).toBe(`${marker}- [ ] \n${next}`);

        const dash = mount(`${marker}- |`);
        enter(dash);
        expect(doc(dash)).toBe(`${marker}- \n${next}`);
      });

      it('Backspace deletes exactly one character at every position inside "- [ ]"', () => {
        expect(backspaceFrom(`${marker}- [ ]|`)).toBe(`${marker}- [ |`);
        expect(backspaceFrom(`${marker}- [ |]`)).toBe(`${marker}- [|]`);
        expect(backspaceFrom(`${marker}- [|]`)).toBe(`${marker}- |]`);
        expect(backspaceFrom(`${marker}- [| ]`)).toBe(`${marker}- | ]`);
        expect(backspaceFrom(`${marker}- |[ ]`)).toBe(`${marker}-|[ ]`);
        expect(backspaceFrom(`${marker}-| [ ]`)).toBe(`${marker}| [ ]`);
      });

      it('Backspace after "- [ ] " removes only the trailing space, not the whole sequence', () => {
        expect(backspaceFrom(`${marker}- [ ] |`)).toBe(`${marker}- [ ]|`);
        expect(backspaceFrom(`${marker}- [ ] x|`)).toBe(`${marker}- [ ] |`);
      });

      it('Backspace after a literal "- " without a checkbox removes one character', () => {
        expect(backspaceFrom(`${marker}- |`)).toBe(`${marker}-|`);
        expect(backspaceFrom(`${marker}- x|`)).toBe(`${marker}- |`);
      });

      it('Backspace at the outer item content start still acts on the outer marker only', () => {
        // The separator goes and the outer marker stays, as for any item with content; `- [ ] x` is untouched.
        expect(backspaceFrom(`${marker}|- [ ] x`)).toBe(`${marker.trimEnd()}|- [ ] x`);
      });

      it('keeps the typed source, shows one marker, and never inserts escape characters', () => {
        // Typing an ordered marker numbers it from 1 (marker creation), whatever digits were typed.
        const typed = name === 'ordered' ? '1. ' : marker;
        const view = mount('|');
        type(view, `${typed}- [ ]`);
        expect(doc(view)).toBe(`${typed}- [ ]`);
        expect(bulletMarkers(view) + view.dom.querySelectorAll('.cm-ordered-list-marker').length).toBe(1);
        expect(doc(view)).not.toContain('\\');
      });

      it('a genuine nested bullet on its own line is unchanged', () => {
        const view = mount(`${marker}Parent\n  - Child|`);
        enter(view);
        expect(doc(view)).toBe(`${marker}Parent\n  - Child\n  - `);
      });

      it('a genuine task on its own line is unchanged', () => {
        const view = mount(`${marker}Parent\n  - [ ] Child|`);
        expect(checkboxes(view)).toBe(1);
        enter(view);
        expect(doc(view)).toBe(`${marker}Parent\n  - [ ] Child\n  - [ ] `);
      });
    });
  }

  it('Enter renumbers the later ordered siblings', () => {
    const view = mount('4. - [ ]|\n5. next');
    enter(view);
    expect(doc(view)).toBe('4. - [ ]\n5. \n6. next');
  });
});

describe('same-line marker chain: real tasks and nesting are unchanged', () => {
  it('a plain task still renders a checkbox and continues as a task', () => {
    const view = mount('- [ ] Buy groceries|');
    expect(checkboxes(view)).toBe(1);
    enter(view);
    expect(doc(view)).toBe('- [ ] Buy groceries\n- [ ] ');
  });

  it('an ordered task still renders a checkbox', () => {
    const view = mount('1. [ ] Buy groceries|');
    expect(checkboxes(view)).toBe(1);
  });

  it('a completed task is still marked completed', () => {
    const view = mount('- [x] done|');
    expect(completedMarks(view)).toBe(1);
  });

  it('a task nested on its own indented line is a real task', () => {
    const view = mount('* Parent\n  - [ ] Child|');
    expect(checkboxes(view)).toBe(1);
    enter(view);
    expect(doc(view)).toBe('* Parent\n  - [ ] Child\n  - [ ] ');
  });

  it('a task nested under an empty parent marker on the line above is a real task', () => {
    const view = mount('*\n  - [ ] Child|');
    expect(checkboxes(view)).toBe(1);
  });

  it('Tab on a following task item still nests it as a real task', () => {
    const view = mount('* Parent\n- [ ] Child|');
    press(view, 'Tab', 'Tab', 9);
    expect(doc(view)).toBe('* Parent\n    - [ ] Child');
    expect(checkboxes(view)).toBe(1);
  });

  it('a plain same-line bullet chain still continues the first marker', () => {
    const view = mount('- - Text|');
    enter(view);
    expect(doc(view)).toBe('- - Text\n- ');
  });
});
