// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from './markdownLanguage';
import { routeShiftTabDedent, routeTabIndent } from './markdownTabKeymap';

function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

/**
 * A single mixed document exercising every context this milestone
 * explicitly assigns behavior to, plus every context it explicitly does
 * not — the "only the contexts we've assigned behavior to should
 * intercept Tab" check, in one place.
 */
const MIXED_DOC = [
  'A plain paragraph',
  '- a list item',
  '  a continuation line',
  '# A heading',
  '---',
  '> a blockquote',
  '```',
  'code',
  '```',
].join('\n');

describe('markdownTabKeymap routing — Tab', () => {
  it('routes to the list command inside a ListItem', () => {
    const doc = '- item1\n- item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = routeTabIndent(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n  - item2');
  });

  it('list ownership wins over paragraph indentation for a paragraph inside a ListItem', () => {
    const doc = '- item1\n- This is a list item';
    const view = mountView(doc, doc.indexOf('list item'));

    const handled = routeTabIndent(view);

    expect(handled).toBe(true);
    // Structural list nesting, not two leading spaces of plain-text indent.
    expect(view.state.doc.toString()).toBe('- item1\n  - This is a list item');
  });

  it('routes to the paragraph command for a plain paragraph', () => {
    const doc = MIXED_DOC;
    const view = mountView(doc, doc.indexOf('A plain paragraph') + 2);

    const handled = routeTabIndent(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString().startsWith('  A plain paragraph')).toBe(true);
  });

  it('does not intercept a heading', () => {
    const doc = MIXED_DOC;
    const view = mountView(doc, doc.indexOf('A heading'));

    const handled = routeTabIndent(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a horizontal rule', () => {
    const doc = MIXED_DOC;
    const view = mountView(doc, doc.indexOf('---') + 1);

    const handled = routeTabIndent(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a blockquote (not implemented this milestone)', () => {
    const doc = MIXED_DOC;
    const view = mountView(doc, doc.indexOf('a blockquote'));

    const handled = routeTabIndent(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a fenced code block (not implemented this milestone)', () => {
    const doc = MIXED_DOC;
    const view = mountView(doc, doc.indexOf('code'));

    const handled = routeTabIndent(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does not intercept a table cell (not implemented this milestone)', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |';
    const view = mountView(doc, doc.lastIndexOf('1'));

    const handled = routeTabIndent(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('markdownTabKeymap routing — Shift-Tab', () => {
  it('routes to the list command inside a ListItem', () => {
    const doc = '- item1\n  - item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = routeShiftTabDedent(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n- item2');
  });

  it('routes to the paragraph command for a plain paragraph', () => {
    const doc = '  A plain paragraph';
    const view = mountView(doc, 4);

    const handled = routeShiftTabDedent(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('A plain paragraph');
  });

  it('does not intercept a heading, horizontal rule, blockquote, code, or table', () => {
    const contexts: [string, number][] = [
      ['# A heading', 3],
      ['---', 1],
      ['> a blockquote', 3],
      ['```\ncode\n```', 5],
      ['| a | b |\n| - | - |\n| 1 | 2 |', 22],
    ];
    for (const [doc, pos] of contexts) {
      const view = mountView(doc, pos);
      const handled = routeShiftTabDedent(view);
      expect(handled).toBe(false);
      expect(view.state.doc.toString()).toBe(doc);
    }
  });
});
