// @vitest-environment jsdom
import { deleteMarkupBackward } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { deleteBulletMarkerSeparator, markdownEnterCommand } from '../enter/markdownEnterKeymap';
import { markdownIndentLess, markdownIndentMore } from '../indent/markdownIndentKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { listLineDecoration } from './listLineDecoration';
import { listMarkerDecoration } from './listMarkerDecoration';

/**
 * Emoji lists share the one list engine (`listMarkerDecoration.ts`,
 * `listLineDecoration.ts`, `markdownEnterKeymap.ts`, `markdownIndentContext.ts`);
 * these tests drive that shared code with emoji items. Fixture convention as
 * in `markdownBulletBackspace.test.ts`: `|` is the cursor (or `[`/`]` the
 * selection), `_` a space that would otherwise be invisible at a line end.
 */

function parse(source: string): EditorState {
  const doc = source.replace(/_/g, ' ');
  const open = doc.indexOf('[');
  const close = doc.indexOf(']');
  let text: string;
  let selection: EditorSelection['main'] | ReturnType<typeof EditorSelection.cursor>;
  if (open >= 0 && close > open) {
    text = doc.slice(0, open) + doc.slice(open + 1, close) + doc.slice(close + 1);
    selection = EditorSelection.range(open, close - 1);
  } else {
    const pos = doc.indexOf('|');
    text = doc.slice(0, pos) + doc.slice(pos + 1);
    selection = EditorSelection.cursor(pos);
  }
  const state = EditorState.create({ doc: text, selection, extensions: [markdownLanguageExtension()] });
  ensureSyntaxTree(state, text.length, 5000);
  return state;
}

function render(state: EditorState): string {
  const { from, to, empty } = state.selection.main;
  const text = state.doc.toString();
  const shown = empty
    ? text.slice(0, from) + '|' + text.slice(from)
    : text.slice(0, from) + '[' + text.slice(from, to) + ']' + text.slice(to);
  return shown.replace(/ (?=\n|$)/g, '_');
}

