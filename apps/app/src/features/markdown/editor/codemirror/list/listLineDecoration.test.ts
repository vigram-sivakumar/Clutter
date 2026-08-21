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

describe('listLineDecoration', () => {
  it('adds cm-list-line with depth 1 to a plain bullet item', () => {
    const view = mountView('- item');

    expect(nthLine(view, 0).className).toContain('cm-list-line');
    expect(depthOf(nthLine(view, 0))).toBe('1');
  });

  it('adds cm-list-line with depth 1 to an ordered item', () => {
    const view = mountView('1. item');

    expect(nthLine(view, 0).className).toContain('cm-list-line');
    expect(depthOf(nthLine(view, 0))).toBe('1');
  });

  it('adds cm-list-line with depth 1 to a task item, regardless of checked state', () => {
    const view = mountView('- [ ] Buy milk\n- [x] Buy eggs');
    const lines = listLines(view);

    for (const line of lines) {
      expect(line.className).toContain('cm-list-line');
      expect(depthOf(line)).toBe('1');
    }
  });

  it('adds cm-list-line with depth 1 to an emoji list item', () => {
    const view = mountView('🍒 item');

    expect(nthLine(view, 0).className).toContain('cm-list-line');
    expect(depthOf(nthLine(view, 0))).toBe('1');
  });

  it('gives a nested item depth 2, independent of its parent/child marker kind', () => {
    const view = mountView('- parent\n  - [x] nested task\n    🍒 nested emoji');
    const lines = listLines(view);

    expect(lines).toHaveLength(3);
    expect(depthOf(nthLine(view, 0))).toBe('1');
    expect(depthOf(nthLine(view, 1))).toBe('2');
    expect(depthOf(nthLine(view, 2))).toBe('3');
  });

  it('does NOT add the class to an unrelated line — blockquote, heading, or plain paragraph', () => {
    const view = mountView('> quoted\n# Heading\nplain text', [blockquoteMarkerDecoration()]);

    expect(listLines(view).every((l) => !l.className.includes('cm-list-line'))).toBe(true);
  });

  it('is unconditional — the class and depth stay applied whether or not the marker is currently engaged', () => {
    const text = 'Text before\n\n- [ ] Buy milk';
    const view = mountView(text);
    const taskLineIndex = 2;

    expect(nthLine(view, taskLineIndex).className).toContain('cm-list-line');

    const taskMarkerPos = text.indexOf('[ ]') + 1;
    view.dispatch({ selection: { anchor: taskMarkerPos } });

    expect(nthLine(view, taskLineIndex).className).toContain('cm-list-line');
  });

  it('only decorates lines that actually start a list item, in a document mixing list and non-list lines', () => {
    const view = mountView('plain paragraph\n- item one\nplain again\n1. item two');
    const lines = listLines(view);

    expect(lines.map((l) => l.className.includes('cm-list-line'))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });
});
