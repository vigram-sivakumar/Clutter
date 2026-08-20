// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Extension } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { blockquoteMarkerDecoration } from '../highlight/blockquoteMarkerDecoration';
import { listMarkerDecoration } from '../highlight/listMarkerDecoration';
import { taskCheckboxDecorations } from './taskCheckboxDecorations';
import { taskLineIndent } from './taskLineIndent';

function mountView(doc: string, extraExtensions: Extension[] = []): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), taskCheckboxDecorations(), taskLineIndent(), ...extraExtensions],
  });
  return new EditorView({ state, parent });
}

function taskLineClasses(view: EditorView): string[] {
  return Array.from(view.dom.querySelectorAll('.cm-line')).map((l) => l.className);
}

describe('taskLineIndent', () => {
  it('adds the cm-task-line class to a line containing an unordered task', () => {
    const view = mountView('- [ ] Buy milk');

    expect(taskLineClasses(view)[0]).toContain('cm-task-line');
  });

  it('adds the cm-task-line class to a line containing an ordered task', () => {
    const view = mountView('1. [ ] Buy milk');

    expect(taskLineClasses(view)[0]).toContain('cm-task-line');
  });

  it('adds the class to every task line independently, including a nested task', () => {
    const view = mountView('- [ ] parent\n  - [x] nested');
    const classes = taskLineClasses(view);

    expect(classes).toHaveLength(2);
    expect(classes.every((c) => c.includes('cm-task-line'))).toBe(true);
  });

  it('adds the class regardless of checked state', () => {
    const view = mountView('- [x] done\n- [ ] not done');
    const classes = taskLineClasses(view);

    expect(classes).toHaveLength(2);
    expect(classes.every((c) => c.includes('cm-task-line'))).toBe(true);
  });

  it('does NOT add the class to a plain (non-task) list item', () => {
    const view = mountView('- plain item', [listMarkerDecoration()]);

    expect(taskLineClasses(view)[0]).not.toContain('cm-task-line');
  });

  it('does NOT add the class to an unrelated line — blockquote, heading, or plain paragraph', () => {
    const view = mountView('> quoted\n# Heading\nplain text', [blockquoteMarkerDecoration()]);

    expect(taskLineClasses(view).every((c) => !c.includes('cm-task-line'))).toBe(true);
  });

  it('is unconditional — the class stays applied whether or not the TaskMarker is currently engaged', () => {
    const text = 'Text before\n\n- [ ] Buy milk';
    const view = mountView(text);
    const taskLineIndex = 2;

    expect(taskLineClasses(view)[taskLineIndex]).toContain('cm-task-line');

    const taskMarkerPos = text.indexOf('[ ]') + 1;
    view.dispatch({ selection: { anchor: taskMarkerPos } }); // engage the TaskMarker

    expect(taskLineClasses(view)[taskLineIndex]).toContain('cm-task-line');
  });

  it('a line with a task and other tasks on later lines only decorates the lines that actually contain one', () => {
    const view = mountView('plain paragraph\n- [ ] task one\nplain again\n- [x] task two');
    const classes = taskLineClasses(view);

    expect(classes.map((c) => c.includes('cm-task-line'))).toEqual([false, true, false, true]);
  });
});
