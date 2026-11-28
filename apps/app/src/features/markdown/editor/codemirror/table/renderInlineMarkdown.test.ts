// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { paintInlineMarkdown, renderInlineMarkdown } from './renderInlineMarkdown';

function paint(source: string): HTMLElement {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({ state: EditorState.create({ doc: '' }), parent });
  const host = document.createElement('span');
  try {
    paintInlineMarkdown(host, source, view);
    return host;
  } finally {
    view.destroy();
    parent.remove();
  }
}

describe('renderInlineMarkdown', () => {
  it('renders plain text unchanged', () => {
    expect(renderInlineMarkdown('hello')).toBe('hello');
  });

  it('escapes HTML-significant characters in plain text', () => {
    expect(renderInlineMarkdown('a < b & c')).toBe('a &lt; b &amp; c');
  });

  it.each(['<br>', '<br/>', '<BR />'])('renders only a parsed attribute-free break: %s', tag => {
    expect(renderInlineMarkdown('A' + tag + 'B')).toBe('A<br>B');
    expect(paint('A' + tag + 'B').querySelectorAll('br')).toHaveLength(1);
  });

  it('renders consecutive, leading and trailing breaks without exposing HTML', () => {
    expect(renderInlineMarkdown('<br>A<br><br>')).toBe('<br>A<br><br>');
    expect(paint('<br>').querySelectorAll('br')).toHaveLength(1);
    expect(paint('**A<br>B**').querySelector('strong br')).not.toBeNull();
  });

  it('does not execute or conceal other HTML, escaped breaks or code', () => {
    const escaped = paint('A\\<br>B');
    expect(escaped.querySelector('br')).toBeNull();
    expect(paint('A `<br>` B').querySelector('br')).toBeNull();
    const unsafe = paint('A<br onclick="alert(1)">B');
    expect(unsafe.querySelector('br')).toBeNull();
    expect(unsafe.textContent).toContain('onclick');
  });

  it('renders bold text as <strong>', () => {
    expect(renderInlineMarkdown('**Bold**')).toBe('<strong>Bold</strong>');
  });

  it('renders italic text as <em>', () => {
    expect(renderInlineMarkdown('*Italic*')).toBe('<em>Italic</em>');
  });

  it('renders inline code as <code>', () => {
    expect(renderInlineMarkdown('`code`')).toBe('<code class="cm-table-cell-code">code</code>');
  });

  it('renders a link as its label text', () => {
    expect(renderInlineMarkdown('[label](https://example.com)')).toBe('label');
  });

  it.each([
    '[[Autodesker/Things to get to]',
    '[[unfinished',
    '[ordinary text]',
    '[label][reference]',
    '[label][]',
  ])('keeps destinationless syntax literal: %s', (source) => {
    expect(paint(source).textContent).toBe(source);
    expect(renderInlineMarkdown(source)).toBe(source);
  });

  it('keeps an adjacent explicit link renderable', () => {
    expect(renderInlineMarkdown('[[Incomplete] and [valid](https://example.com)')).toBe('[[Incomplete] and valid');
  });

  it('renders a WikiLink as its raw path (no resolver injected)', () => {
    expect(renderInlineMarkdown('[[Page]]')).toBe('<span class="cm-table-cell-wikilink">Page</span>');
  });

  it('renders the display alias from escaped table storage', () => {
    expect(renderInlineMarkdown('[[Page\\|Alias]]')).toBe('<span class="cm-table-cell-wikilink">Alias</span>');
  });

  it('does not treat unsafe unescaped table source as an alias', () => {
    expect(renderInlineMarkdown('[[Page|Alias]]')).toBe('[[Page|Alias]]');
  });

  it('renders literal pipes separately from the alias separator', () => {
    const source = '[[A' + String.fromCharCode(92).repeat(3) + '|B\\|Label\\|More]]';
    expect(renderInlineMarkdown(source)).toBe('<span class="cm-table-cell-wikilink">Label|More</span>');
  });

  it('composes multiple spans in document order', () => {
    expect(renderInlineMarkdown('a **b** c')).toBe('a <strong>b</strong> c');
  });

  it('renders bold, italic and bold-italic', () => {
    expect(renderInlineMarkdown('**b** *i* ***bi***')).toBe('<strong>b</strong> <em>i</em> <em><strong>bi</strong></em>');
  });

  it('renders highlight as <mark>', () => {
    expect(renderInlineMarkdown('==hot==')).toBe('<mark class="cm-table-cell-highlight">hot</mark>');
  });

  it('renders mixed formatting and plain text in one cell, nesting valid combinations', () => {
    expect(renderInlineMarkdown('plain **bold ==marked==** and `code` *it*')).toBe(
      'plain <strong>bold <mark class="cm-table-cell-highlight">marked</mark></strong> and <code class="cm-table-cell-code">code</code> <em>it</em>'
    );
  });

  it('does not format inside inline code', () => {
    expect(renderInlineMarkdown('`**x**`')).toBe('<code class="cm-table-cell-code">**x**</code>');
  });

  it('paints actual editor tok-* classes and keeps clipboard HTML unstyled', () => {
    const host = paint('**b** *i* ~~s~~ ==h== `c`');
    expect(host.textContent).toBe('b i s h c');
    for (const [selector, value] of [
      ['strong.tok-strong', 'b'], ['em.tok-emphasis', 'i'], ['.tok-strike', 's'],
      ['span.tok-highlight', 'h'], ['code.tok-code.cm-table-cell-code', 'c'],
    ] as const) {
      expect(host.querySelector(selector)?.textContent).toBe(value);
    }
    expect(renderInlineMarkdown('**b**')).toBe('<strong>b</strong>');
    expect(renderInlineMarkdown('**b** *i* ~~s~~ ==h== `c`')).toBe(
      '<strong>b</strong> <em>i</em> <s>s</s> <mark class="cm-table-cell-highlight">h</mark> <code class="cm-table-cell-code">c</code>'
    );
  });
});
