// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { defaultKeymap, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from './createEditorView';
import { editorDefaultKeymap } from './editorDefaultKeymap';
import { markdownIndentKeymap } from './indent/markdownIndentKeymap';
import { markdownLanguageExtension } from './markdownLanguage';

/**
 * ⌘[ and ⌘] are Go back and Go forward (app/shortcuts/shortcuts.ts), and indentation is Tab / Shift-Tab.
 * CodeMirror's default keymap binds the same two keys to indentLess / indentMore, and a key press the editor
 * handles is `preventDefault`-ed, which makes the application's dispatcher stand down. These tests pin that the
 * editor leaves both keys alone, and that Tab / Shift-Tab still indent and outdent.
 */
const mounted: EditorView[] = [];
afterEach(() => {
  mounted.splice(0).forEach((view) => view.destroy());
  document.body.innerHTML = '';
});

function mount(doc: string, cursor?: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: [markdownLanguageExtension(), markdownIndentKeymap()],
  });
  if (cursor !== undefined) view.dispatch({ selection: { anchor: cursor } });
  mounted.push(view);
  return view;
}

/** A real key press at the editor, the way a keyboard sends it: the character, and the physical key's code. */
function press(view: EditorView, init: KeyboardEventInit & { key: string; code: string }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const KEYS = {
  back: { key: '[', code: 'BracketLeft', keyCode: 219 },
  forward: { key: ']', code: 'BracketRight', keyCode: 221 },
} as const;

describe('editorDefaultKeymap', () => {
  it('is the default keymap without the two bindings the application owns, and nothing else removed', () => {
    const keys = (map: readonly { key?: string }[]) => map.map((binding) => binding.key);
    expect(keys(defaultKeymap)).toContain('Mod-[');
    expect(keys(defaultKeymap)).toContain('Mod-]');
    expect(keys(editorDefaultKeymap)).not.toContain('Mod-[');
    expect(keys(editorDefaultKeymap)).not.toContain('Mod-]');
    expect(editorDefaultKeymap).toHaveLength(defaultKeymap.length - 2);
    // Everything else is the editor's, including CodeMirror's own ⇧⌘\\ (jump to the matching bracket).
    expect(keys(editorDefaultKeymap)).toContain('Shift-Mod-\\');
    expect(keys(editorDefaultKeymap)).toContain('Mod-Alt-\\');
  });
});

describe.each([
  ['⌘]', { ...KEYS.forward, metaKey: true }],
  ['⌘[', { ...KEYS.back, metaKey: true }],
  ['Ctrl+]', { ...KEYS.forward, ctrlKey: true }],
  ['Ctrl+[', { ...KEYS.back, ctrlKey: true }],
])('%s in the editor', (_name, init) => {
  it('does not indent or outdent a line, and does not move the cursor or selection', () => {
    const view = mount('Text', 2);
    press(view, init);
    expect(view.state.doc.toString()).toBe('Text');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('does not outdent an already-indented line', () => {
    const view = mount('    Text', 6);
    press(view, init);
    expect(view.state.doc.toString()).toBe('    Text');
  });

  it('does not indent or outdent a selected range of list items', () => {
    const doc = '- a\n    - b\n- c';
    const view = mount(doc);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });
    press(view, init);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('leaves the key press unhandled, so it reaches the application’s shortcut handler', () => {
    const view = mount('Text');
    expect(press(view, init).defaultPrevented).toBe(false);
  });

  it('adds nothing to the undo history', () => {
    const view = mount('Text');
    const before = undoDepth(view.state);
    press(view, init);
    expect(undoDepth(view.state)).toBe(before);
  });
});

describe('typing [ and ] is still typing', () => {
  it.each([
    ['[', { key: '[', code: 'BracketLeft', keyCode: 219 }],
    [']', { key: ']', code: 'BracketRight', keyCode: 221 }],
    ['{', { key: '{', code: 'BracketLeft', keyCode: 219, shiftKey: true }],
    ['}', { key: '}', code: 'BracketRight', keyCode: 221, shiftKey: true }],
  ])('%s with no ⌘ or Ctrl is not handled by the editor’s keymap either', (_char, init) => {
    const view = mount('Text');
    const event = press(view, init);
    expect(view.state.doc.toString()).toBe('Text');
    // Not claimed by the keymap: the browser still types it.
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('Tab and Shift-Tab still indent and outdent', () => {
  it('Tab indents a nested list item by one unit', () => {
    const view = mount('- a\n- b', 7);
    const tab = press(view, { key: 'Tab', code: 'Tab', keyCode: 9 });
    expect(view.state.doc.toString()).toBe('- a\n    - b');
    expect(tab.defaultPrevented).toBe(true);
  });

  it('Shift-Tab outdents it again', () => {
    const view = mount('- a\n    - b', 11);
    const tab = press(view, { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey: true });
    expect(view.state.doc.toString()).toBe('- a\n- b');
    expect(tab.defaultPrevented).toBe(true);
  });
});
