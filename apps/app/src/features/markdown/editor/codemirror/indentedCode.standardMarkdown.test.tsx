// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { parser as commonMarkParser } from '@lezer/markdown';

import { sharedMarkdownParser } from '../../render/sharedMarkdownParser';
import { renderMarkdownBlocks } from '../../render/renderMarkdownBlocks';
import { buildEditorExtensions, type BuildEditorExtensionsOptions } from './buildEditorExtensions';
import { createEditorView } from './createEditorView';

/**
 * Indented code is standard CommonMark in Clutter: 4+ leading columns at the start of a block are a code block (so a
 * `-` inside one stays code), lists nest by the usual rule, and an indented line right after a paragraph is that
 * paragraph's lazy continuation. The grammar is compared against the bare `@lezer/markdown` CommonMark parser, the
 * read-only renderer against the editor's parse, and Enter, Backspace and Tab are driven through the real editor.
 * `|` marks the caret.
 */
type Node = { name: string; firstChild: Node | null; nextSibling: Node | null };

const SHAPE_NAMES: Record<string, string> = {
  BulletList: 'ul',
  OrderedList: 'ol',
  ListItem: 'li',
  Paragraph: 'p',
  Task: 'p', // a task item's text is a `Task` node here, a `Paragraph` in bare CommonMark
  CodeBlock: 'code',
  FencedCode: 'fence',
  Blockquote: 'quote',
};

/** The block structure as a nested string, from CommonMark's own block nodes only (extension nodes are ignored). */
function shape(node: Node | null): string {
  const parts: string[] = [];
  for (let child = node?.firstChild ?? null; child; child = child.nextSibling) {
    const name = SHAPE_NAMES[child.name];
    if (name) {
      parts.push(`${name}(${shape(child)})`);
    } else {
      const inner = shape(child);
      if (inner) {
        parts.push(inner);
      }
    }
  }
  return parts.join(' ');
}

const CLUTTER_SHAPE = (doc: string) => shape(sharedMarkdownParser.parse(doc).topNode as unknown as Node);
const COMMONMARK_SHAPE = (doc: string) => shape(commonMarkParser.parse(doc).topNode as unknown as Node);

describe('the grammar agrees with standard CommonMark on indentation', () => {
  it.each([
    ['four-space indented code after a blank line', 'para\n\n    code'],
    ['eight-space indented code after a blank line', 'para\n\n        code'],
    ['indented code at the start of a document', '    code at the start'],
    ['a hyphen inside indented code', 'this is here\n\n        - this is a bullet'],
    ['a hyphen at four spaces after a blank line', 'this is here\n\n    - not a bullet'],
    ['an indented line right after a paragraph (lazy continuation)', 'this is here\n        - still the paragraph'],
    ['multi-line indented code', 'para\n\n    one\n    two\n\n        three'],
    ['a bullet nested four spaces under its parent', '- a\n    - b'],
    ['bullets nested three levels', '- a\n    - b\n        - c'],
    ['a nested ordered list', '1. a\n   1. b\n      1. c'],
    ['indented code inside a list item', '- a\n\n      code in the item'],
    ['code after a quote', '> quote\n\n    code'],
    ['a nested task list', '- [ ] a\n    - [x] b'],
    ['mixed nested lists', '1. a\n   - b\n     1. c'],
    ['two to three spaces is still a paragraph', 'para\n\n   three'],
  ])('%s', (_name, doc) => {
    expect(CLUTTER_SHAPE(doc)).toBe(COMMONMARK_SHAPE(doc));
  });

  it('spot checks what that shape is', () => {
    expect(CLUTTER_SHAPE('para\n\n        - not a bullet')).toBe('p() code()');
    expect(CLUTTER_SHAPE('- a\n    - b')).toBe('ul(li(p() ul(li(p()))))');
  });
});

