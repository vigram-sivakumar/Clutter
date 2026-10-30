// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is: make it a Mac before anything imports it, so
// these presses are the ⌘ presses the dialog shows.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldedRanges } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '@features/markdown/editor/codemirror/buildEditorExtensions';
import { createEditorView } from '@features/markdown/editor/codemirror/createEditorView';
import { MARKDOWN_SHORTCUT_GROUPS } from './markdownShortcuts';
import type { ShortcutKeySpec } from './shortcuts';

/**
 * The Markdown guide dialog is a claim about the editor. This presses every key it lists on a real editor, built the
 * way the app builds it (`createEditorView` + `buildEditorExtensions`), and checks both that the editor does what the
 * row says and that the row's key chips are the combination that was pressed. A row cannot outlive its key.
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

function mount(doc: string, anchor = doc.length, head = anchor): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' }),
  });
  view.dispatch({ selection: { anchor, head } });
  mounted.push(view);
  return view;
}

interface Press {
  readonly key: string;
  readonly code: string;
  readonly keyCode?: number;
  readonly meta?: boolean;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

function press(view: EditorView, p: Press): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: p.key,
    code: p.code,
    keyCode: p.keyCode ?? 0,
    metaKey: p.meta,
    ctrlKey: p.ctrl,
    altKey: p.alt,
    shiftKey: p.shift,
    bubbles: true,
    cancelable: true,
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

const PRESSES: Record<string, Press> = {
  bold: { key: 'b', code: 'KeyB', meta: true },
  italic: { key: 'i', code: 'KeyI', meta: true },
  underline: { key: 'u', code: 'KeyU', meta: true },
  'inline-code': { key: 'e', code: 'KeyE', meta: true },
  indent: { key: 'Tab', code: 'Tab', keyCode: 9 },
  outdent: { key: 'Tab', code: 'Tab', keyCode: 9, shift: true },
  continue: { key: 'Enter', code: 'Enter', keyCode: 13 },
  exit: { key: 'Enter', code: 'Enter', keyCode: 13 },
  'line-break': { key: 'Enter', code: 'Enter', keyCode: 13, shift: true },
  'remove-marker': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  'move-line-up': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, alt: true },
  'move-line-down': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, alt: true },
  'duplicate-line-above': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, alt: true, shift: true },
  'duplicate-line-below': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, alt: true, shift: true },
  'delete-line': { key: 'k', code: 'KeyK', keyCode: 75, meta: true, shift: true },
  'insert-line-below': { key: 'Enter', code: 'Enter', keyCode: 13, meta: true },
  fold: { key: '[', code: 'BracketLeft', keyCode: 219, meta: true, alt: true },
  unfold: { key: ']', code: 'BracketRight', keyCode: 221, meta: true, alt: true },
  'fold-all': { key: '[', code: 'BracketLeft', keyCode: 219, ctrl: true, alt: true },
  'unfold-all': { key: ']', code: 'BracketRight', keyCode: 221, ctrl: true, alt: true },
  'add-cursor-above': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, meta: true, alt: true },
  'add-cursor-below': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, meta: true, alt: true },
  'matching-bracket': { key: '|', code: 'Backslash', keyCode: 220, meta: true, shift: true },
};

const KEY_CHIP: Record<string, ShortcutKeySpec> = {
  Tab: { label: 'Tab' },
  Enter: { label: 'Enter' },
  Backspace: { label: 'Delete' },
  ArrowUp: 'arrowUp',
  ArrowDown: 'arrowDown',
  BracketLeft: 'bracketLeft',
  BracketRight: 'bracketRight',
  Backslash: { label: '\\' },
};

/** The chips a pressed combination should be shown as: control, option, shift, command, then the key. */
function chipsFor(p: Press): readonly ShortcutKeySpec[] {
  const main = KEY_CHIP[p.code] ?? { label: p.code.replace(/^Key/, '') };
  return [...(p.ctrl ? ['control' as const] : []), ...(p.alt ? ['option' as const] : []), ...(p.shift ? ['shift' as const] : []), ...(p.meta ? ['command' as const] : []), main];
}

