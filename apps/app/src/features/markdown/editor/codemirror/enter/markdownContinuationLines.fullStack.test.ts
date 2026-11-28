// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { createEditorView } from '../createEditorView';

/**
 * Enter and Backspace on list continuation lines, through the editor built the way the app builds it
 * (`createEditorView` + `buildEditorExtensions`, every real keymap and precedence) with real `keydown` events.
 *
 * Clutter indents continuation paragraphs by source — the line's own leading whitespace, four spaces per unit —
 * not by the parent list marker's width, which is what CodeMirror's Markdown list commands model. So on a
 * continuation line Enter is the generic newline-and-indent and Backspace the generic character delete; on marker
 * lines (and in blockquotes) the Markdown commands still run. Every case asserts the resulting source and the caret.
 *
 * `|` marks the caret in fixtures and results.
 */
const REQUIRED: Omit<BuildEditorExtensionsOptions, 'readOnly' | 'hostPageId'> = {
  resolveWikiLink: () => undefined,
  resolveEmbedImage: () => undefined,
  resolveEmbedPdf: () => undefined,
  onImageClick: () => undefined,
  onOpenImageMenu: () => undefined,
  onPdfEmbedClick: () => undefined,
  onOpenPdfMenu: () => undefined,
  resolveImageSrc: () => undefined,
  resolveTag: () => undefined,
  resolveDate: () => undefined,
};

const mounted: EditorView[] = [];
afterEach(() => {
  mounted.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

function mount(source: string): EditorView {
  const pos = source.indexOf('|');
  const doc = source.replace('|', '');
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' }),
  });
  view.dispatch({ selection: EditorSelection.cursor(pos) });
  ensureSyntaxTree(view.state, doc.length, 5000);
  mounted.push(view);
  return view;
}

function press(view: EditorView, key: 'Enter' | 'Backspace', shiftKey = false): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    code: key,
    keyCode: key === 'Enter' ? 13 : 8,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}

function shown(view: EditorView): string {
  const head = view.state.selection.main.head;
  const text = view.state.doc.toString();
  return text.slice(0, head) + '|' + text.slice(head);
}

const enter = (source: string) => {
  const view = mount(source);
  press(view, 'Enter');
  return shown(view);
};
const backspace = (source: string) => {
  const view = mount(source);
  press(view, 'Backspace');
  return shown(view);
};

describe('Enter on a continuation paragraph keeps its own source indentation', () => {
  it.each([
    ['unordered -', '- item\n\n    para|', '- item\n\n    para\n    |'],
    ['unordered +', '+ item\n\n    para|', '+ item\n\n    para\n    |'],
    ['unordered *', '* item\n\n    para|', '* item\n\n    para\n    |'],
    ['numbered', '1. item\n\n    para|', '1. item\n\n    para\n    |'],
    ['incomplete task', '- [ ] task\n\n    para|', '- [ ] task\n\n    para\n    |'],
    ['completed task', '- [x] task\n\n    para|', '- [x] task\n\n    para\n    |'],
    ['nested list', '- a\n    - b\n\n        para|', '- a\n    - b\n\n        para\n        |'],
    ['emoji list', '🍒 item\n\n    para|', '🍒 item\n\n    para\n    |'],
    ['directly under the item, no blank line', '- item\n    para|', '- item\n    para\n    |'],
    ['two indentation levels', '- item\n\n        para|', '- item\n\n        para\n        |'],
    ['three indentation levels', '- item\n\n            para|', '- item\n\n            para\n            |'],
    ['under a blockquote-free numbered nested item', '1. a\n    1. b\n\n        para|', '1. a\n    1. b\n\n        para\n        |'],
  ])('%s', (_name, before, after) => {
    expect(enter(before)).toBe(after);
  });

  it('splits an indented paragraph in the middle, both halves keeping the indentation', () => {
    expect(enter('- item\n\n    pa|ra')).toBe('- item\n\n    pa\n    |ra');
  });

  it('keeps every line of a multiline continuation at its indentation', () => {
    expect(enter('- item\n\n    one\n    two|')).toBe('- item\n\n    one\n    two\n    |');
  });

  it('replaces a selection and puts the caret on the indented new line', () => {
    const view = mount('- item\n\n    pa|ra');
    view.dispatch({ selection: EditorSelection.range(view.state.doc.length - 2, view.state.doc.length) });
    press(view, 'Enter');
    expect(shown(view)).toBe('- item\n\n    pa\n    |');
  });

  it('a second Enter on the now-empty indented line removes one unit, as before', () => {
    const view = mount('- item\n\n    para|');
    press(view, 'Enter');
    press(view, 'Enter');
    expect(view.state.doc.toString().startsWith('- item\n\n    para\n')).toBe(true);
    expect(view.state.doc.line(view.state.doc.lines).text.length).toBeLessThan(4);
  });
});

