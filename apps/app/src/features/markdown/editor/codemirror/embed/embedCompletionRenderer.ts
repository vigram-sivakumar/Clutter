import { setSelectedCompletion, selectedCompletionIndex } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { EmbedSuggestion } from './embedSuggestion';

// Reuses WikiLink's own popup row styling (`.wikilink-completion*` classes)
// wholesale — visually this is the same completion popup, one more row
// kind inside it, not a separate visual surface. Importing the stylesheet
// here (rather than only from wikilink/wikiLinkCompletionRenderer.ts) is
// safe and side-effect-idempotent: CSS module imports are deduplicated by
// the bundler regardless of how many files import the same one.
import '../wikilink/wikiLinkCompletion.css';

/**
 * The one property `embedCompletionSource.ts` adds on top of CM6's own
 * `Completion` shape — the Embed counterpart to
 * wikilink/wikiLinkCompletionRenderer.ts's `WikiLinkCompletion`.
 */
export interface EmbedCompletion extends Completion {
  readonly suggestion: EmbedSuggestion;
}

/**
 * `'suggestion' in completion` alone is not enough: `WikiLinkCompletion`
 * (wikilink/wikiLinkCompletionRenderer.ts) uses the exact same property
 * name for a different suggestion shape, and the shared `addToOptions`
 * array (completion.ts) calls every registered renderer against every
 * visible completion — checking `suggestion.kind` (this suggestion's own
 * discriminant, always `'resource'`, never `'page'`/`'create'`) is what
 * actually distinguishes an Embed-sourced completion from a WikiLink one,
 * not merely possessing the property. See wikiLinkCompletionRenderer.ts's
 * matching guard's own doc comment for the duplicate-row bug this fixes.
 */
function isEmbedCompletion(completion: Completion): completion is EmbedCompletion {
  return 'suggestion' in completion && (completion.suggestion as EmbedSuggestion).kind === 'resource';
}

// Inlined verbatim from `shared/icon/svg/image.svg` and `pdf.svg` — same
// reasoning wikiLinkCompletionRenderer.ts's own NOTE_ICON_SVG/PLUS_ICON_SVG
// already establish: `Completion.render` must return a plain DOM `Node`
// built synchronously outside React's own tree.
const IMAGE_ICON_SVG =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 9.5V11C14 12.6569 12.6569 14 11 14H5M14 9.5V5C14 3.34315 12.6569 2 11 2H5C3.34315 2 2 3.34315 2 5V11C2 12.6569 3.34315 14 5 14M14 9.5C11.8277 7.87077 8.73272 8.40092 7.2265 10.6603L5 14" stroke="currentColor" stroke-linecap="round"/><path d="M5.66666 6.66675C6.21895 6.66675 6.66666 6.21903 6.66666 5.66675C6.66666 5.11446 6.21895 4.66675 5.66666 4.66675C5.11438 4.66675 4.66666 5.11446 4.66666 5.66675C4.66666 6.21903 5.11438 6.66675 5.66666 6.66675Z" fill="currentColor" stroke-linecap="round"/></svg>';

const PDF_ICON_SVG =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 13.3571H3.11111C3.47947 13.3571 3.83274 13.2066 4.0932 12.9387C4.35367 12.6708 4.5 12.3075 4.5 11.9286C4.5 11.5497 4.35367 11.1863 4.0932 10.9184C3.83274 10.6505 3.47947 10.5 3.11111 10.5H2V14.5" stroke="currentColor" stroke-linecap="round"/><path d="M6.75 10.5V14.5H7.65909C8.08103 14.5 8.48568 14.2893 8.78403 13.9142C9.08239 13.5391 9.25 13.0304 9.25 12.5C9.25 11.9696 9.08239 11.4609 8.78403 11.0858C8.48568 10.7107 8.08103 10.5 7.65909 10.5H6.75Z" stroke="currentColor" stroke-linecap="round"/><path d="M11.5 14.5V12.4429M11.5 12.4429V10.5H14M11.5 12.4429H13.5238" stroke="currentColor" stroke-linecap="round"/><path d="M14 8.5V7V6M2 8.5V4C2 2.34315 3.34315 1 5 1H6H8H9M9 1V3C9 4.65685 10.3431 6 12 6H14M9 1C9.64029 1 10.2544 1.25435 10.7071 1.70711L13.2929 4.29289C13.7456 4.74565 14 5.35971 14 6" stroke="currentColor" stroke-linecap="round"/></svg>';

/**
 * `autocompletion()`'s `addToOptions[].render` hook — the Embed counterpart
 * to `renderWikiLinkCompletion`. See that function's own doc comment for
 * why this builds plain DOM rather than mounting a React component, why it
 * must return `null` for a completion it doesn't own (this popup is shared
 * across every registered source), and why hover moves CM6's own selection
 * rather than adding a second, CSS-only highlight state.
 */
export function renderEmbedCompletion(
  completion: Completion,
  _state: EditorState,
  view: EditorView
): HTMLElement | null {
  if (!isEmbedCompletion(completion)) {
    return null;
  }

  const { suggestion } = completion;

  const row = document.createElement('div');
  row.className = 'wikilink-completion';
  row.addEventListener('mouseenter', () => {
    const index = Number(row.parentElement?.id.split('-').pop());
    if (Number.isNaN(index) || selectedCompletionIndex(view.state) === index) {
      return;
    }
    view.dispatch({ effects: setSelectedCompletion(index) });
  });

  const icon = document.createElement('span');
  icon.className = 'wikilink-completion__icon';
  icon.innerHTML = suggestion.resourceKind === 'pdf' ? PDF_ICON_SVG : IMAGE_ICON_SVG;
  row.appendChild(icon);

  const content = document.createElement('div');
  content.className = 'wikilink-completion__content';

  const title = document.createElement('span');
  title.className = 'wikilink-completion__title';
  title.textContent = suggestion.title;
  content.appendChild(title);

  if (suggestion.breadcrumb) {
    const path = document.createElement('span');
    path.className = 'wikilink-completion__path';
    path.textContent = suggestion.breadcrumb.split('/').join(' / ');
    content.appendChild(path);
  }

  row.appendChild(content);
  return row;
}
