import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { EditorView } from '@codemirror/view';

import {
  createEditorView,
  syncMarkdownIntoView,
} from './codemirror/createEditorView';
import { semanticCompletion } from './codemirror/completion';
// Visual decoration imports below are commented out alongside their usage
// further down — temporary keyboard-behavior-only configuration. See the
// disabling comments at each call site for what each one did and why it's
// safe to unwire. Nothing has been deleted or rewritten.
import { dateMouseHandlers } from './codemirror/date/dateMouseHandlers';
// import { emojiListMarkDecoration } from './codemirror/emoji-list/emojiListMarkDecoration';
import { formatShortcutsKeymap } from './codemirror/format/formatShortcutsKeymap';
import { blockquoteMarkerDecoration } from './codemirror/highlight/blockquoteMarkerDecoration';
// import { emphasisMarkerDecoration } from './codemirror/highlight/emphasisMarkerDecoration';
import { headingMarkerDecoration } from './codemirror/highlight/headingMarkerDecoration';
import { createInlineLivePreviewParticipants } from './codemirror/highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from './codemirror/highlight/inlineLivePreviewRegion';
import { linkMouseHandlers } from './codemirror/link/linkMouseHandlers';
import { urlMouseHandlers } from './codemirror/link/urlMouseHandlers';
// import { listMarkerDecoration } from './codemirror/highlight/listMarkerDecoration';
// The liveMarkDecoration-based marker decorations still dormant here
// (emphasis, strikethrough — plus blockquote/list, which stay on
// liveMarkDecoration permanently per ODR §4.10) carry the
// still-undecided liveMarkSelectionSnap transactionFilter. Heading is
// wired below (re-enabled alongside horizontalRuleDecoration) — its
// liveMarkSelectionSnap wiring comes bundled from the same
// liveMarkDecoration() factory call, unchanged. Highlight,
// InlineCode, Tag, and Date's own liveMarkDecoration/
// semanticTokenDecorations-based modules were retired outright (not left
// dormant) once inlineLivePreviewRegion() took over their inline
// visibility — see docs/editor-research/inline-live-preview-region-odr-v1.md.
// WikiLink's own at-rest widget went through the same path, but its
// engaged-state behavior now lives outside inlineLivePreviewRegion
// entirely, in wikiLinkLivePreview.ts (see that file's doc comment).
// import { strikethroughMarkerDecoration } from './codemirror/highlight/strikethroughMarkerDecoration';
import { horizontalRuleDecoration } from './codemirror/hr/horizontalRuleDecoration';
// import { listIndentWhitespaceDecoration } from './codemirror/list/listIndentWhitespaceDecoration';
// import { listLineDecoration } from './codemirror/list/listLineDecoration';
import { markdownLanguageExtension } from './codemirror/markdownLanguage';
// import { tableDecoration } from './codemirror/table/tableDecoration';
import { taskCheckboxMouseHandlers } from './codemirror/task/taskCheckboxMouseHandlers';
import { tagMouseHandlers } from './codemirror/tag/tagMouseHandlers';
import { wikiLinkAutocomplete } from './codemirror/wikilink/wikiLinkAutocomplete';
import { wikiLinkLivePreview } from './codemirror/wikilink/wikiLinkLivePreview';
import { wikiLinkMouseHandlers } from './codemirror/wikilink/wikiLinkMouseHandlers';
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from './MarkdownEditor.types';

export type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from './MarkdownEditor.types';
export type { ResolveDate, DateResolution } from './codemirror/date/dateResolution';
export type { ResolveTag, TagResolution } from './codemirror/tag/tagResolution';
export type { GetTagSuggestions } from './codemirror/tag/tagSuggestion';
export type {
  ResolveWikiLink,
  WikiLinkResolution,
} from './codemirror/wikilink/wikiLinkResolution';
export type {
  GetWikiLinkSuggestions,
  WikiLinkSuggestion,
  WikiLinkPageSuggestion,
  WikiLinkCreateSuggestion,
} from './codemirror/wikilink/wikiLinkSuggestion';
import './MarkdownEditor.css';

