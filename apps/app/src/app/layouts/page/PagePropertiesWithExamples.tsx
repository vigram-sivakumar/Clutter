import { useState } from 'react';

import { PropertyList } from '@components/property-list/PropertyList';
import type { Page } from '@core/vault/models/Page';

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
export function PagePropertiesWithExamples({ page }: { page: Page }) {
  const [exampleText, setExampleText] = useState(
    'This is some text that can wrap naturally onto multiple lines.\n\nPress Enter to create another line.'
  );
  const [exampleEmptyText, setExampleEmptyText] = useState('');

  return (
    <PropertyList
      items={[
        ...buildPageProperties(page),
        {
          name: 'Example text',
          type: 'text',
          value: exampleText,
          onCommit: setExampleText,
        },
        {
          name: 'Example empty text',
          type: 'text',
          value: exampleEmptyText,
          onCommit: setExampleEmptyText,
        },
      ]}
    />
  );
}
