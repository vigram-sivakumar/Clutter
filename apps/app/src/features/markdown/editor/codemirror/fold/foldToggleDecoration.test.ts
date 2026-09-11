// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { forceParsing } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { markdownLanguageExtension } from '../markdownLanguage';

function mount(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = createEditorView({ doc, parent, extensions: [markdownLanguageExtension()] });
  forceParsing(view);
  return view;
}

function toggleTextsByOwner(view: EditorView): string[] {
  return Array.from(view.dom.querySelectorAll('.cm-fold-toggle')).map(
    (el) => el.closest('.cm-line')?.textContent ?? ''
  );
}

describe('foldToggleDecoration — Phase 1 scope: headings, foldable list items, fenced code only', () => {
  it('every ATX heading level (1-6) with content beneath it gets a toggle', () => {
    const view = mount('# H1\nbody\n\n## H2\nbody\n\n###### H6\nbody');
    const owners = toggleTextsByOwner(view);
    // Raw marker text, not concealed — this test mounts only
    // `markdownLanguageExtension()`, not the full
    // `buildEditorExtensions()` reveal/conceal decoration stack.
    expect(owners).toContain('# H1');
    expect(owners).toContain('## H2');
    expect(owners).toContain('###### H6');
  });

  it('a heading with nothing beneath it (immediately followed by EOF or another heading of the same/higher level) gets no toggle', () => {
    const view = mount('# H1\n# H2');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('a list item with nested content gets a toggle; a leaf list item does not', () => {
    const view = mount('- Parent\n    - Nested\n- Leaf');
    const owners = toggleTextsByOwner(view);
    expect(owners).toContain('- Parent');
    expect(owners).not.toContain('- Leaf');
  });

  it('a fenced code block\'s opening line gets a toggle', () => {
    const view = mount('```ts\nconst x = 1\n```');
    expect(toggleTextsByOwner(view)).toContain('```ts');
  });

  it('even an empty fenced code block still gets a toggle — the closing fence is its own physical line, so there is still something to hide', () => {
    const view = mount('```ts\n```');
    expect(toggleTextsByOwner(view)).toContain('```ts');
  });

  /**
   * Regression coverage for a real bug found during live verification:
   * `@codemirror/lang-markdown`'s own generic `foldNodeProp` branch makes
   * *any* multi-line `Paragraph` node foldable (it only excludes
   * `Document`/heading/list, not `Paragraph`) — before
   * `isInScopeFoldOwner`'s allowlist existed, this widget faithfully
   * surfaced that native range as a working "fold this ordinary paragraph
   * in half" control the moment two source lines merged into one
   * `Paragraph` node, which happens for perfectly ordinary continuation
   * text with no blank line between two lines — not just for genuinely
   * indented content. Indentation-hierarchy paragraph folding is a
   * separate, later phase with its own algorithm; until it ships, no
   * paragraph of any shape gets a toggle from this extension.
   */
  it('two ordinary consecutive lines merged into one Paragraph node get no toggle (the reported bug)', () => {
    const view = mount('This is a new line\nThis is another line below the paragraph');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('two independent paragraphs separated by a blank line get no toggle', () => {
    const view = mount('Parent paragraph\n\nAnother paragraph');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('a paragraph with genuinely indented continuation lines still gets no toggle — paragraph folding is out of scope for this phase regardless of indentation', () => {
    const view = mount('Parent with child\n    Child paragraph\n    More child content');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('clicking a heading\'s toggle folds it, and clicking again unfolds it', () => {
    const view = mount('# H1\nbody line');
    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    expect(toggle.dataset.folded).toBe('false');

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(view.state.doc.toString()).toBe('# H1\nbody line'); // fold never changes the document
    expect(view.dom.querySelector('.cm-content')?.textContent).not.toContain('body line');

    const collapsedToggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    expect(collapsedToggle.dataset.folded).toBe('true');
    collapsedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(view.dom.querySelector('.cm-content')?.textContent).toContain('body line');
  });
});
