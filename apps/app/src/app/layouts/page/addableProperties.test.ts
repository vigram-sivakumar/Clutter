import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import type { Page } from '@core/vault/models/Page';

import { getAddableSystemProperties } from './addableProperties';

function pageFrom(yaml: string): Page {
  const parsed = new FrontmatterParser().parse(`---\nid: p1\n${yaml}\n---\nbody`);

  return {
    id: 'p1',
    metadata: { unownedFrontmatter: parsed.frontmatter.unownedLines ?? [] },
  } as unknown as Page;
}

const ids = (yaml: string) => getAddableSystemProperties(pageFrom(yaml)).map((property) => property.id);

describe('getAddableSystemProperties', () => {
  it('offers every system property when none is listed, labelled from the system definitions, in the canonical order', () => {
    const properties = getAddableSystemProperties(pageFrom('priority: high'));

    expect(properties.map((property) => [property.id, property.label])).toEqual([
      ['tags', 'Tags'],
      ['aliases', 'Aliases'],
      ['created', 'Created'],
      ['modified', 'Last edited'],
    ]);
    // Icons come from the property type registry, by each one's type.
    expect(properties.map((property) => property.icon)).toEqual(['tag', 'multiLine', 'calendar', 'calendar']);
  });

  it('does not offer a system property already in properties.visible', () => {
    expect(ids('properties:\n  visible:\n    - tags\n    - created')).toEqual(['aliases', 'modified']);
  });

  it('offers a removed system property again, in its canonical place', () => {
    expect(ids('properties:\n  visible:\n    - aliases\n    - modified')).toEqual(['tags', 'created']);
  });

  it('matches listed keys ignoring letter case, and offers nothing once all four are listed', () => {
    expect(ids('properties:\n  visible: [TAGS, Aliases, created, MODIFIED]')).toEqual([]);
  });

  it('is only ever system properties: custom properties are displayed because their key exists, so none is offered', () => {
    expect(ids('priority: high\nDue date: 2026-10-01')).toEqual(['tags', 'aliases', 'created', 'modified']);
    // A legacy custom entry in `visible` changes nothing.
    expect(ids('priority: high\nproperties:\n  visible:\n    - priority')).toEqual(['tags', 'aliases', 'created', 'modified']);
  });
});
