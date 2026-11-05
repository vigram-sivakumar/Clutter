// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockSeparatorDecoration } from './blockSeparatorDecoration';
import { collapsedQuoteExitDecoration } from './collapsedQuoteExitDecoration';
import { collapsedQuoteExitLineNumbers, SEPARATOR } from './separatorScope';

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
}

function collapsed(doc: string): number[] {
  return [...collapsedQuoteExitLineNumbers(stateOf(doc))];
}

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdownLanguageExtension(), blockSeparatorDecoration(), collapsedQuoteExitDecoration()],
    }),
    parent,
  });
}

function separatorHeights(view: EditorView): number[] {
  return Array.from(view.dom.querySelectorAll('.cm-block-separator')).map((el) => parseInt((el as HTMLElement).style.height, 10));
}

function collapsedLineIndexes(view: EditorView): number[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'))
    .map((el, index) => (el.classList.contains('cm-collapsed-quote-exit') ? index + 1 : 0))
    .filter(Boolean);
}

describe('collapsed quote-exit line — predicate', () => {
  it('matches the blank line between a quote and following text', () => {
    expect(collapsed('> Quote\n\nAfter')).toEqual([2]);
  });

  it('matches the blank line Enter leaves, with the caret line empty below it', () => {
    expect(collapsed('> Quote\n\n')).toEqual([2]);
  });

  it('matches after a lazy-continuation quote line, a nested quote and a quoted list', () => {
    expect(collapsed('> Quote\nlazy\n\nAfter')).toEqual([3]);
    expect(collapsed('>> Nested\n\nAfter')).toEqual([2]);
    expect(collapsed('> - item\n\nAfter')).toEqual([2]);
  });

  it('matches a whitespace-only line', () => {
    expect(collapsed('> Quote\n   \nAfter')).toEqual([2]);
  });

  it('matches only the first of several blank lines', () => {
    expect(collapsed('> Quote\n\n\n\nAfter')).toEqual([2]);
  });

  it('matches between two separate quotes', () => {
    expect(collapsed('> One\n\n> Two')).toEqual([2]);
  });

  it('does not match ordinary paragraph separators', () => {
    expect(collapsed('Para A\n\nPara B')).toEqual([]);
    expect(collapsed('- a\n\nPara')).toEqual([]);
    expect(collapsed('# Heading\n\nPara')).toEqual([]);
  });

  it('does not match an empty line inside a blockquote', () => {
    expect(collapsed('> one\n>\n> two')).toEqual([]);
    expect(collapsed('> one\n> \n> two')).toEqual([]);
  });

  it('does not match the last line of the document', () => {
    expect(collapsed('> Quote\n')).toEqual([]);
    expect(collapsed('> Quote\n   ')).toEqual([]);
  });

  it('does not match a line with content, or a blank line not directly below a quote', () => {
    expect(collapsed('> Quote\nText\nAfter')).toEqual([]);
    expect(collapsed('Text\n\n> Quote')).toEqual([]);
  });
});

describe('collapsed quote-exit line — separators and decoration', () => {
  it('resolves spacing between the quote and the line after the blank one (one 12px gap, not two)', () => {
    const view = mountView('> Quote\n\nAfter');
    expect(separatorHeights(view)).toEqual([SEPARATOR.normal]);
    view.destroy();
  });

  it('uses the following block’s own height, as if the blank line were not there', () => {
    const view = mountView('> Quote\n\n# Heading');
    expect(separatorHeights(view)).toEqual([SEPARATOR.heading.h1]);
    view.destroy();
  });

  it('leaves an ordinary blank line with its two 12px separators', () => {
    const view = mountView('Para A\n\nPara B');
    expect(separatorHeights(view)).toEqual([SEPARATOR.normal, SEPARATOR.normal]);
    expect(collapsedLineIndexes(view)).toEqual([]);
    view.destroy();
  });

  it('decorates exactly the collapsed line', () => {
    const view = mountView('> Quote\n\nAfter');
    expect(collapsedLineIndexes(view)).toEqual([2]);
    view.destroy();
  });

  it('does not change the document text', () => {
    const doc = '> Quote\n\nAfter\n\n> One\n>\n> Two\n';
    const view = mountView(doc);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('adds and removes the collapse as the document changes, without touching other lines', () => {
    const view = mountView('> Quote\nAfter');
    expect(collapsedLineIndexes(view)).toEqual([]);

    view.dispatch({ changes: { from: 7, insert: '\n' } });
    expect(view.state.doc.toString()).toBe('> Quote\n\nAfter');
    expect(collapsedLineIndexes(view)).toEqual([2]);
    expect(separatorHeights(view)).toEqual([SEPARATOR.normal]);

    view.dispatch({ changes: { from: 7, to: 8 } });
    expect(collapsedLineIndexes(view)).toEqual([]);
    view.destroy();
  });
});
