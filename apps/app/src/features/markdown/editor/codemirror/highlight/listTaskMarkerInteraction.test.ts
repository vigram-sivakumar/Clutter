// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { taskCheckboxDecorations } from '../task/taskCheckboxDecorations';
import { handleTaskCheckboxClick, taskCheckboxMouseHandlers } from '../task/taskCheckboxMouseHandlers';
import { listMarkerDecoration } from './listMarkerDecoration';

/**
 * Mounts both decorations together — the only way to observe the
 * interaction this file exists to test. `listMarkerDecoration.test.ts`
 * and `taskCheckboxDecorations.test.ts` each cover their own construct in
 * isolation and are left unchanged; this file covers the boundary
 * between them, per the locked product rule: "cursor entered the Task
 * line" != "TaskMarker is engaged" — only the latter should ever reveal
 * raw Markdown for a task.
 */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), listMarkerDecoration(), taskCheckboxDecorations(), taskCheckboxMouseHandlers()],
  });
  return new EditorView({ state, parent });
}

describe('ListMark vs Task ownership', () => {
  it('a normal unordered ListMark receives the bullet widget', () => {
    const text = 'plain paragraph\n\n- item one';
    const view = mountView(text, 5); // well outside the list item

    expect(view.dom.querySelector('.cm-bullet-list-marker')).not.toBeNull();
    expect(view.dom.querySelector('button[role="checkbox"]')).toBeNull();
  });

  it('a Task-owned ListMark does NOT receive the bullet widget', () => {
    const text = '- [ ] Task';
    const view = mountView(text, text.length); // outside the whole line

    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('-');
  });
});

describe('at rest: only the checkbox renders, never bullet + checkbox and never a bare dash', () => {
  it('unchecked task at rest renders only the checkbox', () => {
    const text = 'Text before\n\n- [ ] Task';
    const view = mountView(text, 5);

    const checkbox = view.dom.querySelector('button[role="checkbox"]');
    expect(checkbox?.getAttribute('aria-checked')).toBe('false');
    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).not.toContain('[');
  });

  it('checked task at rest renders only the checkbox', () => {
    const text = 'Text before\n\n- [x] Task';
    const view = mountView(text, 5);

    const checkbox = view.dom.querySelector('button[role="checkbox"]');
    expect(checkbox?.getAttribute('aria-checked')).toBe('true');
    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
  });

  it('nested task at rest also renders only its own checkbox, no bullet', () => {
    const text = '- [ ] parent\n  - [x] nested';
    const view = mountView(text, 0);
    view.dispatch({ selection: { anchor: text.length } }); // fully outside both

    expect(view.dom.querySelectorAll('button[role="checkbox"]')).toHaveLength(2);
    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
  });
});

describe('"cursor entered the Task line" != "TaskMarker is engaged"', () => {
  it('cursor inside the task TEXT (not TaskMarker) keeps the checkbox rendered — no raw "-" or "[ ]"', () => {
    const text = '- [ ] Task text here';
    const view = mountView(text);
    const textPos = text.indexOf('Task') + 2; // inside "Task", well past TaskMarker

    view.dispatch({ selection: { anchor: textPos } });

    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).not.toContain('[');
  });

  it('cursor inside an unchecked TaskMarker reveals "- [ ]" — both the ListMark and the checkbox raw text', () => {
    const text = '- [ ] Task';
    const view = mountView(text);
    const taskMarkerPos = text.indexOf('[ ]') + 1; // inside "[ ]"

    view.dispatch({ selection: { anchor: taskMarkerPos } });

    expect(view.dom.querySelector('button[role="checkbox"]')).toBeNull();
    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
    expect(view.dom.textContent).toBe('- [ ] Task');
  });

  it('cursor inside a checked TaskMarker reveals "- [x]"', () => {
    const text = '- [x] Task';
    const view = mountView(text);
    const taskMarkerPos = text.indexOf('[x]') + 1;

    view.dispatch({ selection: { anchor: taskMarkerPos } });

    expect(view.dom.querySelector('button[role="checkbox"]')).toBeNull();
    expect(view.dom.textContent).toBe('- [x] Task');
  });

  it('moving the cursor from TaskMarker back into task text restores the checkbox (and hides the ListMark again)', () => {
    const text = '- [ ] Task text here';
    const view = mountView(text);
    const taskMarkerPos = text.indexOf('[ ]') + 1;
    const textPos = text.indexOf('Task') + 2;

    view.dispatch({ selection: { anchor: taskMarkerPos } });
    expect(view.dom.textContent).toContain('- [ ]');

    view.dispatch({ selection: { anchor: textPos } });

    expect(view.dom.querySelector('button[role="checkbox"]')).not.toBeNull();
    expect(view.dom.querySelector('.cm-bullet-list-marker')).toBeNull();
    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).not.toContain('[');
  });

  it('nested tasks behave the same way: text-line cursor keeps the checkbox, TaskMarker cursor reveals raw syntax', () => {
    const text = '- [ ] parent\n  - [x] nested task text';
    const nestedTaskMarkerPos = text.indexOf('[x]') + 1;
    const nestedTextPos = text.indexOf('nested') + 2;

    const textEngaged = mountView(text);
    textEngaged.dispatch({ selection: { anchor: nestedTextPos } });
    expect(textEngaged.dom.querySelectorAll('button[role="checkbox"]')).toHaveLength(2);
    expect(textEngaged.dom.querySelector('.cm-bullet-list-marker')).toBeNull();

    const markerEngaged = mountView(text);
    markerEngaged.dispatch({ selection: { anchor: nestedTaskMarkerPos } });
    expect(markerEngaged.dom.textContent).toContain('- [x] nested');
    expect(markerEngaged.dom.querySelectorAll('button[role="checkbox"]')).toHaveLength(1); // only the parent's
  });
});

describe('clicking the checkbox never produces a mixed bullet/dash + checkbox state', () => {
  it('toggling unchecked -> checked leaves exactly one checkbox rendered, no ListMark widget or raw dash', () => {
    const text = '- [ ] Task';
    const view = mountView(text);

    const handled = handleTaskCheckboxClick(view, text.indexOf('[ ]') + 1, false);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [x] Task');
    const checkboxes = view.dom.querySelectorAll('button[role="checkbox"]');
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0]?.getAttribute('aria-checked')).toBe('true');
    expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(0);
    expect(view.dom.textContent).not.toContain('-');
  });

  it('toggling checked -> unchecked leaves exactly one checkbox rendered, no ListMark widget or raw dash', () => {
    const text = '- [x] Task';
    const view = mountView(text);

    const handled = handleTaskCheckboxClick(view, text.indexOf('[x]') + 1, false);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- [ ] Task');
    const checkboxes = view.dom.querySelectorAll('button[role="checkbox"]');
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0]?.getAttribute('aria-checked')).toBe('false');
    expect(view.dom.querySelectorAll('.cm-bullet-list-marker')).toHaveLength(0);
    expect(view.dom.textContent).not.toContain('-');
  });
});