describe('Enter elsewhere is unchanged', () => {
  it('a normal paragraph and an indented paragraph outside a list', () => {
    expect(enter('plain|')).toBe('plain\n|');
    expect(enter('    indented|')).toBe('    indented\n    |');
  });

  it('continues an actual marker line: unordered, numbered, tasks, nested, emoji', () => {
    expect(enter('- item|')).toBe('- item\n- |');
    expect(enter('1. item|')).toBe('1. item\n2. |');
    expect(enter('- [ ] task|')).toBe('- [ ] task\n- [ ] |');
    expect(enter('- [x] task|')).toBe('- [x] task\n- [ ] |');
    expect(enter('- a\n    - b|')).toBe('- a\n    - b\n    - |');
    expect(enter('🍒 item|')).toBe('🍒 item\n🍒 |');
  });

  it('splitting a marker line at its content start keeps the marker and separator', () => {
    expect(enter('- |Text')).toBe('- \n- |Text');
    expect(enter('- [ ] |Text')).toBe('- [ ] \n- [ ] |Text');
    expect(enter('1. |Text')).toBe('1. \n2. |Text');
  });

  it('exits an empty item', () => {
    expect(enter('- item\n- |')).toBe('- item\n|');
    expect(enter('1. item\n2. |')).toBe('1. item\n|');
    expect(enter('- [ ] task\n- [ ] |')).toBe('- [ ] task\n|');
    expect(enter('🍒 item\n🍒 |')).toBe('🍒 item\n|');
  });

  it('keeps a blockquote prefix, including a quoted list', () => {
    expect(enter('> quoted|')).toBe('> quoted\n> |');
    expect(enter('> - q|')).toBe('> - q\n> - |');
  });

  it('a continuation paragraph inside a quoted list still continues the quote (known limitation: the list indentation there is the native marker width)', () => {
    // Quote prefixes belong to CodeMirror's Markdown commands, which also size the list indentation after the `>`
    // from the parent marker (two columns under `- `), not from the line's own source indentation.
    expect(enter('> - q\n>\n>     para|')).toBe('> - q\n>\n>     para\n>   |');
  });

  it('inside a code block the generic newline keeps the indentation', () => {
    expect(enter('```\n    code|\n```')).toBe('```\n    code\n    |\n```');
  });
});

describe('Backspace on a continuation line removes source indentation, one four-space unit at a time', () => {
  it.each([
    ['unordered -', '- item\n\n    |para', '- item\n\n|para'],
    ['unordered +', '+ item\n\n    |para', '+ item\n\n|para'],
    ['unordered *', '* item\n\n    |para', '* item\n\n|para'],
    ['numbered', '1. item\n\n    |para', '1. item\n\n|para'],
    ['incomplete task', '- [ ] t\n\n    |para', '- [ ] t\n\n|para'],
    ['completed task', '- [x] t\n\n    |para', '- [x] t\n\n|para'],
    ['nested list', '- a\n    - b\n\n        |para', '- a\n    - b\n\n    |para'],
    ['emoji list', '🍒 item\n\n    |para', '🍒 item\n\n|para'],
    ['directly under the item, no blank line', '- item\n    |para', '- item\n|para'],
    ['an empty indented line', '- item\n\n    |', '- item\n\n|'],
  ])('%s', (_name, before, after) => {
    expect(backspace(before)).toBe(after);
  });

  it('does not merge the paragraph into the preceding item', () => {
    expect(backspace('- item\n\n    |para')).not.toContain('- item\npara');
  });

  it('steps down one unit per press across several levels, on the same view with no re-focus', () => {
    const view = mount('- item\n\n            |para');

    press(view, 'Backspace');
    expect(shown(view)).toBe('- item\n\n        |para');
    press(view, 'Backspace');
    expect(shown(view)).toBe('- item\n\n    |para');
    press(view, 'Backspace');
    expect(shown(view)).toBe('- item\n\n|para');
  });

  it('with no indentation left, the next press is the ordinary one: it joins the previous line', () => {
    expect(backspace('- item\n\n|para')).toBe('- item\n|para');
  });

  it('deletes one character, leaving the indentation, when the caret is inside the text', () => {
    expect(backspace('- item\n\n    pa|ra')).toBe('- item\n\n    p|ra');
  });

  it('a plain indented paragraph outside a list loses one unit as before', () => {
    expect(backspace('plain\n\n    |para')).toBe('plain\n\n|para');
  });
});

