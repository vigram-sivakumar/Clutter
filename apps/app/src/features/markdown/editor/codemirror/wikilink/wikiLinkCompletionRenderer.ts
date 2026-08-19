import { setSelectedCompletion, selectedCompletionIndex } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { WikiLinkSuggestion } from './wikiLinkSuggestion';

import './wikiLinkCompletion.css';

/**
 * The one property `wikiLinkCompletionSource.ts` adds on top of CM6's own
 * `Completion` shape — lets `render` (below) recover the original
 * suggestion without re-deriving it from `label`/`detail` string parsing.
 */
export interface WikiLinkCompletion extends Completion {
  readonly suggestion: WikiLinkSuggestion;
}

/**
 * Inlined verbatim from `shared/icon/svg/note.svg` and `plus.svg` — the
 * exact same icons `AppIcon` renders elsewhere (`note` for an existing
 * page, `plus` for FolderPicker's own "Create ..." row), reused here as
 * raw markup rather than through `AppIcon` itself: `Completion.render`
 * must return a plain DOM `Node` built synchronously outside React's own
 * tree (docs/editor-architecture-decisions.md's WikiLink autocomplete
 * investigation — mounting a React component into CM6's popup would be a
 * second, competing render owner over DOM nodes CM6 itself mutates).
 */
const NOTE_ICON_SVG =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4C2 2.34315 3.34315 1 5 1H11C12.6569 1 14 2.34315 14 4V12C14 13.6569 12.6569 15 11 15H5C3.34315 15 2 13.6569 2 12V4Z" stroke="currentColor" stroke-linecap="round"/><path d="M5 8H11M5 11H11" stroke="currentColor" stroke-linecap="round"/><path d="M5 5H9H5" stroke="currentColor" stroke-linecap="round"/></svg>';

const PLUS_ICON_SVG =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3V13M3 8H13" stroke="currentColor" stroke-linecap="round"/></svg>';

/**
 * `autocompletion()`'s `addToOptions[].render` hook (there is no
 * per-`Completion` render field in this installed `@codemirror/autocomplete`
 * version — only one, config-level render callback, called synchronously
 * for each visible option). Builds plain DOM styled with
 * `wikiLinkCompletion.css`'s own classes, which reuse `Entry`'s design
 * tokens (`--entry-foreground`, `--entry-selected-surface`, etc.) for
 * visual consistency with FolderPicker/Entry — without importing `Entry`
 * itself, which owns its own click/keyboard/hover behavior that would
 * conflict with CM6 owning this popup's interaction entirely. CM6's own
 * default `.cm-completionLabel` element still renders alongside this
 * (there is no way to fully replace it, only add to it) — hidden via
 * `wikiLinkAutocompleteTheme()` since this node already carries the same
 * text plus the icon/breadcrumb it doesn't.
 */
export function renderWikiLinkCompletion(
  completion: Completion,
  _state: EditorState,
  view: EditorView
): HTMLElement {
  const { suggestion } = completion as WikiLinkCompletion;

  const row = document.createElement('div');
  row.className = 'wikilink-completion';
  // Mirrors FolderPicker's `onMouseEnter={() => keyboard.setActiveId(item.id)}`
  // (FolderPicker.tsx): hover moves CM6's own selection rather than adding a
  // second, CSS-only highlight state that can disagree with it. `li.id` is
  // `<tooltipId>-<index>` — the same convention CM6's own click handler
  // parses out of the DOM id (CompletionTooltip's `mousedown` listener).
  row.addEventListener('mouseenter', () => {
    const index = Number(row.parentElement?.id.split('-').pop());
    if (Number.isNaN(index) || selectedCompletionIndex(view.state) === index) {
      return;
    }
    view.dispatch({ effects: setSelectedCompletion(index) });
  });

  const icon = document.createElement('span');
  icon.className = 'wikilink-completion__icon';
  icon.innerHTML = suggestion.kind === 'create' ? PLUS_ICON_SVG : NOTE_ICON_SVG;
  row.appendChild(icon);

  const content = document.createElement('div');
  content.className = 'wikilink-completion__content';

  const title = document.createElement('span');
  title.className = 'wikilink-completion__title';

  // A 'create' suggestion's `path` is the literal typed text (e.g.
  // "Projects/Project A/Note") — display-only split on the last "/" into
  // name + breadcrumb, mirroring how a 'page' suggestion already shows
  // title + breadcrumb separately. `suggestion.path` itself is untouched:
  // `wikiLinkCompletionSource.ts`'s `apply()` still serializes the whole
  // original path, and `suggestion.create()` still creates it there.
  let breadcrumb: string | null;
  if (suggestion.kind === 'create') {
    const lastSlash = suggestion.path.lastIndexOf('/');
    const name = lastSlash === -1 ? suggestion.path : suggestion.path.slice(lastSlash + 1);
    breadcrumb = lastSlash === -1 ? null : suggestion.path.slice(0, lastSlash);
    title.textContent = `Create "${name}"`;
  } else {
    breadcrumb = suggestion.breadcrumb;
    title.textContent = suggestion.title;
  }
  content.appendChild(title);

  if (breadcrumb) {
    const path = document.createElement('span');
    path.className = 'wikilink-completion__path';
    path.textContent = breadcrumb.split('/').join(' / ');
    content.appendChild(path);
  }

  row.appendChild(content);
  return row;
}