function run(command: (target: { state: EditorState; dispatch: (tr: Transaction) => void }) => boolean, state: EditorState) {
  let next = state;
  const handled = command({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  if (next !== state) {
    ensureSyntaxTree(next, next.doc.length, 5000);
  }
  return { handled, state: next };
}

const enter = (source: string) => render(run(markdownEnterCommand, parse(source)).state);

const backspace = (source: string) => {
  const state = parse(source);
  const clutter = run(deleteBulletMarkerSeparator, state);
  if (clutter.handled) {
    return render(clutter.state);
  }
  return render(run(deleteMarkupBackward, state).state);
};

function treeNames(state: EditorState): string[] {
  const names: string[] = [];
  syntaxTree(state).iterate({ enter: (node) => void names.push(node.name) });
  return names;
}

describe('emoji list — Enter', () => {
  it('at the end of an item, starts a new item with the same emoji', () => {
    expect(enter('🍒 First|')).toBe('🍒 First\n🍒 |');
  });

  it('repeats the marker of the item it is pressed in, not the first item\'s', () => {
    expect(enter('🍎 One\n🍊 Two|')).toBe('🍎 One\n🍊 Two\n🍊 |');
  });

  it('reuses skin-tone and ZWJ emoji markers whole', () => {
    expect(enter('👍🏽 Done|')).toBe('👍🏽 Done\n👍🏽 |');
    expect(enter('👩‍💻 Dev|')).toBe('👩‍💻 Dev\n👩‍💻 |');
    expect(enter('❤️ Love|')).toBe('❤️ Love\n❤️ |');
  });

  it('three presses build a three-item list', () => {
    let state = parse('🍒 First|');
    state = run(markdownEnterCommand, state).state;
    state = run((t) => (t.dispatch(t.state.update(t.state.replaceSelection('Second'))), true), state).state;
    state = run(markdownEnterCommand, state).state;
    state = run((t) => (t.dispatch(t.state.update(t.state.replaceSelection('Third'))), true), state).state;
    expect(state.doc.toString()).toBe('🍒 First\n🍒 Second\n🍒 Third');
    expect(treeNames(state).filter((n) => n === 'EmojiListMark')).toHaveLength(3);
    expect(treeNames(state).filter((n) => n === 'EmojiList')).toHaveLength(1);
  });

  it('in the middle of an item, splits the text and keeps the structure', () => {
    const result = run(markdownEnterCommand, parse('🍒 Fi|rst'));
    expect(render(result.state)).toBe('🍒 Fi\n🍒 |rst');
    expect(treeNames(result.state).filter((n) => n === 'EmojiList')).toHaveLength(1);
    expect(treeNames(result.state).filter((n) => n === 'EmojiListMark')).toHaveLength(2);
  });

  it('at content-start, leaves an empty item above the moved text, cursor before the text', () => {
    expect(enter('🍒 |Text')).toBe('🍒_\n🍒 |Text');
  });

  it('a cursor inside a multi-space separator behaves as content-start', () => {
    expect(enter('🍒 |  Text')).toBe('🍒  _\n🍒   |Text');
  });

  it('on an empty item, exits the list into a plain paragraph', () => {
    const result = run(markdownEnterCommand, parse('🍒 First\n🍒 |'));
    expect(render(result.state)).toBe('🍒 First\n|');
    expect(treeNames(result.state).filter((n) => n === 'EmojiListMark')).toHaveLength(1);
  });

  it('on a lone empty item, leaves an empty line, never another item', () => {
    const result = run(markdownEnterCommand, parse('🍒 |'));
    expect(render(result.state)).toBe('|');
    expect(treeNames(result.state)).not.toContain('EmojiList');
  });

  it('keeps nesting: a nested item continues at its own indentation', () => {
    expect(enter('- Parent\n    🍒 Child|')).toBe('- Parent\n    🍒 Child\n    🍒 |');
  });

  it('an empty nested item exits to a plain empty line', () => {
    expect(enter('- Parent\n    🍒 |')).toBe('- Parent\n|');
  });

  it('keeps a blockquote prefix', () => {
    expect(enter('> 🍒 Quoted|')).toBe('> 🍒 Quoted\n> 🍒 |');
    expect(enter('> 🍒 |')).toBe('> |');
  });

  it('never copies an outer bullet marker that shares the line', () => {
    const result = enter('- 🍒 Text|');
    expect(result.match(/- /g)).toHaveLength(1);
    expect(result.endsWith('🍒 |')).toBe(true);
  });

  it('does not intercept Enter in front of the marker', () => {
    expect(run(markdownEnterCommand, parse('|🍒 Text')).handled).toBe(false);
  });

  it('leaves bullet and ordered Enter untouched', () => {
    expect(enter('- Item|')).toBe('- Item\n- |');
    expect(enter('1. Item|')).toBe('1. Item\n2. |');
  });
});

describe('emoji list — Backspace', () => {
  it('at content-start removes only the separator, keeping the emoji', () => {
    expect(backspace('🍒 |Text')).toBe('🍒|Text');
  });

  it('on an empty item removes the whole marker', () => {
    expect(backspace('🍒 |')).toBe('|');
    expect(backspace('🍒 One\n🍒 |')).toBe('🍒 One\n|');
  });

  it('on an empty nested item removes the marker and keeps the indentation', () => {
    expect(backspace('🍒 A\n    🍒 |')).toBe('🍒 A\n    |');
  });

  it('after a nested non-empty marker removes only the separator', () => {
    expect(backspace('🍒 A\n    🍒 |B')).toBe('🍒 A\n    🍒|B');
  });

  it('removes a skin-tone / ZWJ marker\'s separator without touching the sequence', () => {
    expect(backspace('👩‍💻 |Dev')).toBe('👩‍💻|Dev');
    expect(backspace('👍🏽 |Ok')).toBe('👍🏽|Ok');
  });

  it('never merges or removes neighbouring items', () => {
    const next = run(deleteBulletMarkerSeparator, parse('🍎 A\n🍊 |B')).state;
    expect(next.doc.toString()).toBe('🍎 A\n🍊B');
  });

  it('at the start of a continuation paragraph keeps the emoji and the other items', () => {
    const source = '🍒 A\n\n   |B\n🍒 C';
    const state = parse(source);
    expect(run(deleteBulletMarkerSeparator, state).handled).toBe(false);
    const after = run(deleteMarkupBackward, state).state.doc.toString();
    expect(after).toContain('🍒 A');
    expect(after).toContain('🍒 C');
    expect(after).toContain('B');
  });

  it('leaves bullet Backspace untouched', () => {
    expect(backspace('- |Text')).toBe('-|Text');
    expect(backspace('- |')).toBe('|');
  });
});

describe('emoji list — Tab and Shift+Tab (the existing source-local contract)', () => {
  it('Tab adds one four-space unit and keeps the caret on its content', () => {
    const { state } = run(markdownIndentMore, parse('🍒 Ite|m'));
    expect(render(state)).toBe('    🍒 Ite|m');
  });

  it('Shift+Tab removes one four-space unit', () => {
    const { state } = run(markdownIndentLess, parse('        🍒 Ite|m'));
    expect(render(state)).toBe('    🍒 Ite|m');
  });

  it('Shift+Tab at column 0 is a no-op', () => {
    const { state } = run(markdownIndentLess, parse('🍒 Ite|m'));
    expect(render(state)).toBe('🍒 Ite|m');
  });

  it('indents every line of a multi-line selection and keeps the selection', () => {
    const { state } = run(markdownIndentMore, parse('🍒 [A\n🍊 B\n🍌 C]'));
    expect(state.doc.toString()).toBe('    🍒 A\n    🍊 B\n    🍌 C');
    expect(state.sliceDoc(state.selection.main.from, state.selection.main.to)).toBe('A\n    🍊 B\n    🍌 C');
  });

  it('a mixed selection of bullet, ordered and emoji lines gets the same unit on each', () => {
    const { state } = run(markdownIndentMore, parse('[- a\n1. b\n🍒 c]'));
    expect(state.doc.toString()).toBe('    - a\n    1. b\n    🍒 c');
  });
});

describe('emoji list — nesting and mixed lists', () => {
  const names = (source: string) => treeNames(parse(source.replace('|', '')));

  it('an emoji list inside a bullet list', () => {
    expect(names('- Parent\n    🍒 Child')).toEqual(
      expect.arrayContaining(['BulletList', 'EmojiList', 'EmojiListMark'])
    );
  });

  it('a bullet list inside an emoji list', () => {
    const state = parse('🍒 Parent\n    - Child|');
    const emojiList = syntaxTree(state).topNode.getChild('EmojiList');
    expect(emojiList?.getChild('ListItem')?.getChild('BulletList')).not.toBeNull();
  });

  it('nested emoji lists', () => {
    const state = parse('🍒 Parent\n    🍊 Child|');
    const outer = syntaxTree(state).topNode.getChild('EmojiList');
    expect(outer?.getChild('ListItem')?.getChild('EmojiList')).not.toBeNull();
  });

  it('numbered, bullet and emoji items nest together', () => {
    expect(names('1. one\n    - two\n        🍒 three')).toEqual(
      expect.arrayContaining(['OrderedList', 'BulletList', 'EmojiList'])
    );
  });

  it('a continuation paragraph stays inside the emoji item', () => {
    const state = parse('🍒 One\n\n   More text|\n🍊 Two');
    const emojiList = syntaxTree(state).topNode.getChild('EmojiList');
    const items = emojiList?.getChildren('ListItem') ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]?.getChildren('Paragraph')).toHaveLength(2);
  });
});