describe('Backspace on marker lines and in blockquotes is unchanged', () => {
  it('at content start of a marker line, removes only the separator', () => {
    expect(backspace('- |Text')).toBe('-|Text');
    expect(backspace('1. |Text')).toBe('1.|Text');
    expect(backspace('🍒 |Text')).toBe('🍒|Text');
  });

  it('on an empty item removes the whole marker: unordered, numbered, task, emoji', () => {
    expect(backspace('- item\n- |')).toBe('- item\n|');
    expect(backspace('1. item\n2. |')).toBe('1. item\n|');
    expect(backspace('- [ ] t\n- [ ] |')).toBe('- [ ] t\n|');
    expect(backspace('🍒 item\n🍒 |')).toBe('🍒 item\n|');
  });

  it('on an empty nested item keeps the indentation', () => {
    expect(backspace('- a\n    - |')).toBe('- a\n    |');
  });

  it('in a blockquote prefix still uses the Markdown delete', () => {
    expect(backspace('> |Quoted')).toBe('|Quoted');
  });
});

describe('Backspace in a task item is CodeMirror\'s plain character delete', () => {
  it('at content start it removes the separator only: "- [ ] |Text" -> "- [ ]|Text"', () => {
    expect(backspace('- [ ] |Text')).toBe('- [ ]|Text');
  });

  it.each([
    ['completed task', '- [x] |Text', '- [x]|Text'],
    ['ordered task', '1. [ ] |Text', '1. [ ]|Text'],
    ['nested task', '- a\n    - [ ] |Text', '- a\n    - [ ]|Text'],
    ['star marker', '* [ ] |Text', '* [ ]|Text'],
  ])('%s', (_name, before, after) => {
    expect(backspace(before)).toBe(after);
  });

  it('later presses keep deleting one character each, inside the revealed raw marker', () => {
    const view = mount('- [ ] |Text');

    press(view, 'Backspace');
    expect(shown(view)).toBe('- [ ]|Text');
    press(view, 'Backspace');
    expect(shown(view)).toBe('- [ |Text');
    press(view, 'Backspace');
    expect(shown(view)).toBe('- [|Text');
  });

  it('shows the raw marker once the caret touches it, and no checkbox widget for the no-longer-task line', () => {
    const view = mount('- [ ] |Text');
    expect(view.dom.querySelectorAll('.cm-task-checkbox')).toHaveLength(1);

    press(view, 'Backspace');

    expect(view.dom.querySelectorAll('.cm-task-checkbox')).toHaveLength(0);
    expect(view.dom.querySelector('.cm-content')?.textContent).toBe('- [ ]Text');
  });

  it('with the caret inside the text, the checkbox stays rendered; the source never changes by moving the caret', () => {
    const view = mount('- [ ] Te|xt');
    expect(view.dom.querySelectorAll('.cm-task-checkbox')).toHaveLength(1);
    expect(view.state.doc.toString()).toBe('- [ ] Text');
  });

  it('an empty task still exits in one press, and the outer-marker boundary is unchanged', () => {
    expect(backspace('- [ ] |')).toBe('|');
    expect(backspace('- a\n- [ ] |')).toBe('- a\n|');
  });
});