const KEY_ROWS = MARKDOWN_SHORTCUT_GROUPS.flatMap((group) => group.rows).filter((row) => row.keys);
const TRIGGER_ROWS = MARKDOWN_SHORTCUT_GROUPS.flatMap((group) => group.rows).filter((row) => row.trigger !== undefined);

/** What each key does, on a document built for it. */
const BEHAVIOR: Record<string, () => void> = {
  bold: () => {
    const view = mount('word', 0, 4);
    press(view, PRESSES.bold!);
    expect(view.state.doc.toString()).toBe('**word**');
  },
  italic: () => {
    const view = mount('word', 0, 4);
    press(view, PRESSES.italic!);
    expect(view.state.doc.toString()).toBe('*word*');
  },
  underline: () => {
    // On the real editor, which also installs historyKeymap, where Mod-u is `undoSelection`: underline must win.
    const view = mount('word', 0, 4);
    press(view, PRESSES.underline!);
    expect(view.state.doc.toString()).toBe('<u>word</u>');
    press(view, PRESSES.underline!);
    expect(view.state.doc.toString()).toBe('word');
  },
  'inline-code': () => {
    const view = mount('word', 0, 4);
    press(view, PRESSES['inline-code']!);
    expect(view.state.doc.toString()).toBe('`word`');
  },
  indent: () => {
    const view = mount('- a\n- b');
    press(view, PRESSES.indent!);
    expect(view.state.doc.toString()).toBe('- a\n    - b');
  },
  outdent: () => {
    const view = mount('- a\n    - b');
    press(view, PRESSES.outdent!);
    expect(view.state.doc.toString()).toBe('- a\n- b');
  },
  continue: () => {
    const list = mount('- a');
    press(list, PRESSES.continue!);
    expect(list.state.doc.toString()).toBe('- a\n- ');
    const quote = mount('> q');
    press(quote, PRESSES.continue!);
    expect(quote.state.doc.toString()).toBe('> q\n> ');
  },
  exit: () => {
    const list = mount('- a\n- ');
    press(list, PRESSES.exit!);
    expect(list.state.doc.toString()).toBe('- a\n');
    const quote = mount('> q\n> ');
    press(quote, PRESSES.exit!);
    expect(quote.state.doc.toString()).toBe('> q\n');
  },
  'line-break': () => {
    const view = mount('abc');
    press(view, PRESSES['line-break']!);
    expect(view.state.doc.toString()).toBe('abc\\\n');
  },
  'remove-marker': () => {
    // At the start of a non-empty item: the list is undone. An empty item loses its marker. A task loses its checkbox.
    const item = mount('- a', 2);
    press(item, PRESSES['remove-marker']!);
    expect(item.state.doc.toString()).toBe('-a');
    const empty = mount('- ');
    press(empty, PRESSES['remove-marker']!);
    expect(empty.state.doc.toString()).toBe('');
    const task = mount('- [ ] t', 6);
    press(task, PRESSES['remove-marker']!);
    expect(task.state.doc.toString()).toBe('- t');
  },
  'move-line-up': () => {
    const view = mount('a\nb');
    press(view, PRESSES['move-line-up']!);
    expect(view.state.doc.toString()).toBe('b\na');
  },
  'move-line-down': () => {
    const view = mount('a\nb', 0);
    press(view, PRESSES['move-line-down']!);
    expect(view.state.doc.toString()).toBe('b\na');
  },
  'duplicate-line-above': () => {
    const view = mount('a\nb');
    press(view, PRESSES['duplicate-line-above']!);
    expect(view.state.doc.toString()).toBe('a\nb\nb');
  },
  'duplicate-line-below': () => {
    const view = mount('a\nb', 0);
    press(view, PRESSES['duplicate-line-below']!);
    expect(view.state.doc.toString()).toBe('a\na\nb');
  },
  'delete-line': () => {
    const view = mount('a\nb\nc', 3);
    press(view, PRESSES['delete-line']!);
    expect(view.state.doc.toString()).toBe('a\nc');
  },
  'insert-line-below': () => {
    const view = mount('a\nb', 1);
    press(view, PRESSES['insert-line-below']!);
    expect(view.state.doc.toString()).toBe('a\n\nb');
  },
  fold: () => {
    const view = mount('- a\n    - b\n- c', 1);
    press(view, PRESSES.fold!);
    expect(foldedRanges(view.state).size).toBe(1);
    expect(view.state.doc.toString()).toBe('- a\n    - b\n- c');
  },
  unfold: () => {
    const view = mount('- a\n    - b\n- c', 1);
    press(view, PRESSES.fold!);
    expect(foldedRanges(view.state).size).toBe(1);
    press(view, PRESSES.unfold!);
    expect(foldedRanges(view.state).size).toBe(0);
  },
  'fold-all': () => {
    const view = mount('- a\n    - b\n- c\n    - d', 1);
    press(view, PRESSES['fold-all']!);
    expect(foldedRanges(view.state).size).toBeGreaterThan(0);
  },
  'unfold-all': () => {
    const view = mount('- a\n    - b\n- c\n    - d', 1);
    press(view, PRESSES['fold-all']!);
    press(view, PRESSES['unfold-all']!);
    expect(foldedRanges(view.state).size).toBe(0);
  },
  'add-cursor-above': () => {
    const view = mount('abc\ndef', 5);
    press(view, PRESSES['add-cursor-above']!);
    expect(view.state.selection.ranges).toHaveLength(2);
  },
  'add-cursor-below': () => {
    const view = mount('abc\ndef', 1);
    press(view, PRESSES['add-cursor-below']!);
    expect(view.state.selection.ranges).toHaveLength(2);
  },
  'matching-bracket': () => {
    const view = mount('(a [b] c)', 0);
    press(view, PRESSES['matching-bracket']!);
    // Moves the cursor to the bracket that matches the one it is at; the text is untouched.
    expect(view.state.selection.main.head).not.toBe(0);
    expect(view.state.selection.main.empty).toBe(true);
    expect(view.state.doc.toString()).toBe('(a [b] c)');
  },
};