describe('emoji list — Shift+Enter continuation', () => {
  it('indents the continuation line to the item\'s content column', async () => {
    const { insertSoftLineBreak } = await import('../enter/markdownEnterKeymap');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc: '🍒 Item',
      selection: EditorSelection.cursor(7),
      extensions: [markdownLanguageExtension()],
    });
    const view = new EditorView({ state, parent });
    ensureSyntaxTree(view.state, view.state.doc.length, 5000);
    insertSoftLineBreak(view);
    // The emoji is two UTF-16 units and the separator one, the parser's own content column.
    expect(view.state.doc.toString()).toBe('🍒 Item\\\n   ');
    view.destroy();
  });
});

const mounted: EditorView[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) {
    view.destroy();
  }
});

function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), listMarkerDecoration(), listLineDecoration()],
    }),
    parent,
  });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  view.dispatch({});
  mounted.push(view);
  return view;
}

const lineEls = (view: EditorView) => Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
const indentPx = (line: HTMLElement) => parseFloat(line.style.getPropertyValue('--list-indent-px')) || 0;

describe('emoji list — editor DOM', () => {
  it('wraps the emoji and its separator in the shared marker classes without altering the text', () => {
    const view = mount('🍎 Apple');
    const marks = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-emoji-list-marker'));
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('🍎 ');
    for (const cls of ['cm-marker', 'cm-list-marker', 'cm-emoji-list-marker']) {
      expect(marks[0]!.classList.contains(cls)).toBe(true);
    }
    expect(view.dom.textContent).toBe('🍎 Apple');
  });

  it('marks every item, each with its own emoji', () => {
    const view = mount('🍎 Apple\n🍊 Orange\n👩‍💻 Dev');
    const marks = Array.from(view.dom.querySelectorAll('.cm-emoji-list-marker')).map((el) => el.textContent);
    expect(marks).toEqual(['🍎 ', '🍊 ', '👩‍💻 ']);
  });

  it('does not mark bullets, ordered items or plain emoji prose', () => {
    const view = mount('- Apple\n\n1. Orange\n\n🍎Glued');
    expect(view.dom.querySelectorAll('.cm-emoji-list-marker')).toHaveLength(0);
  });

  it('renders one marker for a same-line chain, the outermost', () => {
    const view = mount('- 🍎 Apple');
    expect(view.dom.querySelectorAll('.cm-emoji-list-marker')).toHaveLength(0);
    expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(1);
    const reversed = mount('🍎 - Apple');
    expect(reversed.dom.querySelectorAll('.cm-emoji-list-marker')).toHaveLength(1);
    expect(reversed.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(0);
  });

  it('reserves the same hanging-indent column for every emoji width, equal to a bullet\'s', () => {
    const view = mount('- bullet\n\n🍎 narrow\n\n👩‍💻 zwj sequence\n\n👍🏽 skin tone\n\n❤️ vs16');
    const px = lineEls(view)
      .filter((line) => line.className.includes('cm-list-line'))
      .map(indentPx);
    expect(px).toHaveLength(5);
    expect(new Set(px).size).toBe(1);
    expect(px[0]).toBeGreaterThan(0);
  });

  it('hangs a nested emoji item by its own indentation plus its marker column', () => {
    const view = mount('- Parent\n    🍒 Child');
    const [parent, child] = lineEls(view).filter((line) => line.className.includes('cm-list-line'));
    expect(indentPx(child!)).toBeGreaterThan(indentPx(parent!));
  });

  it('gives an indented continuation line the same column as its item\'s first line', () => {
    const view = mount('🍒 One\n\n   More text');
    const hung = lineEls(view).filter((line) => line.className.includes('cm-list-line'));
    expect(hung).toHaveLength(2);
    expect(indentPx(hung[1]!)).toBe(indentPx(hung[0]!));
  });

  it('does not hang an unindented lazy line that merely follows an emoji item', () => {
    const view = mount('🍒 One\nlazy');
    const hung = lineEls(view).filter((line) => line.className.includes('cm-list-line'));
    expect(hung).toHaveLength(1);
  });
});

describe('emoji list — marker CSS contract', () => {
  const css = readFileSync(resolve(__dirname, '../../MarkdownEditor.css'), 'utf8');
  const rule = /\.cm-editor \.cm-emoji-list-marker \{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('uses the shared fixed marker width token, like the bullet marker', () => {
    expect(rule).toMatch(/\bwidth:\s*var\(--md-list-marker-width\)/);
  });

  it('never wraps its emoji and separator onto two lines (which dropped the text below the emoji)', () => {
    expect(rule).toMatch(/white-space:\s*pre;/);
  });
});
