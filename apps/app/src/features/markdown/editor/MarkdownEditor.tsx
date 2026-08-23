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
// import { dateDecorations } from './codemirror/date/dateDecorations';
import { dateMouseHandlers } from './codemirror/date/dateMouseHandlers';
import { dateSelectionSnap } from './codemirror/date/dateSelectionSnap';
// import { emojiListMarkDecoration } from './codemirror/emoji-list/emojiListMarkDecoration';
import { formatShortcutsKeymap } from './codemirror/format/formatShortcutsKeymap';
// import { blockquoteMarkerDecoration } from './codemirror/highlight/blockquoteMarkerDecoration';
// import { emphasisMarkerDecoration } from './codemirror/highlight/emphasisMarkerDecoration';
// import { highlightMarkerDecoration } from './codemirror/highlight/highlightMarkerDecoration';
// import { inlineCodeMarkerDecoration } from './codemirror/highlight/inlineCodeMarkerDecoration';
// import { listMarkerDecoration } from './codemirror/highlight/listMarkerDecoration';
// import { strikethroughMarkerDecoration } from './codemirror/highlight/strikethroughMarkerDecoration';
// import { horizontalRuleDecoration } from './codemirror/hr/horizontalRuleDecoration';
// import { listIndentWhitespaceDecoration } from './codemirror/list/listIndentWhitespaceDecoration';
// import { listLineDecoration } from './codemirror/list/listLineDecoration';
import { markdownLanguageExtension } from './codemirror/markdownLanguage';
// import { tableDecoration } from './codemirror/table/tableDecoration';
import { taskCheckboxMouseHandlers } from './codemirror/task/taskCheckboxMouseHandlers';
// import { tagDecorations } from './codemirror/tag/tagDecorations';
import { tagMouseHandlers } from './codemirror/tag/tagMouseHandlers';
import { tagSelectionSnap } from './codemirror/tag/tagSelectionSnap';
import { wikiLinkAutocomplete } from './codemirror/wikilink/wikiLinkAutocomplete';
// import { wikiLinkDecorations } from './codemirror/wikilink/wikiLinkDecorations';
// import { wikiLinkMarkerDecorations } from './codemirror/wikilink/wikiLinkMarkerDecorations';
import { wikiLinkMouseHandlers } from './codemirror/wikilink/wikiLinkMouseHandlers';
import { wikiLinkSelectionSnap } from './codemirror/wikilink/wikiLinkSelectionSnap';
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
        // strikethroughMarkerDecoration(),
        // highlightMarkerDecoration(),
        // inlineCodeMarkerDecoration(),
        // listMarkerDecoration(),
        // listLineDecoration(),
        // listIndentWhitespaceDecoration(),
        // emojiListMarkDecoration(),
        // blockquoteMarkerDecoration(),
        // horizontalRuleDecoration(),
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
        // wikiLinkDecorations(() => resolveWikiLinkRef.current),
        // wikiLinkMarkerDecorations(),
        // Kept alongside the other *MouseHandlers/*SelectionSnap below:
        // these are click/selection-correctness behavior tied to a visual
        // widget that no longer renders without the decorations above —
        // inert (nothing to click/snap around) but not themselves visual,
        // so left wired rather than touched. Arrow-key hop/activation
        // (the former *Keymap() extensions) is reset along with the rest
        // of the custom keyboard layer — see the top-of-array comment.
        wikiLinkMouseHandlers(() => resolveWikiLinkRef.current),
        wikiLinkSelectionSnap(),
        wikiLinkAutocomplete(),
        // tagDecorations(() => resolveTagRef.current),
        tagMouseHandlers(() => resolveTagRef.current),
        tagSelectionSnap(),
        // dateDecorations(() => resolveDateRef.current),
        dateMouseHandlers(() => resolveDateRef.current),
        dateSelectionSnap(),
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