describe('the Markdown guide dialog’s keys', () => {
  it('has a press and a behavior check for every row that lists keys, and nothing extra', () => {
    const ids = KEY_ROWS.map((row) => row.id).sort();
    expect(Object.keys(PRESSES).sort()).toEqual(ids);
    expect(Object.keys(BEHAVIOR).sort()).toEqual(ids);
  });

  it.each(KEY_ROWS.map((row) => [row.id, row] as const))('%s: the chips are the keys that were pressed', (id, row) => {
    expect(row.keys).toEqual(chipsFor(PRESSES[id]!));
  });

  it.each(KEY_ROWS.map((row) => [row.id] as const))('%s: pressing it does what the row says', (id) => {
    BEHAVIOR[id]!();
  });
});

/** What a typed trigger becomes: the source to type, and the node the editor's grammar makes of it. */
const SYNTAX: Record<string, { readonly source: string; readonly node: string }> = {
  'inline-code-typed': { source: '`text`', node: 'InlineCode' },
  highlight: { source: '==text==', node: 'Highlight' },
  strikethrough: { source: '~~text~~', node: 'Strikethrough' },
  'task-list': { source: '- [ ] t', node: 'TaskMarker' },
  'wiki-link': { source: '[[Page]]', node: 'WikiLink' },
  'wiki-link-alias': { source: '[[Page|alias]]', node: 'WikiLink' },
  'wiki-link-heading': { source: '[[Page#Heading]]', node: 'WikiLink' },
  embed: { source: '![[file.png]]', node: 'Embed' },
  divider: { source: 'a\n\n---', node: 'HorizontalRule' },
  'divider-wavy': { source: 'a\n\n~---~', node: 'WavyHorizontalRule' },
  'divider-double': { source: 'a\n\n=---=', node: 'DoubleHorizontalRule' },
  'divider-dotted': { source: 'a\n\n.---.', node: 'DottedHorizontalRule' },
  'divider-labeled': { source: 'a\n\n---Title---', node: 'LabeledHorizontalRule' },
};