/**
 * Feature-level Markdown editing surface, backed by a CodeMirror 6
 * EditorView.
 *
 * Responsibilities:
 * - Present editable Markdown content.
 * - Own future editing interactions.
 * - Raise editing events to the application layer.
 * - Expose a stable editing API to feature components.
 *
 * Plain-text CM6 foundation (§2) + Markdown/GFM/WikiLink parsing (§3–§4) +
 * the injected WikiLink resolution boundary (§5) + at-rest WikiLink
 * rendering and atomic-range wiring (§6) + engagement/selection behavior
 * (§7, this step: mouse handlers, keyboard hop/activation, selection
 * snapping) are in place.
 */
export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    markdown,
    onEdit,
    onFlush,
    resolveWikiLink,
    getWikiLinkSuggestions,
    resolveTag,
    getTagSuggestions,
    resolveDate,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // The view's listeners are wired once at mount (below); these refs let
  // them always call whatever onEdit/onFlush is current on a given
  // render, the same freshness React's own onInput/onBlur props gave the
  // previous contentEditable implementation for free.
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  // Read by the decoration layer's ViewPlugin on every rebuild via the
  // accessor passed below — same freshness pattern as onEdit/onFlush,
  // now with an actual reader.
  const resolveWikiLinkRef = useRef(resolveWikiLink);
  resolveWikiLinkRef.current = resolveWikiLink;

  // Same freshness pattern, for the completion source's accessor below.
  const getWikiLinkSuggestionsRef = useRef(getWikiLinkSuggestions);
  getWikiLinkSuggestionsRef.current = getWikiLinkSuggestions;

  // Same freshness pattern as resolveWikiLinkRef above, for Tag's decoration/mouse/keymap accessor.
  const resolveTagRef = useRef(resolveTag);
  resolveTagRef.current = resolveTag;

  // Same freshness pattern, for Tag's completion source accessor below.
  const getTagSuggestionsRef = useRef(getTagSuggestions);
  getTagSuggestionsRef.current = getTagSuggestions;

  // Same freshness pattern, for Date's decoration/mouse/keymap accessor.
  const resolveDateRef = useRef(resolveDate);
  resolveDateRef.current = resolveDate;

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const view = createEditorView({
      doc: markdown,
      parent: container,
      extensions: [
        // Reset to CodeMirror's default keyboard behavior: no Clutter
        // Backspace/Delete/Enter/Tab/Shift-Tab/Arrow interception layered
        // on top of markdownLanguageExtension()'s own lang-markdown
        // defaults (deleteMarkupBackward, insertNewlineContinueMarkup,
        // etc.) or CM6's generic fallback keymap. Custom Markdown editing
        // behaviors are reintroduced incrementally later.
        markdownLanguageExtension(),
        // --- Temporarily unwired: purely visual Live Preview decorations ---
        // Every extension below this line, up to the next "--- end ---"
        // marker, was checked for behavioral coupling (keymap registration,
        // EditorView.atomicRanges, transactionFilter) before being disabled.
        // None of them have any — confirmed by grepping each file. Nothing
        // deleted or rewritten; uncomment to restore. See the accompanying
        // report for the full per-extension classification.
        // emphasisMarkerDecoration(),
        // The single authoritative inline Live Preview visibility
        // mechanism — Emphasis, StrongEmphasis, Strikethrough, Highlight,
        // InlineCode (marker-hiding), plus WikiLink, Tag, Date
        // (widget-replace, Phase 3) — per
        // docs/editor-research/inline-live-preview-region-odr-v1.md.
        // Replaces the previously separate per-construct plugins: an
        // independent traversal per construct could each decide
        // engagement only for its own node kinds, so a caret between an
        // outer and inner delimiter (`~~__Text__~~`) revealed the outer
        // construct while the inner stayed concealed. Visibility now
        // resolves per nested *region*, not per construct. Resolvers are
        // threaded through as stable getter closures (same freshness
        // pattern as onEdit/onFlush below), so the extension is never
        // rebuilt when a resolver changes. `atomicRanges` is derived from
        // the same single traversal, scoped to the widget-replace family
        // only (ODR §10 Phase 3) — ordinary marks never atomic, widgets
        // atomic only at rest. `Task` is deliberately not a participant:
        // its checkbox rendering is fused into block-level
        // listMarkerDecoration/'physical-line' engagement, out of scope
        // per ODR §4.10 (the ODR's own §10 Phase 3 text naming Task is a
        // recorded erratum, not implemented). Adding a participant is a
        // registry entry in inlineLivePreviewParticipants.ts — never a
        // change here or to another construct (ODR §4.8).
        inlineLivePreviewRegion(
          createInlineLivePreviewParticipants({
            resolveTag: () => resolveTagRef.current,
            resolveDate: () => resolveDateRef.current,
          })
        ),
        // WikiLink's own standalone visibility mechanism — not a
        // participant above. Its required behavior (the folder-qualified
        // path must never be visible, engaged or not) is not an instance
        // of inlineLivePreviewRegion's reveal-on-engage contract, so it
        // isn't governed by that shared traversal at all. See
        // wikilink/wikiLinkLivePreview.ts's own doc comment.
        wikiLinkLivePreview(() => resolveWikiLinkRef.current),
        // strikethroughMarkerDecoration(),
        // listMarkerDecoration(),
        // listLineDecoration(),
        // listIndentWhitespaceDecoration(),
        // emojiListMarkDecoration(),
        blockquoteMarkerDecoration(),
        headingMarkerDecoration(),
        // tok-heading1-6 content classing is now emitted directly by
        // inlineLivePreviewRegion() above (see its own doc comment) —
        // folded into the same shared decoration source rather than a
        // second, independent syntaxHighlighting() extension, so it
        // composes correctly with Highlight/Emphasis/Link/etc. nested
        // inside a heading. No separate registration needed here.
        horizontalRuleDecoration(),
        formatShortcutsKeymap(),
        // tableDecoration(),
        // --- end purely-visual decorations ---
        // Reuses the exact same onFlush callback already wired to blur
        // below (PageOperations.requestSave, via SaveCoordinator) — a
        // checkbox toggle is instant, single-click feedback a user expects
        // to see reflected everywhere (the sidebar) immediately, unlike
        // ordinary typing, which should keep using the normal debounced
        // autosave. See taskCheckboxActivation.ts's own doc comment.
        // Kept: mouse-driven checkbox toggle behavior. Harmless without its
        // visual widget (nothing to click), but it's a behavior handler,
        // not a decoration, so left wired per "preserve the behavioral
        // portion."
        taskCheckboxMouseHandlers(() => onFlushRef.current?.()),
        // Kept: click activation is product interaction (open/toggle),
        // not cursor behavior, and works independently of the decorations
        // above (it reads the syntax tree directly, not the rendered
        // widget). `*SelectionSnap()` was removed in the cursor/selection
        // behavior reset — it existed only to correct a drag-selection
        // endpoint landing inside an at-rest widget's rendered footprint,
        // which requires that widget to actually render; with the
        // decorations above off, it had nothing left to compensate for
        // and was overriding CM6's own default selection placement on
        // plain, fully-editable raw Markdown text. See
        // `semanticToken/tokenSelectionSnap.ts`'s own doc comment and
        // docs/editor-architecture-decisions.md for the full record.
        wikiLinkMouseHandlers(() => resolveWikiLinkRef.current),
        wikiLinkAutocomplete(),
        tagMouseHandlers(() => resolveTagRef.current),
        dateMouseHandlers(() => resolveDateRef.current),
        // Explicit Markdown Link ([label](url)) and bare-URL/Autolink
        // click-to-navigate — no injected resolver needed (unlike
        // WikiLink/Tag/Date), since opening a URL has no Vault/app-layer
        // dependency. See link/linkActivation.ts and link/urlActivation.ts.
        linkMouseHandlers(),
        urlMouseHandlers(),
        semanticCompletion(
          () => getWikiLinkSuggestionsRef.current,
          () => getTagSuggestionsRef.current
        ),
      ],
      onDocChange: (nextMarkdown) => onEditRef.current?.(nextMarkdown),
      onBlur: () => onFlushRef.current?.(),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mounted once; the markdown prop's initial value seeds the view
    // here, later changes are handled by the sync effect below — matches
    // the previous implementation, where the DOM node was likewise
    // created once by JSX and only ever updated via a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    // While this editor has focus, its own document is authoritative
    // over itself — a markdown prop update here is this same editor's
    // own committed content round-tripping back through
    // onDocChange->commit()->notify()->re-render, not an external
    // change. Overwriting it in that case would clobber in-progress
    // typing and reset CM6's own undo history. Only sync from the prop
    // while genuinely unfocused, exactly as the previous contentEditable
    // implementation did via document.activeElement.
    if (view.hasFocus) {
      return;
    }

    syncMarkdownIntoView(view, markdown);
  }, [markdown]);

  return <div ref={containerRef} />;
});
