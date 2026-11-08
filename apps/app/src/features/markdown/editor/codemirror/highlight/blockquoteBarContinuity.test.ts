// @vitest-environment jsdom

// CodeMirror reads the platform once, at load, to decide what `Mod` is.
vi.hoisted(() => {
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { buildEditorExtensions, type BuildEditorExtensionsOptions } from '../buildEditorExtensions';
import { createEditorView } from '../createEditorView';

/**
 * The quote's vertical bar is drawn per line (`.cm-quote-line::before`). Between two paragraphs of one quote
 * `blockSeparatorDecoration.ts` puts a block widget (`.cm-block-separator`) between the two `.cm-line` elements, so
 * the bar has to continue through it — and must not through anything else. CSS cannot be laid out in jsdom, so these
 * pin the two things the fix rests on: the DOM sequence the real editor produces, and the rules that read it. (The
 * rendered result was checked in headless Chrome against the real rules; see the entry in
 * `docs/editor-architecture-decisions.md`.)
 */
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

/** `.cm-content`'s children as a string: Q = quote line, L = other line, S = separator widget. */
function sequence(doc: string): string {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({
    doc,
    parent,
    extensions: buildEditorExtensions({ ...REQUIRED, readOnly: false, hostPageId: 'test-page' }),
  });
  mounted.push(view);
  ensureSyntaxTree(view.state, doc.length, 5000);
  view.dispatch({});
  return [...view.contentDOM.children]
    .map((child) => (child.classList.contains('cm-block-separator') ? 'S' : child.classList.contains('cm-quote-line') ? 'Q' : 'L'))
    .join('');
}

describe('quote bar: the DOM sequence the rules read', () => {
  it('lines of one paragraph are adjacent quote lines', () => {
    expect(sequence('> This is here\n> This is another line')).toBe('QQ');
  });

  it('a new empty quoted line after text sits behind a separator, between two quote lines', () => {
    expect(sequence('> This is here\n> This is another line\n> ')).toBe('QQSQ');
  });

  it('paragraphs of one quote, nested quotes and quoted lists all keep quote lines on both sides of a separator', () => {
    expect(sequence('> a\n>\n> b')).toBe('QSQSQ');
    expect(sequence('>> a\n>> b\n>> ')).toBe('QQSQ');
    expect(sequence('> a\n> - x\n> ')).toBe('QSQSQ');
  });

  it('separate quotes always have a plain line between them, so quote-separator-quote never joins two quotes', () => {
    expect(sequence('> a\n\n> b')).toBe('QSLSQ');
  });

  it('after exiting a quote the blank line carries no quote class', () => {
    expect(sequence('> a\n\n')).toBe('QSLSL');
  });
});

describe('quote bar: the CSS (MarkdownEditor.css)', () => {
  const css = readFileSync(resolve(__dirname, '../../MarkdownEditor.css'), 'utf8');
  const SPACER = '.cm-editor .cm-quote-line + .cm-block-separator:has(+ .cm-quote-line)';

  it('draws the bar on a separator only when a quote line is directly before and after it', () => {
    expect(css).toContain(`${SPACER} {\n  position: relative;\n}`);
    // It shares the line bar's own rule, so the geometry is declared once.
    expect(css).toMatch(
      new RegExp(`\\.cm-editor \\.cm-quote-line::before,\\s*${SPACER.replace(/[.+()*]/g, '\\$&')}::before \\{[^}]*content: ''`)
    );
    expect(css).not.toMatch(/\.cm-block-separator::before/);
  });

  it('squares the joined ends so the bar reads as one straight piece', () => {
    expect(css).toContain(`${SPACER}::before {\n  border-radius: 0;\n}`);
    expect(css).toContain(
      ".cm-editor .cm-quote-line[data-quote-join~='prev']::before {\n  border-start-start-radius: 0;\n  border-start-end-radius: 0;\n}"
    );
    expect(css).toContain(
      ".cm-editor .cm-quote-line[data-quote-join~='next']::before {\n  border-end-start-radius: 0;\n  border-end-end-radius: 0;\n}"
    );
  });

  it('squares a line\'s own ends from its own attribute, never from a sibling selector (WebKit restyles a line only when it changes itself)', () => {
    expect(css).not.toContain('.cm-quote-line:has(+');
    expect(css).not.toMatch(/\.cm-quote-line \+ \.cm-quote-line::before/);
    expect(css).not.toMatch(/\.cm-quote-line \+ \.cm-block-separator \+ \.cm-quote-line::before/);
  });
});