describe('A task line holding inline tokens: Enter and Backspace at the text start', () => {
  // The first inline node on a line (a Date, Tag or WikiLink after some plain text) is a later sibling of the
  // `TaskMarker`; it must not be mistaken for the content start (the reported Tauri case, `@2026-09-30` dates).
  const LINE = "Talk to TJ and create what's new section for each tools @2026-09-30 @2026-10-23";

  it('Enter at the text start keeps the separator on the line above, so it stays a task', () => {
    expect(enter(`- [ ] |${LINE}`)).toBe(`- [ ] \n- [ ] |${LINE}`);
  });

  it('after empty tasks, a following emoji line and the exact reported shape', () => {
    expect(enter(`- [ ] \n- [ ] \n- [ ] |${LINE}\n🍒 This is a date line`)).toBe(
      `- [ ] \n- [ ] \n- [ ] \n- [ ] |${LINE}\n🍒 This is a date line`
    );
  });

  it.each([
    ['a Tag', '- [ ] |Plan #design review'],
    ['a WikiLink after text', '- [ ] |See [[Page]] now'],
    ['a Date right at the start', '- [ ] |@2026-09-30 call'],
    ['bold at the start', '- [ ] |**Bold** text'],
    ['a completed task', '- [x] |Done @2026-09-30'],
    ['an ordered task', '1. [ ] |Item @2026-09-30'],
    ['a nested task', '- a\n    - [ ] |Item @2026-09-30'],
  ])('Enter keeps the line above a task: %s', (_name, before) => {
    const view = mount(before);
    press(view, 'Enter');
    const lines = view.state.doc.toString().split('\n');
    const caretLine = view.state.doc.lineAt(view.state.selection.main.head).number;
    expect(lines[caretLine - 2]).toMatch(/\[[ x]\] $/);
    expect(lines[caretLine - 1]).toMatch(/^\s*(?:[-*+]|\d+\.) \[ \] /);
  });

  it('Backspace at the text start removes only the separator, with tokens later on the line', () => {
    expect(backspace(`- [ ] |${LINE}`)).toBe(`- [ ]|${LINE}`);
  });
});


// New requirements: explicit hard-break continuations are not ordinary indented paragraphs.
describe('List hard-break keyboard contract (diagnostic regression cases)', () => {
  it('splits CSS-like text on the first line of an already multiline ordered item', () => {
    const view = mount('2. .cm-editor .cm-task-completed,| .cm-editor span{color: var(--foreground-placeholder);\\\n   text-decoration-color: var(--foreground-placeholder);\\\n   } Change this decoration color to lighter shade');
    press(view, 'Enter', true);
    expect(shown(view)).toBe('2. .cm-editor .cm-task-completed,\\\n   | .cm-editor span{color: var(--foreground-placeholder);\\\n   text-decoration-color: var(--foreground-placeholder);\\\n   } Change this decoration color to lighter shade');
  });

  it.each([
    ['before existing break', '- first|\\\n  second'],
    ['after existing break', '- first\\|\n  second'],
  ])('inserts another hard break at the visual end (%s)', (_name, source) => {
    const view = mount(source);
    press(view, 'Enter', true);
    expect(shown(view)).toBe('- first\\\n  |\\\n  second');
  });

  it.each([
    ['bullet', '- first\\\n  second|', '- first\\\n  second\n- |'],
    ['star', '* first\\\n  second|', '* first\\\n  second\n* |'],
    ['plus', '+ first\\\n  second|', '+ first\\\n  second\n+ |'],
    ['ordered', '2. first\\\n   second|', '2. first\\\n   second\n3. |'],
    ['task', '- [ ] first\\\n  second|', '- [ ] first\\\n  second\n- [ ] |'],
    ['completed task', '- [x] first\\\n  second|', '- [x] first\\\n  second\n- [ ] |'],
    ['nested', '- parent\n  - first\\\n    second|', '- parent\n  - first\\\n    second\n  - |'],
    ['multiple breaks', '- first\\\n  second\\\n  third|', '- first\\\n  second\\\n  third\n- |'],
    ['mid-line', '- first\\\n  sec|ond', '- first\\\n  sec\n- |ond'],
  ])('Enter creates a sibling from a %s hard-break continuation', (_name, source, expected) => {
    expect(enter(source)).toBe(expected);
  });

  it('Enter immediately after Shift+Enter replaces the pending break with a sibling', () => {
    const view = mount('- first|');
    press(view, 'Enter', true);
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    expect(shown(view)).toBe('- first\\\n  |');
    press(view, 'Enter');
    expect(shown(view)).toBe('- first\n- |');
  });
});
