import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import type { Page } from '@core/vault/models/Page';

import { getAddableProperties } from './addableProperties';

function pageFrom(yaml: string): Page {
  const parsed = new FrontmatterParser().parse(`---\nid: p1\n${yaml}\n---\nbody`);

  return {
    id: 'p1',
    metadata: { unownedFrontmatter: parsed.frontmatter.unownedLines ?? [] },
  } as unknown as Page;
}

describe('getAddableProperties', () => {
  it('offers every system property when none is shown, labelled from the system definitions, in the usual order', () => {
    const { systemProperties } = getAddableProperties(pageFrom('priority: high'));

    expect(systemProperties.map((property) => [property.id, property.label])).toEqual([
      ['tags', 'Tags'],
      ['aliases', 'Aliases'],
      ['created', 'Created'],
      ['modified', 'Last edited'],
    ]);
    // Icons come from the property type registry, by each one's type.
    expect(systemProperties.map((property) => property.icon)).toEqual(['tag', 'multiLine', 'calendar', 'calendar']);
  });

  it('never offers a system property that is already shown', () => {
    const { systemProperties } = getAddableProperties(
      pageFrom('properties:\n  visible:\n    - created\n    - modified')
    );

    expect(systemProperties.map((property) => property.id)).toEqual(['tags', 'aliases']);
  });

  it('never offers `lastOpened`: it is a collection field, not note metadata', () => {
    expect(getAddableProperties(pageFrom('')).systemProperties.map((property) => property.id)).not.toContain(
      'lastOpened'
    );
  });

  it('offers custom properties that exist but are not shown, by their actual key and read type', () => {
    const { hiddenProperties } = getAddableProperties(
      pageFrom('Due date: 2026-10-01\npeople:\n  - Ana\nestimate: # number\nnote: hi\nproperties:\n  visible:\n    - note')
    );

    expect(hiddenProperties).toEqual([
      { key: 'Due date', type: 'date' },
      { key: 'people', type: 'multi-select' },
      { key: 'estimate', type: 'number' },
    ]);
  });

  it('never offers the reserved `properties` key as a hidden property', () => {
    const { hiddenProperties } = getAddableProperties(pageFrom('priority: high\nproperties:\n  visible:\n    - tags'));

    expect(hiddenProperties.map((property) => property.key)).toEqual(['priority']);
  });

  it('offers nothing to show once everything is shown', () => {
    const all = getAddableProperties(
      pageFrom('priority: high\nproperties:\n  visible:\n    - tags\n    - aliases\n    - created\n    - modified\n    - priority')
    );

    expect(all.systemProperties).toEqual([]);
    expect(all.hiddenProperties).toEqual([]);
  });
});
