// @vitest-environment jsdom
import { insertNewlineAndIndent } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeEnableEmojiLists } from '@shared/helpers/enableEmojiListsPreference';
import { sharedMarkdownParser } from '../../../render/sharedMarkdownParser';
import { deleteBulletMarkerSeparator, markdownEnterCommand } from '../enter/markdownEnterKeymap';
import { markdownIndentMore } from '../indent/markdownIndentKeymap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { listLineDecoration } from './listLineDecoration';
import { listMarkerDecoration } from './listMarkerDecoration';

beforeEach(() => localStorage.clear());

const mounted: EditorView[] = [];
afterEach(() => {
  for (const view of mounted.splice(0)) {
    view.destroy();
  }
});

function names(tree: { iterate(spec: { enter(node: { name: string }): void }): void }): string[] {
  const out: string[] = [];
  tree.iterate({ enter: (node) => void out.push(node.name) });
  return out;
}

function mount(doc: string, emojiLists?: boolean): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdownLanguageExtension(emojiLists === undefined ? {} : { emojiLists }),
        listMarkerDecoration(),
        listLineDecoration(),
      ],
    }),
    parent,
  });
  ensureSyntaxTree(view.state, view.state.doc.length, 5000);
  view.dispatch({});
  mounted.push(view);
  return view;
}

const SOURCE = '🚀 Launch plan\n🎨 Design review\n🧪 Testing';

describe('Enable emoji lists — the grammar', () => {
  it('on (default): emoji lines parse as one EmojiList with an EmojiListMark per item', () => {
    const view = mount(SOURCE);
    const found = names(syntaxTree(view.state));

    expect(found.filter((n) => n === 'EmojiList')).toHaveLength(1);
    expect(found.filter((n) => n === 'EmojiListMark')).toHaveLength(3);
  });

  it('off: no EmojiList/EmojiListMark/ListItem exists — the lines are one Paragraph', () => {
    writeEnableEmojiLists(false);
    const view = mount(SOURCE);
    const found = names(syntaxTree(view.state));

    expect(found).not.toContain('EmojiList');
    expect(found).not.toContain('EmojiListMark');
    expect(found).not.toContain('ListItem');
    expect(found.filter((n) => n === 'Paragraph')).toHaveLength(1);
  });

  it('an explicit option wins over the saved setting (an editor passes its own value)', () => {
    writeEnableEmojiLists(false);

    expect(names(syntaxTree(mount(SOURCE, true).state))).toContain('EmojiList');
    writeEnableEmojiLists(true);
    expect(names(syntaxTree(mount(SOURCE, false).state))).not.toContain('EmojiList');
  });

  it('the read-only parser follows the same setting, per call', () => {
    expect(names(sharedMarkdownParser.parse(SOURCE))).toContain('EmojiList');

    writeEnableEmojiLists(false);
    expect(names(sharedMarkdownParser.parse(SOURCE))).not.toContain('EmojiList');

    writeEnableEmojiLists(true);
    expect(names(sharedMarkdownParser.parse(SOURCE))).toContain('EmojiList');
  });

  it('turning it off never changes anything else in the grammar: bullet, ordered and task lists parse as before', () => {
    const doc = '- a\n\n1. b\n\n- [ ] c';
    const on = names(syntaxTree(mount(doc).state));
    writeEnableEmojiLists(false);
    const off = names(syntaxTree(mount(doc).state));

    expect(off).toEqual(on);
  });
});

describe('Enable emoji lists off — the editor behaves as for a paragraph', () => {
  beforeEach(() => writeEnableEmojiLists(false));

  it('draws no emoji marker, no list indent and no marker classes; the text is unchanged', () => {
    const view = mount(SOURCE);

    expect(view.dom.querySelectorAll('.cm-emoji-list-marker, .cm-list-marker, .cm-list-line')).toHaveLength(0);
    expect(view.dom.textContent).toBe(SOURCE.replace(/\n/g, ''));
    expect(view.state.doc.toString()).toBe(SOURCE);
  });

  it('turning it back on draws the list for the same document', () => {
    writeEnableEmojiLists(true);
    const view = mount(SOURCE);

    expect(view.dom.querySelectorAll('.cm-emoji-list-marker')).toHaveLength(3);
  });

  function press(command: (t: { state: EditorState; dispatch: (tr: Transaction) => void }) => boolean, doc: string, pos: number) {
    let state = EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [markdownLanguageExtension()],
    });
    ensureSyntaxTree(state, doc.length, 5000);
    const target = {
      state,
      dispatch: (tr: Transaction) => {
        state = tr.state;
      },
    };
    const handled = command(target);
    return { handled, doc: state.doc.toString(), head: state.selection.main.head };
  }

  it('Enter at the end of an emoji line is the plain newline: no new emoji marker', () => {
    const doc = '🍒 First';
    const first = press(markdownEnterCommand, doc, doc.length);
    expect(first.handled).toBe(false);

    const second = press(insertNewlineAndIndent, doc, doc.length);
    expect(second.doc).toBe('🍒 First\n');
  });

  it('Enter on an "empty" emoji line does not exit a list and Backspace does not remove a marker', () => {
    const doc = '🍒 First\n🍒 ';
    expect(press(markdownEnterCommand, doc, doc.length).handled).toBe(false);
    expect(press(deleteBulletMarkerSeparator, doc, doc.length).handled).toBe(false);
    expect(press(deleteBulletMarkerSeparator, '🍒 Text', 3).handled).toBe(false);
  });

  it('Tab and Shift+Tab keep their source-local four-space unit', () => {
    const result = press(markdownIndentMore, '🍒 Item', 4);
    expect(result.doc).toBe('    🍒 Item');
  });
});

describe('Preserve bullet style — the editor marker DOM and CSS', () => {
  const css = readFileSync(resolve(__dirname, '../../MarkdownEditor.css'), 'utf8');

  it('keeps each source marker as real text in the marker box, glyph chosen by marker, in either state', () => {
    const view = mount('- dash\n\n+ plus\n\n* star');
    const marks = [...view.dom.querySelectorAll<HTMLElement>('.cm-bullet-list-marker')];

    expect(marks.map((m) => m.textContent)).toEqual(['- ', '+ ', '* ']);
    expect(marks.map((m) => m.getAttribute('data-marker-glyph'))).toEqual(['-', '+', '•']);
    expect(view.state.doc.toString()).toBe('- dash\n\n+ plus\n\n* star');
  });

  it('the dot override applies only in dot mode, to - and + only, and paints the dot rule\'s own weight and offsets', () => {
    const rule = /:root\[data-markdown-bullet-style='dot'\] \.cm-editor \.cm-bullet-list-marker--dash::before,\s*:root\[data-markdown-bullet-style='dot'\] \.cm-editor \.cm-bullet-list-marker--plus::before \{([^}]*)\}/.exec(
      css
    )?.[1];

    expect(rule).toBeDefined();
    expect(rule).toContain("content: '•'");
    const dot = /\.cm-editor \.cm-bullet-list-marker--dot::before \{([^}]*)\}/.exec(css)![1]!;
    for (const declaration of dot.split(';').map((d) => d.trim()).filter(Boolean)) {
      expect(rule).toContain(declaration);
    }
    expect(css).not.toMatch(/data-markdown-bullet-style='dot'\][^{]*cm-bullet-list-marker--dot/);
  });

  it('does not reach ordered, task or emoji markers', () => {
    const dotRules = css.match(/:root\[data-markdown-bullet-style='dot'\][^{]*\{/g) ?? [];

    expect(dotRules.join('')).not.toMatch(/ordered|task|emoji/);
  });
});
