import { describe, expect, it } from 'vitest';

import { OWNED_FRONTMATTER_KEYS } from '@core/vault/ingest/frontmatter/ownedFrontmatterKeys';

import { systemPropertyDefinitions, systemPropertyLabel } from './systemProperties';
import type { SystemPropertyKey } from './systemProperties';

describe('system property definitions', () => {
  it.each([
    ['created', 'Created'],
    ['modified', 'Last edited'],
    ['tags', 'Tags'],
    ['aliases', 'Aliases'],
  ] as const)('%s is shown as "%s"', (key, label) => {
    expect(systemPropertyLabel(key)).toBe(label);
  });

  it('never uses the older terminology', () => {
    const labels = Object.values(systemPropertyDefinitions).map((definition) => definition.label);

    for (const old of ['Modified', 'Updated', 'Last modified', 'Last updated', 'Date created', 'Date updated']) {
      expect(labels).not.toContain(old);
    }
  });

  it('is identified by canonical internal keys — the frontmatter keys, never the display wording', () => {
    const keys = Object.keys(systemPropertyDefinitions) as SystemPropertyKey[];

    // Every key is an owned frontmatter key, so renaming a label can't
    // touch stored data.
    for (const key of keys) {
      expect(OWNED_FRONTMATTER_KEYS.has(key)).toBe(true);
    }
    // The label of `modified` is not its key, and no label is used as a key.
    expect(systemPropertyLabel('modified')).not.toBe('modified');
    expect(keys).not.toContain('Last edited' as never);
  });
});
