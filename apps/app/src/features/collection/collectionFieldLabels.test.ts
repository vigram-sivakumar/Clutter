import { describe, expect, it } from 'vitest';

import { systemPropertyLabel } from '@core/properties/systemProperties';

import { collectionFieldLabel } from './collectionFieldLabels';

describe('collectionFieldLabel', () => {
  it.each([
    ['lastOpened', 'Last opened'],
    ['created', 'Created'],
    ['updated', 'Last edited'],
  ] as const)('the %s field is labelled "%s"', (field, label) => {
    expect(collectionFieldLabel(field)).toBe(label);
  });

  it('reads the system property definitions: `updated` is the `modified` Property', () => {
    expect(collectionFieldLabel('updated')).toBe(systemPropertyLabel('modified'));
    expect(collectionFieldLabel('created')).toBe(systemPropertyLabel('created'));
    expect(collectionFieldLabel('lastOpened')).toBe(systemPropertyLabel('lastOpened'));
  });
});