describe('read-only rendering matches the editor parse', () => {
  const html = (doc: string) =>
    render(<div>{renderMarkdownBlocks(doc, {})}</div>)
      .container.innerHTML.replace(/ class="[^"]*"/g, '')
      .replace(/ data-[a-z-]+="[^"]*"/g, '')
      .replace(/<\/?span>/g, '');

  it('indented code renders as a code block with the source retained after the four stripped columns', () => {
    expect(html('this is here\n\n        - this is a bullet')).toBe(
      '<div><p>this is here</p><pre><code>    - this is a bullet</code></pre></div>'
    );
  });

  it('multi-line indented code keeps each line, and no list is produced', () => {
    const out = html('para\n\n    one\n    two');
    expect(out).toBe('<div><p>para</p><pre><code>one\ntwo</code></pre></div>');
    expect(out).not.toContain('<ul>');
  });

  it('a lazy continuation stays in its paragraph', () => {
    expect(html('this is here\n        - still the paragraph')).toBe(
      '<div><p>this is here- still the paragraph</p></div>'
    );
  });

  it('properly nested lists render as nested lists', () => {
    expect(html('- a\n    - b')).toBe('<div><ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul></div>');
    expect(html('1. a\n   1. b')).toContain('<ol');
  });
});

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
  const marked = source.indexOf('|');
  const doc = source.replace('|', '');
  const pos = marked < 0 ? doc.length : marked;
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' }),
  });
  view.dispatch({ selection: EditorSelection.cursor(pos) });
  ensureSyntaxTree(view.state, doc.length, 5000);
  view.dispatch({});
  mounted.push(view);
  return view;
}

function press(view: EditorView, key: 'Enter' | 'Backspace' | 'Tab', shift = false): void {
  const codes = { Enter: 13, Backspace: 8, Tab: 9 } as const;
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, code: key, keyCode: codes[key], shiftKey: shift, bubbles: true, cancelable: true })
  );
}

function shown(view: EditorView): string {
  const head = view.state.selection.main.head;
  const text = view.state.doc.toString();
  return text.slice(0, head) + '|' + text.slice(head);
}

const after = (source: string, key: 'Enter' | 'Backspace' | 'Tab', shift = false) => {
  const view = mount(source);
  press(view, key, shift);
  return shown(view);
};

describe('editor: indented code lines', () => {
  it('keeps the source exactly as typed and gives the lines no list rendering', () => {
    const source = 'this is here\n\n        - this is a bullet';
    const view = mount(source);

    expect(view.state.doc.toString()).toBe(source);
    expect(view.dom.querySelector('.cm-bullet-list-marker, .cm-list-line, .cm-list-marker')).toBeNull();
  });

  it('marks the lines of an indented code block (and only those) so they render in the monospace font', () => {
    const view = mount('para\n\n    one\n    two\n\nafter');
    const lines = [...view.contentDOM.querySelectorAll('.cm-line')].map((line) => line.classList.contains('cm-indented-code-line'));

    expect(lines).toEqual([false, false, true, true, false, false]);
  });

  it('a hyphen or `inline code` inside indented code stays literal text', () => {
    const view = mount('para\n\n    - a `b`');
    const code = view.contentDOM.querySelectorAll('.cm-line')[2]!;

    expect(code.textContent).toBe('\u00a0\u00a0\u00a0\u00a0- a `b`');
  });

  it('puts no spacer between the lines of one code block', () => {
    const view = mount('para\n\n    one\n    two\n    three');
    const kinds = [...view.contentDOM.children].map((child) => (child.classList.contains('cm-block-separator') ? 'S' : 'L'));

    // para, S, blank, S, then three code lines with nothing between them.
    expect(kinds.join('')).toBe('LSLSLLL');
  });
});

describe('Enter', () => {
  it('inside indented code keeps the indentation and adds no list marker', () => {
    expect(after('para\n\n    code|', 'Enter')).toBe('para\n\n    code\n    |');
    expect(after('para\n\n        deeper|', 'Enter')).toBe('para\n\n        deeper\n        |');
  });

  it('inside indented code under a list item keeps the code indentation, not the marker width', () => {
    expect(after('- item\n\n        code|', 'Enter')).toBe('- item\n\n        code\n        |');
  });

  it('a hyphen inside indented code is not continued as a bullet', () => {
    expect(after('this is here\n\n        - this is a bullet|', 'Enter')).toBe(
      'this is here\n\n        - this is a bullet\n        |'
    );
  });

  it('on a real list item still continues the list: bullet, ordered, task, nested', () => {
    expect(after('- a|', 'Enter')).toBe('- a\n- |');
    expect(after('1. a|', 'Enter')).toBe('1. a\n2. |');
    expect(after('- [ ] a|', 'Enter')).toBe('- [ ] a\n- [ ] |');
    expect(after('- a\n    - b|', 'Enter')).toBe('- a\n    - b\n    - |');
    expect(after('1. a\n   1. b|', 'Enter')).toBe('1. a\n   1. b\n   2. |');
  });

  it('on an empty list item still exits the list', () => {
    expect(after('- a\n- |', 'Enter')).toBe('- a\n|');
  });
});

