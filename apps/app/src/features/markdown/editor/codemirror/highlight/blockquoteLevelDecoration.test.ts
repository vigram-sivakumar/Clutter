// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockquoteLevelDecoration } from './blockquoteLevelDecoration';
import { blockquoteMarkerDecoration } from './blockquoteMarkerDecoration';

function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), blockquoteLevelDecoration(), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

function lines(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'));
}

function nthLine(view: EditorView, index: number): HTMLElement {
  const line = lines(view)[index];
  if (!line) {
    throw new Error(`expected a .cm-line at index ${index}`);
  }
  return line;
}

function levelsIn(line: HTMLElement): string[] {
  return Array.from(line.querySelectorAll('.cm-quote-level')).map(
    (el) => (el as HTMLElement).style.getPropertyValue('--quote-level')
  );
}

describe('blockquoteLevelDecoration', () => {
  it('> one gets exactly one .cm-quote-level rail', () => {
    const view = mountView('> one');

    expect(levelsIn(nthLine(view, 0))).toEqual(['1']);
  });

  it('>> two gets exactly two .cm-quote-level rails', () => {
    const view = mountView('>> two');

    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);
  });

  it('>>> three gets exactly three .cm-quote-level rails', () => {
    const view = mountView('>>> three');

    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2', '3']);
  });

  it('never renders a literal ">" inside a rail widget — purely presentational', () => {
    const view = mountView('>>> three');
    const rails = nthLine(view, 0).querySelectorAll('.cm-quote-level');

    rails.forEach((rail) => {
      expect(rail.textContent).toBe('');
    });
  });

  it('each rail is aria-hidden (decorative, not real content)', () => {
    const view = mountView('> one');
    const rail = nthLine(view, 0).querySelector('.cm-quote-level');

    expect(rail?.getAttribute('aria-hidden')).toBe('true');
  });

  it('indented "  > quote" still gets exactly one rail', () => {
    const view = mountView('  > indented quote');

    expect(levelsIn(nthLine(view, 0))).toEqual(['1']);
  });

  it('indented "  >> quote" still gets exactly two rails', () => {
    const view = mountView('  >> indented nested quote');

    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);
  });

  it('a plain paragraph gets no rails at all', () => {
    const view = mountView('plain paragraph');

    expect(levelsIn(nthLine(view, 0))).toEqual([]);
  });

  it('is unconditional — the rail count is identical whether or not the marker is currently engaged', () => {
    const text = '>> quoted text';
    const view = mountView(text, [blockquoteMarkerDecoration()]);

    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);

    view.dispatch({ selection: { anchor: text.indexOf('quoted') } }); // engage
    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);

    view.dispatch({ selection: { anchor: 0 } }); // re-collapse
    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);
  });

  it('composes with marker reveal: engaging the line still leaves both real ">" characters and both rails present, no duplication', () => {
    const text = '>> quoted text';
    const view = mountView(text, [blockquoteMarkerDecoration()]);

    view.dispatch({ selection: { anchor: text.indexOf('quoted') } });

    expect(nthLine(view, 0).textContent).toBe('>> quoted text');
    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);
  });

  it('lazy continuation with fewer ">" than the real depth still renders the full depth in rails, falling back for the marker-less level(s)', () => {
    // ">>> one" opens depth 3; "> three" on its own would be depth 1, but
    // with no blank line between, CommonMark lazily continues the deepest
    // open Blockquote instead of closing levels — real depth stays 3 for
    // every line, confirmed via blockquoteLineDecoration.test.ts's own
    // equivalent case.
    const view = mountView('>>> one\n>> two\n> three');
    const rows = lines(view);

    expect(levelsIn(rows[0]!)).toEqual(['1', '2', '3']);
    expect(levelsIn(rows[1]!)).toEqual(['1', '2', '3']);
    expect(levelsIn(rows[2]!)).toEqual(['1', '2', '3']);
  });

  it('genuinely independent quotes at different depths (blank-line separated) each report their own depth', () => {
    const view = mountView('>> one\n\n> two');
    const rows = lines(view);

    expect(levelsIn(rows[0]!)).toEqual(['1', '2']);
    expect(levelsIn(rows[1]!)).toEqual([]);
    expect(levelsIn(rows[2]!)).toEqual(['1']);
  });

  it('growing depth live: 1 -> 2 -> 3 updates the rail count on redispatch', () => {
    const view = mountView('> growing');
    expect(levelsIn(nthLine(view, 0))).toEqual(['1']);

    view.dispatch({ changes: { from: 0, insert: '> ' } });
    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);

    view.dispatch({ changes: { from: 0, insert: '> ' } });
    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2', '3']);
  });

  it('shrinking depth live: 3 -> 2 -> 1 updates the rail count on redispatch', () => {
    const view = mountView('>>> shrinking');
    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2', '3']);

    view.dispatch({ changes: { from: 0, to: 1 } });
    expect(levelsIn(nthLine(view, 0))).toEqual(['1', '2']);

    view.dispatch({ changes: { from: 0, to: 1 } });
    expect(levelsIn(nthLine(view, 0))).toEqual(['1']);
  });
});
