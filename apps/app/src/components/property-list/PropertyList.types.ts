import type { ReactNode } from 'react';

import type { GetTagSuggestions } from '@features/markdown/editor/codemirror/tag/tagSuggestion';

/**
 * A Property's editability, orthogonal to its type. Supplied explicitly by
 * the adapter that builds the items (e.g. buildPageProperties) — the UI only
 * consumes it, and never infers it from `type` or `name`. An editable item
 * always carries the commit callback that makes the edit go somewhere.
 */
export type PropertyEditability<Value> =
  | { editable: false }
  | { editable: true; onCommit(value: Value): void };

/** For types whose value editor doesn't exist yet — only read-only is allowed until it does. */
type ReadOnlyProperty = { editable: false };

export type PropertyListItem =
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
  | ({ name: string; type: 'multi-select'; value: readonly string[] } & ReadOnlyProperty)
  | ({ name: string; type: 'boolean'; value: ReactNode } & ReadOnlyProperty);

export type PropertyListItemOf<Type extends PropertyListItem['type']> = Extract<
  PropertyListItem,
  { type: Type }
>;
