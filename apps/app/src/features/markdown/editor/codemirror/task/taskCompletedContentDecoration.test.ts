// @vitest-environment jsdom
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { taskCompletedContentDecoration } from './taskCompletedContentDecoration';
import { isNodeOnCompletedTask, TASK_COMPLETED_CLASS } from './taskEngagement';

/**
 * Coverage for docs/editor-architecture-decisions.md's "Inline formatting
 * composition at the token level" entry, extended to editor/task state: a
 * completed task's rendered content must carry `cm-task-completed`,
 * replacing the old `.cm-line:has(.cm-task-checkbox[aria-checked='true'])`
 * line-level CSS rule.
 *
 * **Sole source of the class as of 2026-09-13**: this file's own ancestor
 * `Decoration.mark` is now the *only* place `cm-task-completed` is ever
 * applied — a direct, additional composition onto the WikiLink/Tag/Date
 * widget family's own root elements used to also exist
 * (`inlineLivePreviewParticipants.ts`'s `widgetReplaceRenderer`,
 * `wikilink/wikiLinkLivePreview.ts`), but was removed: it put the class on
 * two nested elements for the same logical occurrence (this mark's own
 * wrapping `<span>` *and* the widget's own root), which compounds
 * `opacity`/`color-mix(... currentColor ...)`-style styling in a way
 * plain CSS specificity can't resolve. `inlineLivePreviewRegion.test.ts`
 * (Tag/Date) and `wikilink/wikiLinkLivePreview.test.ts` (WikiLink) now
 * assert the negative — those widgets never carry the class directly —
 * while this file covers the one real source: the ancestor mark, and the
 * shared `isNodeOnCompletedTask` state source it consumes.
 */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), taskCompletedContentDecoration()],
  });
  return new EditorView({ state, parent });
}

describe('taskCompletedContentDecoration', () => {
  it('- [x] Task: the rendered text carries cm-task-completed', () => {
    const view = mountView('- [x] Task');
    const marked = view.dom.querySelector(`.${TASK_COMPLETED_CLASS}`);
    expect(marked).not.toBeNull();
    // The content range starts right after the 3-char `[x]` marker, which
    // includes the required separating space before "Task" — the mark
    // covers the real document range, not a trimmed label.
    expect(marked?.textContent).toBe(' Task');
  });

  it('- [ ] Task: an unchecked task never receives cm-task-completed', () => {
    const view = mountView('- [ ] Task');
    expect(view.dom.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('plain, non-task content never receives cm-task-completed', () => {
    const view = mountView('Just a paragraph, no list at all.');
    expect(view.dom.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('an ordinary (non-task) list item never receives cm-task-completed', () => {
    const view = mountView('- Just a bullet, not a task');
    expect(view.dom.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('task-completion does not leak to an unrelated paragraph on a later line', () => {
    // Blank line ends the list (CommonMark), so the second paragraph is
    // genuinely independent — not lazy-continuation of the task item's
    // own content, which a bare single newline would be.
    const view = mountView('- [x] Done\n\nNot part of the task at all.');
    const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
    expect(lines[0]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).not.toBeNull();
    for (const line of lines.slice(1)) {
      expect(line.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
    }
  });

  it('task-completion does not leak to a sibling unchecked task', () => {
    const view = mountView('- [x] Done\n- [ ] Not done');
    const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
    expect(lines[0]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).not.toBeNull();
    expect(lines[1]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('an empty completed task (- [x] with no content) decorates nothing — no content range to mark', () => {
    expect(() => mountView('- [x]')).not.toThrow();
    const view = mountView('- [x]');
    expect(view.dom.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('nested formatting inside a completed task is still visible as plain text, wrapped by the completed-task mark', () => {
    const view = mountView('- [x] plain **bold** plain');
    const marked = view.dom.querySelector(`.${TASK_COMPLETED_CLASS}`);
    expect(marked).not.toBeNull();
    expect(marked?.textContent).toContain('bold');
  });
});

/**
 * Direct unit coverage for `isNodeOnCompletedTask` itself — the pure
 * (tree + document-text, no DOM) state source both widget renderers and
 * this file's own decoration consume. Exercised against the syntax tree
 * alone, mirroring `inlineLivePreviewParticipants.test.ts`'s
 * `collectActiveInlineClasses` coverage.
 */
function nodeAt(doc: string, nodeName: string) {
  const state = EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
  const tree = ensureSyntaxTree(state, doc.length) ?? syntaxTree(state);
  let found: ReturnType<typeof tree.resolve> | null = null;
  tree.iterate({
    enter: (node) => {
      if (!found && node.name === nodeName) {
        found = node.node;
      }
    },
  });
  if (!found) {
    throw new Error(`no ${nodeName} node found in ${JSON.stringify(doc)}`);
  }
  return { node: found as NonNullable<typeof found>, state };
}

describe('isNodeOnCompletedTask', () => {
  it('true for a node inside a checked task', () => {
    const { node, state } = nodeAt('- [x] **bold**', 'EmphasisMark');
    expect(isNodeOnCompletedTask(node, state)).toBe(true);
  });

  it('false for a node inside an unchecked task', () => {
    const { node, state } = nodeAt('- [ ] **bold**', 'EmphasisMark');
    expect(isNodeOnCompletedTask(node, state)).toBe(false);
  });

  it('false for a node with no enclosing Task at all', () => {
    const { node, state } = nodeAt('plain **bold** text', 'EmphasisMark');
    expect(isNodeOnCompletedTask(node, state)).toBe(false);
  });

  it('true arbitrarily deep under ordinary delimited-mark constructs', () => {
    const { node, state } = nodeAt('- [x] ~~**x**~~', 'StrikethroughMark');
    expect(isNodeOnCompletedTask(node, state)).toBe(true);
  });
});