/** The nodes the grammar makes of a document. */
async function nodesOf(doc: string): Promise<string[]> {
  const { EditorState } = await import('@codemirror/state');
  const { ensureSyntaxTree } = await import('@codemirror/language');
  const { markdownLanguageExtension } = await import('@features/markdown/editor/codemirror/markdownLanguage');
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  const names: string[] = [];
  ensureSyntaxTree(state, doc.length, 5000)?.iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

describe('the Markdown guide dialog’s typing triggers', () => {
  it('lists exactly the triggers checked below', () => {
    const syntax = Object.keys(SYNTAX);
    const rest = ['code-block', 'quick-task', 'suggest-tags', 'suggest-dates'];
    expect(TRIGGER_ROWS.map((row) => row.id).sort()).toEqual([...syntax, ...rest].sort());
  });

  it.each(Object.entries(SYNTAX))('%s: typing it makes the node the row promises', async (id, { source, node }) => {
    const row = TRIGGER_ROWS.find((r) => r.id === id)!;
    // The row shows the text that is typed (the example's text part may differ: "Title" and "alias" are placeholders).
    expect(row.trigger).toBeTruthy();
    expect(await nodesOf(source)).toContain(node);
  });

  it('a divider straight under a paragraph is a heading, which is why the row says to leave a blank line', async () => {
    expect(await nodesOf('para\n---')).toContain('SetextHeading2');
    expect(await nodesOf('para\n\n---')).toContain('HorizontalRule');
  });

  it('the wavy, double and dotted dividers take a label too', async () => {
    expect(await nodesOf('a\n\n~---Title---~')).toContain('WavyHorizontalRule');
    expect(await nodesOf('a\n\n=---Title---=')).toContain('DoubleHorizontalRule');
    expect(await nodesOf('a\n\n.---Title---.')).toContain('DottedHorizontalRule');
  });

  it('[] and a space at the start of a line becomes an unchecked task', () => {
    const view = mount('[]');
    const event = press(view, { key: ' ', code: 'Space', keyCode: 32 });
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] ');
    expect(view.state.selection.main.head).toBe(6);
  });

  it('typing three backticks adds the closing fence', () => {
    const view = mount('``');
    // The editor's own input handlers, in order, for one typed character (what the browser's input event runs).
    const handlers = view.state.facet(EditorView.inputHandler);
    const handled = handlers.some((handler) => handler(view, 2, 2, '`', () => view.state.update({ changes: { from: 2, insert: '`' } })));
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('```\n```');
    expect(view.state.selection.main.head).toBe(3);
  });

  it('[[ starts note suggestions and ![[ embed suggestions', async () => {
    const { WIKILINK_TRIGGER_PATTERN } = await import('@features/markdown/editor/codemirror/wikilink/wikiLinkCompletionSource');
    const { EMBED_TRIGGER_PATTERN } = await import('@features/markdown/editor/codemirror/embed/embedCompletionSource');
    expect(WIKILINK_TRIGGER_PATTERN.test('see [[No')).toBe(true);
    expect(WIKILINK_TRIGGER_PATTERN.test('see [No')).toBe(false);
    expect(EMBED_TRIGGER_PATTERN.test('see ![[No')).toBe(true);
  });

  it('# starts tag suggestions, once there are tags to suggest (a bare # in a vault with no tags offers nothing)', async () => {
    const { CompletionContext } = await import('@codemirror/autocomplete');
    const { EditorState } = await import('@codemirror/state');
    const { tagCompletionSource } = await import('@features/markdown/editor/codemirror/tag/tagCompletionSource');
    const { markdownLanguageExtension } = await import('@features/markdown/editor/codemirror/markdownLanguage');
    const state = EditorState.create({ doc: 'a #', extensions: [markdownLanguageExtension()] });
    const withTags = await tagCompletionSource(() => () => ['design', 'work'])(new CompletionContext(state, 3, false));
    expect(withTags?.options.map((option) => option.label)).toEqual(['#design', '#work']);
    const noTags = await tagCompletionSource(() => () => [])(new CompletionContext(state, 3, false));
    expect(noTags).toBeNull();
  });

  it('@ starts date suggestions', async () => {
    const { CompletionContext } = await import('@codemirror/autocomplete');
    const { EditorState } = await import('@codemirror/state');
    const { dateCompletionSource } = await import('@features/markdown/editor/codemirror/date/dateCompletionSource');
    const { markdownLanguageExtension } = await import('@features/markdown/editor/codemirror/markdownLanguage');
    const state = EditorState.create({ doc: 'due @', extensions: [markdownLanguageExtension()] });
    const dates = await dateCompletionSource()(new CompletionContext(state, 5, false));
    expect(dates?.options.length).toBeGreaterThan(0);
  });
});
