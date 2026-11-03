// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { markdownLanguageExtension } from '../markdownLanguage';
import { taskCompletedContentDecoration } from './taskCompletedContentDecoration';
import { TASK_COMPLETED_CLASS } from './taskEngagement';
import { embedLivePreview } from '../embed/embedLivePreview';
import type { ResolveEmbedImage } from '../embed/embedImageResolution';
import type { ResolveEmbedPdf } from '../pdf/embedPdfResolution';
import type { PageEmbedResolution, ResolvePageEmbed } from '../../../render/blocks/pageEmbedResolution';

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
 * while this file covers the one real source: the ancestor mark.
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

  /**
   * Regression coverage for the 2026-09-15 dimming bug: `buildDecorations`
   * used to trust the `Task` node's raw `.to` directly, which CommonMark
   * lazy continuation can inflate past the task's own line — the *exact*
   * boundary problem `listItemFoldService.ts` already found and fixed for
   * folding. Every test in this block uses a **single newline, no blank
   * line** between the task and the following content — the lazy-
   * continuation-triggering shape the earlier "does not leak... on a later
   * line" test (blank-line-separated, genuinely independent per CommonMark)
   * does not exercise at all.
   */
  it('task-completion does not leak to an unrelated paragraph with no blank line before it (lazy continuation)', () => {
    const view = mountView('- [x] Done\nNot part of the task at all.');
    const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
    expect(lines).toHaveLength(2);
    expect(lines[0]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).not.toBeNull();
    expect(lines[1]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('task-completion does not leak across several unrelated lazy-continued block types at once', () => {
    const view = mountView(
      ['- [x] Done', 'A plain paragraph', '# A heading', '- another bullet', '1. an ordered item'].join('\n')
    );
    const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
    expect(lines[0]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).not.toBeNull();
    for (const line of lines.slice(1)) {
      expect(line.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
    }
  });

  it('indented continuation content under a completed task keeps its normal styling; only the task\'s own line is marked', () => {
    const view = mountView('- [x] Done\n    Nested continuation\nSibling paragraph');
    const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
    expect(lines).toHaveLength(3);
    expect(lines[0]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).not.toBeNull();
    expect(lines[1]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
    expect(lines[2]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });
});

/**
 * Ownership: `cm-task-completed` covers only the task's own marker-line text, never continuation content of
 * the same list item. Asserted on the generated DOM, line by line.
 */
describe('taskCompletedContentDecoration — continuation ownership', () => {
  function rows(doc: string): HTMLElement[] {
    return Array.from(mountView(doc).dom.querySelectorAll<HTMLElement>('.cm-line'));
  }
  const marked = (row: HTMLElement) => row.querySelector(`.${TASK_COMPLETED_CLASS}`) !== null;

  it('a completed task with no continuation content is marked', () => {
    expect(rows('- [x] Done').map(marked)).toEqual([true]);
  });

  it('one continuation paragraph is not marked', () => {
    expect(rows('- [x] Done\n\n    Second paragraph').map(marked)).toEqual([true, false, false]);
    expect(rows('- [x] Done\n    Second paragraph').map(marked)).toEqual([true, false]);
  });

  it('several continuation paragraphs and rows are not marked', () => {
    const doc = '- [x] Done\n    row two\n    row three\n\n    para two\n\n    para three';
    const r = rows(doc);
    expect(marked(r[0]!)).toBe(true);
    expect(r.slice(1).map(marked).every((m) => !m)).toBe(true);
  });

  it('links and mentions on continuation lines are not marked; the task line itself still is', () => {
    const doc = '- [x] Done @Pratik\n    Hi @Harsh see https://example.com/x and [[Note]]\n    more https://example.com';
    const r = rows(doc);
    expect(marked(r[0]!)).toBe(true);
    expect(r.slice(1).map(marked)).toEqual([false, false]);
  });

  it('an incomplete task with continuation paragraphs marks nothing', () => {
    expect(rows('- [ ] Open\n    row\n\n    para').map(marked)).toEqual([false, false, false, false]);
  });

  it('nested completed tasks mark only their own lines, and a parent\'s continuation stays unmarked', () => {
    const doc = '- [x] Parent\n    parent continuation\n    - [x] Child\n        child continuation\n    - [ ] Open child';
    expect(rows(doc).map(marked)).toEqual([true, false, true, false, false]);
  });

  it('a completed task under an incomplete parent is marked alone', () => {
    expect(rows('- [ ] Parent\n    - [x] Child\n    - [ ] Other').map(marked)).toEqual([false, true, false]);
  });

  it('among several tasks, only the completed one is marked', () => {
    expect(rows('- [ ] a\n- [x] b\n    b continuation\n- [ ] c').map(marked)).toEqual([false, true, false, false]);
  });
});

/**
 * The reported symptom itself: a note embed sitting on a lazily-continued
 * line right after a completed task must never render inside (or under)
 * the `.cm-task-completed` ancestor mark — confirmed at the DOM level,
 * not just by range math, since the actual bug was CM6 composing the
 * (over-wide) mark and the embed's `Decoration.replace` into nested DOM.
 */
describe('taskCompletedContentDecoration — embed adjacency', () => {
  const declineImage: ResolveEmbedImage = () => ({ status: 'unresolved', alt: '' });
  const declinePdf: ResolveEmbedPdf = () => ({ status: 'non-pdf' });

  function resolverFor(pages: Record<string, PageEmbedResolution>): ResolvePageEmbed {
    return (path) => pages[path] ?? { status: 'unresolved', displayLabel: path };
  }

  function mountWithEmbed(doc: string): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const resolvePageEmbed = resolverFor({
      Target: { status: 'resolved', pageId: 'page-target', title: 'Target', markdown: 'Body.', icon: 'note', emoji: null },
    });
    const state = EditorState.create({
      doc,
      extensions: [
        markdownLanguageExtension(),
        taskCompletedContentDecoration(),
        embedLivePreview({
          hostPageId: 'test-host-page',
          resolveEmbedImage: () => declineImage,
          onImageClick: () => undefined,
          onOpenImageMenu: () => undefined,
          resolveEmbedPdf: () => declinePdf,
          onPdfEmbedClick: () => undefined,
          onOpenPdfMenu: () => undefined,
          resolvePageEmbed: () => resolvePageEmbed,
          onOpenPage: () => undefined,
          onOpenNoteEmbedMenu: () => undefined,
        }),
      ],
    });
    return new EditorView({ state, parent });
  }

  it('an embed lazily continued right after a completed task (no blank line) is never nested inside cm-task-completed', () => {
    const view = mountWithEmbed('- [x] Done\n![[Target]]');
    const embedWidget = view.dom.querySelector('.cm-note-embed');
    expect(embedWidget).not.toBeNull();
    expect(embedWidget!.closest(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('the same embed with a blank line before it (genuinely independent per CommonMark) is also never nested inside cm-task-completed', () => {
    const view = mountWithEmbed('- [x] Done\n\n![[Target]]');
    const embedWidget = view.dom.querySelector('.cm-note-embed');
    expect(embedWidget).not.toBeNull();
    expect(embedWidget!.closest(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });

  it('control case: the same embed with no task anywhere in the document never sits inside cm-task-completed (it does not exist at all)', () => {
    const view = mountWithEmbed('![[Target]]');
    const embedWidget = view.dom.querySelector('.cm-note-embed');
    expect(embedWidget).not.toBeNull();
    expect(view.dom.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
  });
});
