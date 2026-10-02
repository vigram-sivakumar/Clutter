import type { GetTagSuggestions } from '@features/markdown/editor/codemirror/tag/tagSuggestion';

/**
 * A Property's editability, orthogonal to its type. Supplied explicitly by
 * the adapter that builds the items (e.g. buildPageProperties) — the UI only
 * consumes it, and never infers it from `type` or `name`. An editable item
 * always carries the commit callback that makes the edit go somewhere.
 */
/** One `multi-select` autocomplete row. */
export interface MultiSelectSuggestion {
  /** Stable React key for the row. */
  readonly key: string;
  /** The text added as a value when the row is picked. */
  readonly value: string;
  /** The row's primary text. */
  readonly label: string;
  /** Secondary text after the label (e.g. the page it came from), or null. */
  readonly detail: string | null;
}

export type PropertyEditability<Value> =
  | { editable: false }
  | { editable: true; onCommit(value: Value): void };

/**
 * A Property's name editability, orthogonal to its type and value, and
 * like value editability decided by the adapter — never inferred here.
 * Present: the name is inline-editable text (EditableText); `onRename`
 * receives the edited name and returns false to reject it (the field then
 * keeps editing with EditableText's reject shake on Enter, or restores
 * the name on blur). Absent: the name is plain text — every system
 * Property's.
 */
export type PropertyNameEditability = { onRename?(name: string): boolean };

export type PropertyListItem = PropertyNameEditability & PropertyListItemByType;

type PropertyListItemByType =
  | ({ name: string; type: 'text'; value: string } & PropertyEditability<string>)
  | ({
      name: string;
      type: 'date';
      /** Raw stored value (see Property.types' PropertyValue), or null when absent. */
      value: string | null;
    } & PropertyEditability<string | null>)
  | ({
      name: string;
      type: 'tag';
      /** Tag names without their `#`, in order — as frontmatter `tags` stores them. */
      value: readonly string[];
      /**
       * Existing-tag search for autocomplete while typing — the editor's own
       * `GetTagSuggestions` (createTagSuggester over the vault), injected by
       * the adapter. Omitted: no suggestions, typing still adds tags.
       */
      getSuggestions?: GetTagSuggestions;
      /**
       * Opens a tag's Tag Collection — the same navigation clicking an
       * inline `#tag` in the editor does — when its pill is clicked.
       * Omitted: pills aren't clickable.
       */
      onOpenTag?(name: string): void;
    } & PropertyEditability<string[]>)
  | ({
      name: string;
      type: 'url';
      /** The URL exactly as entered (a bare domain stays bare), or null when absent. */
      value: string | null;
    } & PropertyEditability<string | null>)
  | ({
      name: string;
      type: 'number';
      /** The numeric value itself (formatting is display only), or null when absent. */
      value: number | null;
    } & PropertyEditability<number | null>)
  | ({
      name: string;
      type: 'multi-select';
      /** Free-text values in order, shown as pills (e.g. Aliases). */
      value: readonly string[];
      /**
       * Autocomplete while typing — matches for the typed text (already
       * trimmed, non-empty), injected by the adapter (e.g. Aliases: pages
       * found by title or alias). Omitted: no suggestions, typing still
       * adds values.
       */
      getSuggestions?(query: string): readonly MultiSelectSuggestion[];
    } & PropertyEditability<string[]>)
  | ({ name: string; type: 'boolean'; value: boolean } & PropertyEditability<boolean>);

export type PropertyListItemOf<Type extends PropertyListItem['type']> = Extract<
  PropertyListItem,
  { type: Type }
>;
