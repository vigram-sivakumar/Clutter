import type { ResolveWikiLink } from './codemirror/wikilink/wikiLinkResolution';
import type { GetWikiLinkSuggestions } from './codemirror/wikilink/wikiLinkSuggestion';

export interface MarkdownEditorProps {
  readonly markdown: string;
  /**
   * Fires on every content change (typing, paste, deletion) — commits into
   * the document session's Committed stage only, no persistence
   * (autosave-execution-model.md §3.1). Called unconditionally on every
   * document-changing transaction; the session's own no-op guard is what
   * filters out anything that isn't a real change, so this component
   * doesn't need its own diffing.
   */
  readonly onEdit?: (markdown: string) => void;
  /**
   * Fires on blur — a save request, not a payload (autosave-execution-model.md
   * §0): asks the system to make this session durable if it isn't already,
   * never carries content itself. The content to persist is always
   * whatever the session's own current revision holds by the time this
   * fires, per onEdit's own already-committed calls.
   */
  readonly onFlush?: () => void;
  /**
   * Resolves a WikiLink's target path (and optional local alias) into a
   * status, display label, and activation behavior — supplied entirely by
   * the feature/app layer. Accepted here (§5) but not yet consumed
   * anywhere in the component; the decoration layer that calls it is
   * introduced in §6.
   */
  readonly resolveWikiLink?: ResolveWikiLink;
  /**
   * Supplies WikiLink autocomplete candidates for a given in-progress
   * `[[query` — supplied entirely by the feature/app layer, same
   * injected-boundary shape as `resolveWikiLink` above. Accepted here but
   * only consumed once `wikiLinkAutocomplete()` is wired into the
   * extension list.
   */
  readonly getWikiLinkSuggestions?: GetWikiLinkSuggestions;
}

/**
 * Imperative handle for callers that need to move focus into an
 * already-mounted editor from outside — e.g. the page title's Enter key
 * advancing focus here. Mirrors EditableTextHandle's shape but is kept as
 * its own, separate type: MarkdownEditor isn't an EditableText, and a
 * one-method interface isn't worth cross-importing for.
 */
export interface MarkdownEditorHandle {
  focus(): void;
}
