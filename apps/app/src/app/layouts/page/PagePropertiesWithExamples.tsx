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
  const [exampleDate, setExampleDate] = useState<string | null>('2026-09-15');
  const [exampleEmptyDate, setExampleEmptyDate] = useState<string | null>(null);
  const [exampleUrl, setExampleUrl] = useState<string | null>('https://example.com/docs');
  const [exampleEmptyUrl, setExampleEmptyUrl] = useState<string | null>(null);

  return (
    <PropertyList
      items={[
        ...buildPageProperties(page),
        {
          name: 'Example text',
          type: 'text',
          value: exampleText,
          editable: true,
          onCommit: setExampleText,
        },
        {
          name: 'Example empty text',
          type: 'text',
          value: exampleEmptyText,
          editable: true,
          onCommit: setExampleEmptyText,
        },
        {
          name: 'Example date',
          type: 'date',
          value: exampleDate,
          editable: true,
          onCommit: setExampleDate,
        },
        {
          name: 'Example empty date',
          type: 'date',
          value: exampleEmptyDate,
          editable: true,
          onCommit: setExampleEmptyDate,
        },
        {
          name: 'Example URL',
          type: 'url',
          value: exampleUrl,
          editable: true,
          onCommit: setExampleUrl,
        },
        {
          name: 'Example empty URL',
          type: 'url',
          value: exampleEmptyUrl,
          editable: true,
          onCommit: setExampleEmptyUrl,
        },
        {
          name: 'Example read-only URL',
          type: 'url',
          value: 'example.com',
          editable: false,
        },
      ]}
    />
  );
}
