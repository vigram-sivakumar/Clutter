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

  it('genuinely nested (indented) content under a completed task keeps the completed-task styling, but a following unindented sibling does not', () => {
    const view = mountView('- [x] Done\n    Nested continuation\nSibling paragraph');
    const lines = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'));
    expect(lines).toHaveLength(3);
    expect(lines[0]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).not.toBeNull();
    expect(lines[1]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).not.toBeNull();
    expect(lines[2]!.querySelector(`.${TASK_COMPLETED_CLASS}`)).toBeNull();
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
