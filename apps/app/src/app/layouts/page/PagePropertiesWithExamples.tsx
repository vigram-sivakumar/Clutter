import { useState } from 'react';

import { PropertyList } from '@components/property-list/PropertyList';
import type { Page } from '@core/vault/models/Page';
import type { GetTagSuggestions } from '@features/markdown/editor/codemirror/tag/tagSuggestion';

import { buildPageProperties } from './buildPageProperties';

/**
 * TEMPORARY — testing scaffold for the Property value editors while they're
 * being built. Appends example Properties after the real ones from
 * buildPageProperties so each editor can be exercised on a real Note/Daily
 * Note. Example values live in component state only: never written to
 * frontmatter, reset when the page changes or reloads.
 *
 * Remove this file (and restore PageHost's plain
 * `<PropertyList items={buildPageProperties(page)} />`) once the editors
 * are done.
 */
export function PagePropertiesWithExamples({
  page,
  getTagSuggestions,
  onOpenTag,
}: {
  page: Page;
  /** The page's existing-tag search (createTagSuggester), for tag autocomplete. */
  getTagSuggestions?: GetTagSuggestions;
  /** Opens a tag's Tag Collection — the editor's own inline-#tag navigation. */
  onOpenTag?(name: string): void;
}) {
  const [exampleText, setExampleText] = useState(
    'This is some text that can wrap naturally onto multiple lines.\n\nPress Enter to create another line.'
  );
  const [exampleDate, setExampleDate] = useState<string | null>('2026-09-15');
  const [exampleTags, setExampleTags] = useState<string[]>(['design', 'product']);
  const [exampleUrl, setExampleUrl] = useState<string | null>(
    'https://example.com/docs/guides/getting-started/installation/configuration-and-advanced-options?ref=properties'
  );

  return (
    <PropertyList
      items={[
        ...buildPageProperties(page, { onOpenTag }),
        {
          name: 'Example text',
          type: 'text',
          value: exampleText,
          editable: true,
          onCommit: setExampleText,
        },
        {
          name: 'Example date',
          type: 'date',
          value: exampleDate,
          editable: true,
          onCommit: setExampleDate,
        },
        {
          name: 'Example tags',
          type: 'tag',
          value: exampleTags,
          getSuggestions: getTagSuggestions,
          onOpenTag,
          editable: true,
          onCommit: setExampleTags,
        },
        {
          name: 'Example URL',
          type: 'url',
          value: exampleUrl,
          editable: true,
          onCommit: setExampleUrl,
        },
      ]}
    />
  );
}
