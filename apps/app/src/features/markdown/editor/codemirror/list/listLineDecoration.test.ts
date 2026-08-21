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
  describe('top-level items (depth 0) get no decoration at all', () => {
    it.each([
      ['bullet', '- item'],
      ['ordered', '1. item'],
      ['task', '- [ ] Buy milk'],
      ['checked task', '- [x] Buy milk'],
      ['emoji', '🍒 item'],
    ])('%s: no cm-list-line class, no --list-depth', (_kind, doc) => {
      const view = mountView(doc);
      const line = nthLine(view, 0);

      expect(hasListLine(line)).toBe(false);
      expect(depthOf(line)).toBeNull();
    });
  });

  it('a first-nested item (depth 1) gets cm-list-line and --list-depth: 1', () => {
    const view = mountView('- parent\n  - [x] nested task');

    expect(hasListLine(nthLine(view, 0))).toBe(false); // top-level parent: depth 0
    expect(depthOf(nthLine(view, 0))).toBeNull();

    expect(hasListLine(nthLine(view, 1))).toBe(true);
    expect(depthOf(nthLine(view, 1))).toBe('1');
  });

  it('a second-nested item (depth 2) gets cm-list-line and --list-depth: 2', () => {
    const view = mountView('- top\n  - first nested\n    - second nested');

    expect(hasListLine(nthLine(view, 0))).toBe(false); // top-level: depth 0
    expect(depthOf(nthLine(view, 0))).toBeNull();

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

  it('removes cm-list-line and --list-depth once a nested line stops being a list item', () => {
    const view = mountView('- parent\n  - nested item');
    expect(hasListLine(nthLine(view, 1))).toBe(true);
    expect(depthOf(nthLine(view, 1))).toBe('1');

    // Delete the nested line's own `- ` marker prefix (keeping its 2-space
    // indent), so it reparses as lazy-continuation text of the parent item
    // rather than a ListItem of its own.
    const nestedMarkerStart = '- parent\n  '.length;
    view.dispatch({ changes: { from: nestedMarkerStart, to: nestedMarkerStart + 2, insert: '' } });

    const line = nthLine(view, 1);
    expect(hasListLine(line)).toBe(false);
    expect(depthOf(line)).toBeNull();
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

  it('only decorates nested list-item lines in a document mixing plain, top-level, and nested lines', () => {
    const view = mountView('plain paragraph\n- top item\n  - nested item\nplain again');
    const lines = listLines(view);

    expect(lines.map(hasListLine)).toEqual([false, false, true, false]);
  });
});
