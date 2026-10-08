import { describe, expect, it, vi } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import type { Page } from '@core/vault/models/Page';

import { buildPageProperties as buildPagePropertiesForHost } from './buildPageProperties';

/**
 * Archived state is LOCATION, and the host (PageHost) derives it and passes `isEffectivelyArchived`. These
 * fixtures describe an archived page by its `status`, so this adapter plays the host: it passes that fact on.
 */
const buildPageProperties = (
  page: Parameters<typeof buildPagePropertiesForHost>[0],
  actions: NonNullable<Parameters<typeof buildPagePropertiesForHost>[1]> = {}
) => buildPagePropertiesForHost(page, { isEffectivelyArchived: page.metadata.status === 'archived', ...actions });

/**
 * A page whose frontmatter is exactly `yaml` — no system property listed
 * unless `yaml` lists it, unlike the shared fixtures: these tests are about
 * what is shown.
 */
function pageFrom(yaml: string, overrides: Partial<Page['metadata']> = {}): Page {
  const parsed = new FrontmatterParser().parse(`---\nid: p1\n${yaml}\n---\nbody`);

  return {
    id: 'p1',
    type: 'note',
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      status: 'active',
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      tags: ['work'],
      aliases: ['Alt'],
      unownedFrontmatter: parsed.frontmatter.unownedLines ?? [],
      ...overrides,
    },
  } as unknown as Page;
}

const names = (page: Page, actions = {}) => buildPageProperties(page, actions).map((item) => item.name);

describe('buildPageProperties — what the note shows', () => {
  it('shows no system property until its canonical key is listed, however much the page holds', () => {
    const page = pageFrom('description: hi');

    expect(names(page)).toEqual([]);
    // The values are all still there, just not listed.
    expect(page.metadata.tags).toEqual(['work']);
    expect(page.metadata.aliases).toEqual(['Alt']);
  });

  it('shows nothing for an empty or unrelated properties block', () => {
    expect(names(pageFrom('properties:\n  visible:'))).toEqual([]);
    expect(names(pageFrom('properties:\n  other: 1'))).toEqual([]);
    // A top-level `visible` is not the Properties configuration: it is an ordinary custom property.
    expect(names(pageFrom('visible:\n  - tags'))).toEqual(['visible']);
  });

  it.each([
    ['tags', 'Tags'],
    ['aliases', 'Aliases'],
    ['created', 'Created'],
    ['modified', 'Last edited'],
  ])('shows the %s system property, labelled %s, only when its canonical key is listed', (key, label) => {
    expect(names(pageFrom(`properties:\n  visible:\n    - ${key}`))).toEqual([label]);
  });

  it('matches system keys by canonical key (in any letter case), never by the UI label', () => {
    expect(names(pageFrom('properties:\n  visible:\n    - Last edited\n    - Created2'))).toEqual([]);
    expect(names(pageFrom('properties:\n  visible:\n    - TAGS\n    - Modified'))).toEqual(['Tags', 'Last edited']);
  });

  it('system rows are always in the one canonical order — Tags, Aliases, Created, Last edited — whatever order is listed', () => {
    const page = pageFrom('properties:\n  visible:\n    - modified\n    - created\n    - aliases\n    - tags');

    expect(names(page)).toEqual(['Tags', 'Aliases', 'Created', 'Last edited']);
  });

  it('a key listed twice is shown once', () => {
    expect(names(pageFrom('properties:\n  visible:\n    - tags\n    - tags'))).toEqual(['Tags']);
  });

  it('custom properties appear automatically — no listing needed — and keep their frontmatter order', () => {
    const yaml = 'Due date: 2026-10-01\npriority: high\nmood: ok';

    expect(names(pageFrom(yaml))).toEqual(['Due date', 'priority', 'mood']);
  });

  it('listed system properties come first (canonical order), then the custom properties in frontmatter order', () => {
    const yaml = 'zeta: 1\nalpha: 2\nproperties:\n  visible:\n    - modified\n    - tags';

    expect(names(pageFrom(yaml))).toEqual(['Tags', 'Last edited', 'zeta', 'alpha']);
  });

  it('a legacy custom key in `visible` neither hides nor duplicates a custom property', () => {
    const yaml = 'priority: high\nDue date: 2026-10-01\nproperties:\n  visible:\n    - Due date\n    - ghost';

    expect(names(pageFrom(yaml))).toEqual(['priority', 'Due date']);
  });

  it('`properties` is never a row, even though it is a frontmatter key', () => {
    const page = pageFrom('priority: high\nproperties:\n  visible:\n    - tags\n    - properties');

    expect(names(page)).toEqual(['Tags', 'priority']);
  });

  it('a system property’s menu offers Remove (unlist only); only Tags and Aliases can also be Cleared', () => {
    const page = pageFrom('properties:\n  visible:\n    - tags\n    - aliases\n    - created\n    - modified');
    const items = buildPageProperties(page, {
      onRemoveSystemProperty: vi.fn(),
      onCommitTags: vi.fn(),
      aliases: { onCommit: vi.fn() },
    });

    expect(items.map((item) => [item.name, typeof item.onRemove, typeof item.onClear])).toEqual([
      ['Tags', 'function', 'function'],
      ['Aliases', 'function', 'function'],
      ['Created', 'function', 'undefined'],
      ['Last edited', 'function', 'undefined'],
    ]);
    expect(items.every((item) => item.onDelete === undefined)).toBe(true);
  });

  it('visibility is separate from editability: a shown property is editable only when the host allows it', () => {
    const yaml = 'priority: high\nproperties:\n  visible:\n    - tags';
    const readOnly = buildPageProperties(pageFrom(yaml));
    const editable = buildPageProperties(pageFrom(yaml), {
      onCommitTags: vi.fn(),
      onSetScalarValue: vi.fn(),
    });

    expect(readOnly.every((item) => item.editable === false)).toBe(true);
    expect(editable.every((item) => item.editable === true)).toBe(true);
  });

  it('an archived page shows what it has, read-only, with no actions and no new property drafts', () => {
    const page = pageFrom('priority: high\nproperties:\n  visible:\n    - tags', { status: 'archived' });
    const items = buildPageProperties(page, {
      onCommitTags: vi.fn(),
      onSetScalarValue: vi.fn(),
      onRemoveSystemProperty: vi.fn(),
      onDeleteProperty: vi.fn(),
      drafts: { items: [{ id: 1, type: 'text' }], onName: vi.fn(), onAbandon: vi.fn() },
    });

    expect(items.map((item) => item.name)).toEqual(['Tags', 'priority']);
    expect(items.every((item) => item.editable === false)).toBe(true);
    expect(items.every((item) => item.onRemove === undefined && item.onDelete === undefined)).toBe(true);
  });

  it('drafts are listed after the shown properties', () => {
    const drafts = { items: [{ id: 1, type: 'date' as const }], onName: vi.fn(), onAbandon: vi.fn() };

    expect(names(pageFrom('description: hi'), { drafts })).toEqual(['']);
    expect(names(pageFrom('x: 1\nproperties:\n  visible:\n    - tags'), { drafts })).toEqual(['Tags', 'x', '']);
  });

  it('renaming a custom property is offered and validated against every custom key', () => {
    const onRenameProperty = vi.fn();
    const items = buildPageProperties(pageFrom('priority: high\nowner: Jane'), { onRenameProperty });

    expect(items[0]!.onRename!('importance')).toBe(true);
    expect(onRenameProperty).toHaveBeenCalledExactlyOnceWith('priority', 'importance');
    expect(items[0]!.onRename!('OWNER')).toBe(false);
  });
});
