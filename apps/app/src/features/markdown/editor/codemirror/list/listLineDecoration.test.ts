// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockquoteMarkerDecoration } from '../highlight/blockquoteMarkerDecoration';
import { taskCheckboxDecorations } from '../task/taskCheckboxDecorations';
import { listLineDecoration } from './listLineDecoration';

function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      taskCheckboxDecorations(),
      listLineDecoration(),
      ...extraExtensions,
    ],
  });
  return new EditorView({ state, parent });
}

function listLines(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'));
}

function nthLine(view: EditorView, index: number): HTMLElement {
  const line = listLines(view)[index];
  if (!line) {
    throw new Error(`expected a .cm-line at index ${index}`);
  }
  return line;
}

function depthOf(line: HTMLElement): string | null {
  return line.style.getPropertyValue('--list-depth') || null;
}

function hasListLine(line: HTMLElement): boolean {
  return line.className.includes('cm-list-line');
}

describe('listLineDecoration', () => {
  describe('top-level items (depth 0) get cm-list-line and --list-depth: 0', () => {
    it.each([
      ['bullet', '- item'],
      ['ordered', '1. item'],
      ['task', '- [ ] Buy milk'],
      ['checked task', '- [x] Buy milk'],
      ['emoji', '🍒 item'],
    ])('%s', (_kind, doc) => {
      const view = mountView(doc);
      const line = nthLine(view, 0);

      expect(hasListLine(line)).toBe(true);
      expect(depthOf(line)).toBe('0');
    });
  });

  it('a first-nested item (depth 1) gets cm-list-line and --list-depth: 1', () => {
    const view = mountView('- parent\n  - [x] nested task');

    expect(hasListLine(nthLine(view, 0))).toBe(true); // top-level parent: depth 0
    expect(depthOf(nthLine(view, 0))).toBe('0');

    expect(hasListLine(nthLine(view, 1))).toBe(true);
    expect(depthOf(nthLine(view, 1))).toBe('1');
  });

  it('a second-nested item (depth 2) gets cm-list-line and --list-depth: 2', () => {
    const view = mountView('- top\n  - first nested\n    - second nested');

    expect(hasListLine(nthLine(view, 0))).toBe(true); // top-level: depth 0
    expect(depthOf(nthLine(view, 0))).toBe('0');

    expect(hasListLine(nthLine(view, 1))).toBe(true); // first nested: depth 1
    expect(depthOf(nthLine(view, 1))).toBe('1');

    expect(hasListLine(nthLine(view, 2))).toBe(true); // second nested: depth 2
    expect(depthOf(nthLine(view, 2))).toBe('2');
  });

  it('does NOT add the class to an unrelated line — blockquote, heading, or plain paragraph', () => {
    const view = mountView('> quoted\n# Heading\nplain text', [blockquoteMarkerDecoration()]);

    expect(listLines(view).every((l) => !hasListLine(l))).toBe(true);
  });

  it('a plain paragraph gets no --list-depth and no inline style at all — no default list indentation to opt out of', () => {
    const view = mountView('plain paragraph');
    const line = nthLine(view, 0);

    expect(line.className).toBe('cm-line');
    expect(depthOf(line)).toBeNull();
    expect(line.getAttribute('style')).toBeNull();
  });

  it('demotes cm-list-line from depth 1 to depth 0 once a nested line stops being a list item of its own', () => {
    const view = mountView('- parent\n  - nested item');
    expect(hasListLine(nthLine(view, 1))).toBe(true);
    expect(depthOf(nthLine(view, 1))).toBe('1');

    // Delete the nested line's own `- ` marker prefix (keeping its 2-space
    // indent), so it reparses as lazy-continuation text of the parent item
    // rather than a ListItem of its own — still owned by "parent" (depth
    // 0), not unrelated to it.
    const nestedMarkerStart = '- parent\n  '.length;
    view.dispatch({ changes: { from: nestedMarkerStart, to: nestedMarkerStart + 2, insert: '' } });

    const line = nthLine(view, 1);
    expect(hasListLine(line)).toBe(true);
    expect(depthOf(line)).toBe('0');
  });

  it('demotes a second-nested item from depth 2 to depth 1 once one level of its own indentation is removed', () => {
    const doc = '- top\n  - first nested\n    - second nested';
    const view = mountView(doc);
    expect(depthOf(nthLine(view, 2))).toBe('2');

    // Delete 2 of the second-nested item's 4 leading spaces, making it a
    // sibling of "first nested" instead of a child of it.
    const secondNestedStart = doc.indexOf('    - second nested');
    view.dispatch({
      changes: { from: secondNestedStart, to: secondNestedStart + 2, insert: '' },
    });

    expect(hasListLine(nthLine(view, 2))).toBe(true);
    expect(depthOf(nthLine(view, 2))).toBe('1');
  });

  it('is unconditional — a nested item keeps its class/depth whether or not its marker is currently engaged', () => {
    const text = '- parent\n  - [ ] Buy milk';
    const view = mountView(text);
    const nestedLineIndex = 1;

    expect(hasListLine(nthLine(view, nestedLineIndex))).toBe(true);
    expect(depthOf(nthLine(view, nestedLineIndex))).toBe('1');

    const taskMarkerPos = text.indexOf('[ ]') + 1;
    view.dispatch({ selection: { anchor: taskMarkerPos } });

    expect(hasListLine(nthLine(view, nestedLineIndex))).toBe(true);
    expect(depthOf(nthLine(view, nestedLineIndex))).toBe('1');
  });

  it('decorates every list-owned line in a document mixing plain, top-level, and nested lines', () => {
    const view = mountView('plain paragraph\n- top item\n  - nested item\nplain again');
    const lines = listLines(view);

    // "plain again" carries no indentation of its own, but CommonMark lazy
    // continuation still attaches it to the nested item's own Paragraph
    // (confirmed against the parsed tree) — so it's owned by the nested
    // ListItem, depth 1, same as the line above it.
    expect(lines.map(hasListLine)).toEqual([false, true, true, true]);
    expect(lines.map(depthOf)).toEqual([null, '0', '1', '1']);
  });

  it('decorates a lazy-continuation line that starts a ListItem\'s own line with no leading whitespace at all', () => {
    const view = mountView('1. Parent item\nlazy continuation line with no leading whitespace');
    const lines = listLines(view);

    expect(lines.map(hasListLine)).toEqual([true, true]);
    expect(lines.map(depthOf)).toEqual(['0', '0']);
  });

  it('decorates every physical line of a multi-block ListItem — second paragraph, nested list, fenced code alike', () => {
    const doc = [
      '1. first paragraph',
      '',
      '   second paragraph',
      '',
      '   - nested item',
      '',
      '   ```',
      '   code',
      '   ```',
    ].join('\n');
    const view = mountView(doc);
    const lines = listLines(view);

    // Blank lines are skipped (no visible content to hang-align), every
    // other line is owned by either the outer ListItem (depth 0) or the
    // nested one (depth 1).
    expect(lines.map(hasListLine)).toEqual([true, false, true, false, true, false, true, true, true]);
    expect(lines.map(depthOf)).toEqual(['0', null, '0', null, '1', null, '0', '0', '0']);
  });

  it('does not decorate a blockquote-prefixed line at all — its first non-whitespace character is ">", not a ListItem', () => {
    const view = mountView('> - quoted bullet', [blockquoteMarkerDecoration()]);
    const line = nthLine(view, 0);

    // The physical line's first non-whitespace character is the
    // blockquote's own ">" (confirmed against the parsed tree: QuoteMark
    // is a direct child of Blockquote, a sibling of the nested BulletList,
    // never itself inside the ListItem). Probing there finds no ListItem
    // ancestor, so this line correctly gets no list-line decoration at
    // all — the list's own marker line (one line down, in the
    // multi-line-blockquote case) is unaffected by this.
    expect(hasListLine(line)).toBe(false);
    expect(depthOf(line)).toBeNull();
  });

  it('gives a blockquote nested inside a ListItem the ListItem\'s own depth, not zero from being "just a blockquote"', () => {
    const view = mountView('- outer\n  > quoted continuation inside list item', [blockquoteMarkerDecoration()]);
    const lines = listLines(view);

    expect(lines.map(hasListLine)).toEqual([true, true]);
    expect(lines.map(depthOf)).toEqual(['0', '0']);
  });
});
