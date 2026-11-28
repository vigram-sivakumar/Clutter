// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { foldedRanges, forceParsing } from '@codemirror/language';
import { undoDepth } from '@codemirror/commands';
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

describe('foldToggleDecoration — Phase 1 scope: headings and fenced code, list folding retired', () => {
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

  it('neither a list item with nested content nor a leaf item gets a toggle', () => {
    const view = mount('- Parent\n    - Nested\n- Leaf');
    const owners = toggleTextsByOwner(view);
    expect(owners).toEqual([]);
  });

  it('a fenced code block\'s opening line gets a toggle', () => {
    const view = mount('```ts\nconst x = 1\n```');
    expect(toggleTextsByOwner(view)).toContain('```ts');
  });

  it('even an empty fenced code block still gets a toggle — the closing fence is its own physical line, so there is still something to hide', () => {
    const view = mount('```ts\n```');
    expect(toggleTextsByOwner(view)).toContain('```ts');
  });

  /** Ordinary and indented prose must never acquire the native generic paragraph fold. */
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

  it('fenced code gets no heading class, and list items have no toggle', () => {
    const view = mount('- Parent\n    - Nested\n- Leaf\n\n```ts\nconst x = 1\n```');
    const classes = headingFoldClassesByOwner(view);
    expect(classes['- Parent']).toBeUndefined();
    expect(classes['```ts']).toBeNull();
  });

  it('an indented paragraph has no fold affordance', () => {
    const view = mount('Parent with child\n    Child paragraph');
    const classes = headingFoldClassesByOwner(view);
    expect(classes['Parent with child']).toBeUndefined();
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

  it('collapsing and reopening a parent heading preserves the child heading fold without changing source or history', () => {
    const doc = '# Parent\nintro\n## Child\nchild body\n# Next\nnext body';
    const view = mount(doc);
    const toggle = (label: string) => Array.from(view.dom.querySelectorAll<HTMLButtonElement>('.cm-fold-toggle'))
      .find(el => el.closest('.cm-line')?.textContent?.startsWith(label))!;
    const before = undoDepth(view.state);
    toggle('## Child').click();
    expect(foldedRanges(view.state).size).toBe(1);
    toggle('# Parent').click();
    expect(view.dom.querySelector('.cm-content')?.textContent).not.toContain('## Child');
    toggle('# Parent').click();
    expect(view.dom.querySelector('.cm-content')?.textContent).toContain('## Child');
    expect(view.dom.querySelector('.cm-content')?.textContent).not.toContain('child body');
    expect(toggle('## Child').dataset.folded).toBe('true');
    expect(view.state.doc.toString()).toBe(doc);
    expect(undoDepth(view.state)).toBe(before);
  });
});

describe('foldToggleDecoration — paragraphs remain expanded', () => {
  it.each([
    'Parent paragraph\n\nAnother paragraph',
    'This is a new line\nThis is another line below the paragraph',
    'Parent with child\n    Child paragraph',
    'Parent with child\n    Child paragraph\n    More child content',
    'Parent blank normal\n\nNormal paragraph after blank',
    'Parent blank indented\n\n    Indented after blank',
    'Parent\n Child indented by one space only',
    'Parent\n    Child\nSibling back at column 0',
    '- Item\n    Continuation of the item, still indented',
    'Parent\\\n    Child',
  ])('does not offer a toggle or hide content: %s', (doc) => {
    const view = mount(doc);
    expect(toggleTextsByOwner(view)).toEqual([]);
    expect(view.dom.querySelector('.cm-foldPlaceholder')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    for (const line of doc.split('\n').filter(Boolean)) {
      expect(view.dom.querySelector('.cm-content')?.textContent).toContain(line.trim());
    }
  });

  it('only headings and fenced code get toggles in a mixed note', () => {
    const view = mount('# Heading\nheading body\n\n- Item\n    - Nested\n\n~~~ts\ncode\n~~~\n\nParent with child\n    Child paragraph');
    expect(toggleTextsByOwner(view)).toEqual(['# Heading', '~~~ts']);
  });
});

/** List folding was explicitly retired on 2026-11-28. Preserve the original
 * regression shapes, now asserting no fold UI and no hidden source content. */
describe('foldToggleDecoration — list/task folding retired', () => {
  it.each([
    ['leaf task', '- [ ] Parent\nSibling paragraph'],
    ['ordered lazy sibling', '1. Parent\nSibling'],
    ['task descendants', '- [ ] Parent\n    Child paragraph\nSibling paragraph'],
    ['reported task document', '- [ ] Hey\n    Date mention here\n[[Date mention]]\n[[Links]]\n~~strikethrough text~~\n1. Date mention\n[[Horizontal divider]]\nThis is an emoji line'],
    ['ordered descendants', '1. Parent\n    Nested paragraph\n    - Nested item\n2. Another item'],
    ['three levels', '- Parent\n    - Child\n        - Grandchild\nSibling'],
    ['nested bullet', '- Parent\n    - Nested\n- Leaf'],
    ['ordered hard break', '1. First\\\n   second\\\n   third'],
    ['bullet hard break', '- First\\\n  second'],
    ['task hard break', '- [x] First\\\n  second'],
  ])('%s stays fully expanded and gets no toggle', (_label, doc) => {
    const view = mount(doc);
    expect(toggleTextsByOwner(view)).toEqual([]);
    expect(view.dom.querySelector('.cm-foldPlaceholder')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    for (const line of doc.split('\n')) {
      expect(view.dom.querySelector('.cm-content')?.textContent).toContain(line.trim());
    }
  });
});
