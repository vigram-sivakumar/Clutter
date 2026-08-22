// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { taskCheckboxDecorations } from './taskCheckboxDecorations';

/** Mirrors dateDecorations.test.ts / headingMarkerDecoration.test.ts's "at rest" convention — a leading "Text before " prefix keeps position 0 outside the node, avoiding the boundary-inclusive-engagement trap. */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), taskCheckboxDecorations()],
  });
  return new EditorView({ state, parent });
}

function mountAtRest(line: string): EditorView {
  return mountView(`Text before\n\n${line}`);
}

describe('taskCheckboxDecorations — at-rest rendering', () => {
  it('renders an at-rest [ ] TaskMarker as an interactive checkbox widget, not the raw text', () => {
    const view = mountAtRest('- [ ] Buy milk');

    const checkbox = view.dom.querySelector('button[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox?.getAttribute('aria-checked')).toBe('false');
    expect(view.dom.textContent).not.toContain('[ ]');
  });

  it('also carries the shared cm-list-marker class alongside cm-task-checkbox', () => {
    const view = mountAtRest('- [ ] Buy milk');

    const checkbox = view.dom.querySelector('button[role="checkbox"]');
    expect(checkbox?.classList.contains('cm-list-marker')).toBe(true);
    expect(checkbox?.classList.contains('cm-task-checkbox')).toBe(true);
  });

  it('renders an at-rest [x] TaskMarker as a checked checkbox widget', () => {
    const view = mountAtRest('- [x] Buy milk');

    const checkbox = view.dom.querySelector('button[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');
    expect(checkbox?.className).toContain('checkbox--checked');
  });

  it('renders an at-rest [X] TaskMarker (uppercase) as checked too — lenient reader', () => {
    const view = mountAtRest('- [X] Buy milk');

    const checkbox = view.dom.querySelector('button[role="checkbox"]');
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');
  });

  it('multiple task items each render their own independent checkbox widget', () => {
    const view = mountAtRest('- [ ] first\n- [x] second\n- [ ] third');

    const checkboxes = view.dom.querySelectorAll('button[role="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    expect(Array.from(checkboxes).map((c) => c.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('nested task lists: each level renders its own checkbox widget with the correct state', () => {
    const view = mountAtRest('- [ ] parent\n  - [x] nested');

    const checkboxes = view.dom.querySelectorAll('button[role="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(Array.from(checkboxes).map((c) => c.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
    ]);
  });

  it('an ordered-list task item renders a checkbox widget the same way a bullet task does', () => {
    const view = mountAtRest('1. [ ] first task');

    const checkbox = view.dom.querySelector('button[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    expect(checkbox?.getAttribute('aria-checked')).toBe('false');
  });

  it('a plain (non-task) list marker is completely unaffected — no checkbox, no raw TaskMarker text', () => {
    const view = mountAtRest('- plain item, no checkbox');

    expect(view.dom.querySelector('button[role="checkbox"]')).toBeNull();
    expect(view.dom.textContent).toContain('plain item, no checkbox');
  });
});

describe('taskCheckboxDecorations — lazy continuation does not affect TaskMarker engagement', () => {
  it('nested task + lazy continuation: TaskMarker uses its own fixed range, unaffected by the enclosing Task node absorbing a later marker-less line', () => {
    const text = '- [ ] parent\n  - [ ] nested\n=';
    const view = mountView(text);
    view.dispatch({ selection: { anchor: text.indexOf('=') } }); // on the lazy-continuation line

    const checkboxes = view.dom.querySelectorAll('button[role="checkbox"]');
    expect(checkboxes).toHaveLength(2); // both stay at rest as widgets
  });

  it('"- [ ] task\\n=": cursor on the "=" line leaves the checkbox at rest', () => {
    const text = '- [ ] task\n=';
    const view = mountView(text);
    view.dispatch({ selection: { anchor: text.indexOf('=') } });

    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
  });
});

describe('taskCheckboxDecorations — never reveals raw text on engagement (alwaysAtRest)', () => {
  it('cursor inside the TaskMarker still renders the checkbox widget, not raw "[ ]" text', () => {
    const line = '- [ ] Buy milk';
    const view = mountView(`Text before\n\n${line}`);
    const lineStart = `Text before\n\n`.length;
    const taskMarkerStart = lineStart + '- '.length;

    view.dispatch({ selection: { anchor: taskMarkerStart + 1 } }); // inside "[ ]"

    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('[ ]');
  });

  it('stays the widget whether the selection is inside the TaskMarker or elsewhere', () => {
    const line = '- [ ] Buy milk';
    const view = mountView(`Text before\n\n${line}`);
    const lineStart = `Text before\n\n`.length;
    const taskMarkerStart = lineStart + '- '.length;

    view.dispatch({ selection: { anchor: taskMarkerStart + 1 } });
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();

    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('[ ]');
  });

  it('falls back to plain text only once the syntax breaks — deleting "[" leaves no TaskMarker to decorate', () => {
    const line = '- [ ] Buy milk';
    const view = mountView(`Text before\n\n${line}`);
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();

    const openBracketPos = view.state.doc.toString().indexOf('[');
    view.dispatch({ changes: { from: openBracketPos, to: openBracketPos + 1, insert: '' } });

    expect(view.dom.querySelector('button[role="checkbox"]')).toBeNull();
  });
});
