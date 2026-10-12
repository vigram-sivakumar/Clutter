import { useEffect, useRef } from 'react';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { buildEditorExtensions } from '@features/markdown/editor/codemirror/buildEditorExtensions';
import {
  createEditorView,
  syncMarkdownIntoView,
} from '@features/markdown/editor/codemirror/createEditorView';
import type { ResolveEmbedImage } from '@features/markdown/editor/codemirror/embed/embedImageResolution';
import type { ResolveImageSrc } from '@features/markdown/editor/codemirror/image/imageSrcResolution';
import type { ResolveEmbedPdf } from '@features/markdown/editor/codemirror/pdf/embedPdfResolution';
import type { ResolveDate } from '@features/markdown/editor/codemirror/date/dateResolution';
import type { ResolveTag } from '@features/markdown/editor/codemirror/tag/tagResolution';
import type { ResolveWikiLink } from '@features/markdown/editor/codemirror/wikilink/wikiLinkResolution';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';

/** How deep a note embed inside a preview may nest: the embed itself renders, anything it embeds does not. */
const PREVIEW_MAX_EMBED_DEPTH = 1;

/** The resolvers the editor's rendering reads — the same ones the page editor is handed. Any may be absent. */
export interface ReferencePreviewContext {
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveDate?: ResolveDate;
  readonly resolveEmbedImage?: ResolveEmbedImage;
  readonly resolveEmbedPdf?: ResolveEmbedPdf;
  readonly resolveImageSrc?: ResolveImageSrc;
  readonly resolvePageEmbed?: ResolvePageEmbed;
}

const noop = () => undefined;

/**
 * The extension list every reference preview shares: the editor's own read-only list
 * (`buildEditorExtensions({ readOnly: true })`: rendering and table extensions, none of the editing ones), and
 * one attribute override.
 *
 * Built once per References section, not per preview — a CodeMirror extension is an immutable configuration;
 * every per-view value (document, selection, decoration sets, widget state) lives in each view's own
 * `EditorState`, so one list serves any number of views without coupling them. (Measured: building it per
 * view retained far more memory after the views were destroyed than sharing it.) The resolvers are read
 * through `getContext` at the moment they are used, so a re-render never needs a new list.
 */
export function createReferencePreviewExtensions(
  getContext: () => ReferencePreviewContext
): Extension[] {
  return [
    ...buildEditorExtensions({
      readOnly: true,
      resolveWikiLink: () => getContext().resolveWikiLink,
      resolveTag: () => getContext().resolveTag,
      resolveDate: () => getContext().resolveDate,
      resolveEmbedImage: () => getContext().resolveEmbedImage,
      resolveEmbedPdf: () => getContext().resolveEmbedPdf,
      resolveImageSrc: () => getContext().resolveImageSrc,
      resolvePageEmbed: () => getContext().resolvePageEmbed,
      // A preview offers nothing to click: no image overlay, no PDF viewer, no menus, no "open note" — the entry
      // around it is the one navigation target.
      onImageClick: noop,
      onOpenImageMenu: noop,
      onPdfEmbedClick: noop,
      onOpenPdfMenu: noop,
      maxEmbedDepth: PREVIEW_MAX_EMBED_DEPTH,
      // Only keys fold/collapse persistence, which a preview does not have (`getFoldStateStore` is omitted).
      hostPageId: 'references-preview',
    }),
    // CodeMirror marks every content element `role="textbox"`, editable or not. A preview is not a text box: as
    // `presentation` its text flows into the accessible name of the entry button around it.
    EditorView.contentAttributes.of({ role: 'presentation' }),
  ];
}

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';

/**
 * Takes everything focusable inside `root` out of the tab order. The editor's widgets draw real buttons (a code
 * block's Copy, an embed's Expand/collapse, media controls); in a preview they are unreachable by pointer, so
 * they must not be reachable by keyboard either — the entry around the preview is its one tab stop.
 */
function removeFromTabOrder(root: HTMLElement): void {
  for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (element.tabIndex >= 0) {
      element.tabIndex = -1;
    }
  }
}

/** Gives a completed task's text the editor's own completed styling (`.cm-editor .cm-task-completed`). */
const COMPLETED_TASK = EditorView.contentAttributes.of({
  class: 'cm-task-completed',
});

interface ReferencePreviewProps {
  /** The Markdown to show: a complete block (or a task's text), rendered exactly as the editor renders it. */
  readonly markdown: string;
  /** `createReferencePreviewExtensions()`'s list, shared by every preview in the section. */
  readonly extensions: readonly Extension[];
  /** A completed task. Recreates the view, since it changes which extensions it carries. */
  readonly isCompleted?: boolean;
}

/**
 * A permanently read-only CodeMirror view of one reference's Markdown, built through the same
 * `createEditorView`/`buildEditorExtensions` the page editor and note embeds use — so it looks like the note,
 * from the same decorations and CSS, not from a second renderer. No history, no folding, no focus, no
 * interaction (see `Reference.css`: the entry around it receives every click).
 *
 * One view per mounted preview: created on mount, destroyed on unmount. A changed `markdown` is applied to the
 * live view with `syncMarkdownIntoView` (an `externalSync` change outside undo history, the same mechanism a
 * read-only archived note uses) rather than rebuilding it.
 */
export function ReferencePreview({
  markdown,
  extensions,
  isCompleted = false,
}: ReferencePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;

  useEffect(() => {
    const parent = hostRef.current;

    if (!parent) {
      return;
    }

    const view = createEditorView({
      doc: markdownRef.current,
      parent,
      readOnly: true,
      enableHistory: false,
      enableFolding: false,
      extensions: isCompleted ? [...extensions, COMPLETED_TASK] : extensions,
    });
    viewRef.current = view;

    // Widgets are drawn as the document or viewport changes (and inside nested embeds), so keep them out too.
    removeFromTabOrder(parent);
    const keepOut = new MutationObserver(() => removeFromTabOrder(parent));
    keepOut.observe(parent, { childList: true, subtree: true });

    return () => {
      keepOut.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions, isCompleted]);

  useEffect(() => {
    if (viewRef.current) {
      syncMarkdownIntoView(viewRef.current, markdown);
    }
  }, [markdown]);

  // `.markdown__editor` is what scopes the editor's CSS; Reference.css undoes its page-column layout.
  // `reference-entry__body` makes this the entry's body element, as the compact text is when there is no preview.
  return (
    <div
      ref={hostRef}
      className="reference-preview markdown__editor reference-entry__body"
    />
  );
}
