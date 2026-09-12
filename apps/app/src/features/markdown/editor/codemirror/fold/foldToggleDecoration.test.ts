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

/** Owning line text -> that toggle's own `cm-fold-heading-*` class, or `null` if it has none. */
function headingFoldClassesByOwner(view: EditorView): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const el of Array.from(view.dom.querySelectorAll('.cm-fold-toggle'))) {
    const owner = el.closest('.cm-line')?.textContent ?? '';
    const headingClass = Array.from(el.classList).find((cls) => cls.startsWith('cm-fold-heading-')) ?? null;
    result[owner] = headingClass;
  }
  return result;
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
   * indented content. Phase 3 (`indentedParagraphFoldService.ts`, tested
   * separately below) now legitimately makes a paragraph foldable when it
   * genuinely owns more-indented content — this test only pins down that
   * *this* case, an ordinary same-indentation continuation, must never be
   * mistaken for that.
   */
  it('two ordinary consecutive lines merged into one Paragraph node get no toggle (the reported bug)', () => {
    const view = mount('This is a new line\nThis is another line below the paragraph');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('two independent paragraphs separated by a blank line get no toggle', () => {
    const view = mount('Parent paragraph\n\nAnother paragraph');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('every ATX heading level (1-6) toggle gets its own cm-fold-heading-{n} class', () => {
    const view = mount('# H1\nbody\n\n## H2\nbody\n\n### H3\nbody\n\n#### H4\nbody\n\n##### H5\nbody\n\n###### H6\nbody');
    const classes = headingFoldClassesByOwner(view);
    expect(classes['# H1']).toBe('cm-fold-heading-1');
    expect(classes['## H2']).toBe('cm-fold-heading-2');
    expect(classes['### H3']).toBe('cm-fold-heading-3');
    expect(classes['#### H4']).toBe('cm-fold-heading-4');
    expect(classes['##### H5']).toBe('cm-fold-heading-5');
    expect(classes['###### H6']).toBe('cm-fold-heading-6');
  });

  it('Setext heading toggles (level 1 and 2) also get the matching cm-fold-heading-{n} class', () => {
    const view = mount('H1 Title\n========\nbody\n\nH2 Title\n--------\nbody');
    const classes = headingFoldClassesByOwner(view);
    expect(classes['H1 Title']).toBe('cm-fold-heading-1');
    expect(classes['H2 Title']).toBe('cm-fold-heading-2');
  });

  it('non-heading fold owners (list items, fenced code) get no cm-fold-heading-* class', () => {
    const view = mount('- Parent\n    - Nested\n- Leaf\n\n```ts\nconst x = 1\n```');
    const classes = headingFoldClassesByOwner(view);
    expect(classes['- Parent']).toBeNull();
    expect(classes['```ts']).toBeNull();
  });

  it('an indented-paragraph fold owner (Phase 3) gets no cm-fold-heading-* class', () => {
    const view = mount('Parent with child\n    Child paragraph');
    const classes = headingFoldClassesByOwner(view);
    expect(classes['Parent with child']).toBeNull();
  });

  it('a folded heading keeps its cm-fold-heading-{n} class (already-folded path, not just offer-to-fold)', () => {
    const view = mount('## H2\nbody line');
    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    expect(toggle.classList.contains('cm-fold-heading-2')).toBe(true);

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const collapsedToggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    expect(collapsedToggle.dataset.folded).toBe('true');
    expect(collapsedToggle.classList.contains('cm-fold-heading-2')).toBe(true);
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

/**
 * Phase 3: indentation-based paragraph folding
 * (`indentedParagraphFoldService.ts`). Every case here mirrors the bug
 * report's own required-behavior list verbatim, plus the blank-line and
 * indentation-threshold decisions that report explicitly asked to be
 * investigated rather than guessed at (see that file's own doc comment
 * for the reasoning behind each).
 */
describe('foldToggleDecoration — Phase 3: indentation-based paragraph folding', () => {
  it('two ordinary paragraphs (no indentation relationship) get no toggle', () => {
    const view = mount('Parent paragraph\n\nAnother paragraph');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('consecutive non-indented lines (one merged Paragraph node) get no toggle', () => {
    const view = mount('This is a new line\nThis is another line below the paragraph');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('a parent paragraph with one indented child gets a toggle, on the parent\'s own first line', () => {
    const view = mount('Parent with child\n    Child paragraph');
    expect(toggleTextsByOwner(view)).toEqual(['Parent with child']);
  });

  it('a parent paragraph with multiple indented children (no blank lines between them) still gets exactly one toggle, on the parent', () => {
    const view = mount('Parent with child\n    Child paragraph\n    More child content');
    expect(toggleTextsByOwner(view)).toEqual(['Parent with child']);
  });

  it('a parent, then a blank line, then a normal (non-indented) paragraph gets no toggle', () => {
    const view = mount('Parent blank normal\n\nNormal paragraph after blank');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('a blank line always ends the run, even toward a more-indented paragraph on the other side of it — no accidental foldability from "content exists below"', () => {
    const view = mount('Parent blank indented\n\n    Indented after blank');
    expect(toggleTextsByOwner(view)).toEqual([]);
  });

  it('the indentation threshold is "strictly greater than the parent\'s own," not a multiple of the 4-space indent unit', () => {
    const view = mount('Parent\n Child indented by one space only');
    expect(toggleTextsByOwner(view)).toEqual(['Parent']);
  });

  it('a sibling line back at the parent\'s own indentation level ends the fold — only the genuinely deeper lines are hidden', () => {
    const view = mount('Parent\n    Child\nSibling back at column 0');
    expect(toggleTextsByOwner(view)).toEqual(['Parent']);

    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const text = view.dom.querySelector('.cm-content')?.textContent ?? '';
    expect(text).toContain('Parent');
    expect(text).not.toContain('Child');
    expect(text).toContain('Sibling back at column 0');
  });

  it('folding a parent paragraph hides only the indented descendants, leaving the parent line itself visible', () => {
    const view = mount('Parent with child\n    Child paragraph\n    More child content');
    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const text = view.dom.querySelector('.cm-content')?.textContent ?? '';
    expect(text).toContain('Parent with child');
    expect(text).not.toContain('Child paragraph');
    expect(text).not.toContain('More child content');
    expect(view.state.doc.toString()).toBe('Parent with child\n    Child paragraph\n    More child content');
  });

  it('unfolding restores the indented content exactly', () => {
    const view = mount('Parent with child\n    Child paragraph');
    const toggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const collapsedToggle = view.dom.querySelector('.cm-fold-toggle') as HTMLButtonElement;
    collapsedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(view.dom.querySelector('.cm-content')?.textContent).toContain('Child paragraph');
  });

  it('does not interfere with headings, lists, or fenced code in the same document', () => {
    const view = mount(
      '# Heading\nheading body\n\n- Item\n    - Nested\n\n```ts\ncode\n```\n\nParent with child\n    Child paragraph'
    );
    const owners = toggleTextsByOwner(view);
    expect(owners).toContain('# Heading');
    expect(owners).toContain('- Item');
    expect(owners).toContain('```ts');
    expect(owners).toContain('Parent with child');
    expect(owners).toHaveLength(4);
  });

  it('a list item\'s own indented content is never mistaken for a paragraph-fold owner — resolveLineIndentContext already routes it to `kind: \'list\'`', () => {
    const view = mount('- Item\n    Continuation of the item, still indented');
    // Only the ListItem's own generic foldable range is offered here (its
    // marker line owns a fold hiding the continuation) — never a second,
    // competing paragraph-fold toggle for the same content.
    expect(toggleTextsByOwner(view)).toEqual(['- Item']);
  });
});