describe('Backspace', () => {
  it('in the indentation of a code line removes one four-space unit, repeatedly', () => {
    const view = mount('para\n\n        |code');
    press(view, 'Backspace');
    expect(shown(view)).toBe('para\n\n    |code');
    press(view, 'Backspace');
    expect(shown(view)).toBe('para\n\n|code');
  });

  it('inside the text of a code line is a plain character delete, and at column 0 it does nothing special', () => {
    expect(after('para\n\n    co|de', 'Backspace')).toBe('para\n\n    c|de');
    expect(after('    |code', 'Backspace')).toBe('|code');
  });

  it('on a real list item keeps the existing marker rules', () => {
    expect(after('- |Text', 'Backspace')).toBe('-|Text');
    expect(after('- a\n- |', 'Backspace')).toBe('- a\n|');
  });
});

describe('Tab and Shift+Tab keep their four-space, source-local contract', () => {
  it('Tab adds four spaces to a code line and Shift+Tab removes them', () => {
    expect(after('para\n\n    code|', 'Tab')).toBe('para\n\n        code|');
    expect(after('para\n\n        code|', 'Tab', true)).toBe('para\n\n    code|');
  });

  it('Tab on a second list item nests it (a real nested list item)', () => {
    const view = mount('- a\n- b|');
    press(view, 'Tab');
    expect(view.state.doc.toString()).toBe('- a\n    - b');
    expect(CLUTTER_SHAPE(view.state.doc.toString())).toBe('ul(li(p() ul(li(p()))))');
  });

  it.each([
    ['bullet -', '- a', '- b'],
    ['bullet *', '* a', '* b'],
    ['bullet +', '+ a', '+ b'],
    ['ordered', '1. a', '2. b'],
    ['task', '- [ ] a', '- [ ] b'],
    ['checked task', '- [x] a', '- [x] b'],
  ])('%s: Tab on the first item does nothing, and never turns it into an indented code block', (_name, first, second) => {
    const alone = mount(`${first}|`);
    press(alone, 'Tab');
    expect(alone.state.doc.toString()).toBe(first);
    expect(CLUTTER_SHAPE(alone.state.doc.toString())).not.toContain('code');

    // Pressed repeatedly, and with items below it, the first item still never moves.
    const withSiblings = mount(`${first}|\n${second}`);
    press(withSiblings, 'Tab');
    press(withSiblings, 'Tab');
    expect(withSiblings.state.doc.toString()).toBe(`${first}\n${second}`);
  });

  it.each([
    ['bullet', '- a\n- b|', '- a\n    - b'],
    ['ordered', '1. a\n2. b|', '1. a\n    1. b'],
    ['task', '- [ ] a\n- [ ] b|', '- [ ] a\n    - [ ] b'],
  ])('%s: Tab on a later item nests it under the one above', (_name, before, after) => {
    const view = mount(before);
    press(view, 'Tab');
    expect(view.state.doc.toString()).toBe(after);
    expect(CLUTTER_SHAPE(after)).not.toContain('code');
  });

  it('a nested item that is already first in its own list has nothing deeper to nest under either', () => {
    const view = mount('- a\n    - b|');
    press(view, 'Tab');
    expect(view.state.doc.toString()).toBe('- a\n    - b');
  });

  it('selecting the whole list nests every item below the first and leaves the first alone', () => {
    const view = mount('- a\n- b\n- c');
    view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) });
    press(view, 'Tab');
    expect(view.state.doc.toString()).toBe('- a\n    - b\n    - c');
  });

  it('the five-level cap still applies where there are items to nest under', () => {
    const chain = '- a\n    - b\n        - c\n            - d\n                - e\n';
    const view = mount(`${chain}- item|`);
    for (let i = 0; i < 8; i++) {
      press(view, 'Tab');
    }
    expect(view.state.doc.toString()).toBe(`${chain}                    - item`);
  });

  it('Shift+Tab on a nested item brings it back to a sibling', () => {
    const view = mount('- a\n    - b|');
    press(view, 'Tab', true);
    expect(view.state.doc.toString()).toBe('- a\n- b');
  });
});
