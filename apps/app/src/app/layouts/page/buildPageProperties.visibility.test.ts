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
 * A page read from `yaml` as a file: its preserved lines and the physical order of its entries, as the parser
 * records them (ADR-058) — nothing is declared unless `yaml` has the key.
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
      tags: ['work'],
      aliases: ['Alt'],
      unownedFrontmatter: parsed.frontmatter.unownedLines ?? [],
      frontmatterEntryOrder: parsed.frontmatter.entryOrder,
      ...overrides,
    },
  } as unknown as Page;
}

const names = (yaml: string, actions = {}) => buildPageProperties(pageFrom(yaml), actions).map((item) => item.name);
const ids = (yaml: string, actions = {}) => buildPageProperties(pageFrom(yaml), actions).map((item) => item.id);

describe('buildPageProperties — what the note shows', () => {
  it('shows no system property until its key is in the frontmatter, however much the page holds', () => {
    const page = pageFrom('description: hi');

    expect(buildPageProperties(page)).toEqual([]);
    // The values are all still there, just not declared.
    expect(page.metadata.tags).toEqual(['work']);
    expect(page.metadata.aliases).toEqual(['Alt']);
  });

  it.each([
    ['tags: []', 'Tags'],
    ['aliases: []', 'Aliases'],
    ['created: true', 'Created'],
    ['modified: true', 'Last edited'],
  ])('`%s` declares the %s system property — even with an empty value', (line, label) => {
    expect(names(line)).toEqual([label]);
  });

  it('matches system keys by canonical key (in any letter case), never by the UI label', () => {
    expect(names('Last edited: x\nCreated2: y').sort()).toEqual(['Created2', 'Last edited']);
    expect(names('TAGS: []\nModified: true')).toEqual(['Tags', 'Last edited']);
  });

  it('`showProperties` is never a row — whatever its value or where it sits', () => {
    expect(names('showProperties: false')).toEqual([]);
    expect(names('a: 1\nshowProperties: true\ntags: []')).toEqual(['a', 'Tags']);
    expect(names('ShowProperties: false\nb: 2')).toEqual(['b']);
  });

  it('a `properties:` key is an ordinary custom property now', () => {
    expect(names('properties:\n  visible:\n    - tags')).toEqual(['properties']);
  });

  it('custom properties appear because their keys exist and keep their frontmatter order', () => {
    expect(names('Due date: 2026-10-01\npriority: high\nmood: ok')).toEqual(['Due date', 'priority', 'mood']);
  });

  it('a system property’s menu offers Remove; only Tags and Aliases can also be Cleared', () => {
    const items = buildPageProperties(pageFrom('tags: []\naliases: []\ncreated: true\nmodified: true'), {
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
    const yaml = 'priority: high\ntags: []';
    const readOnly = buildPageProperties(pageFrom(yaml));
    const editable = buildPageProperties(pageFrom(yaml), { onCommitTags: vi.fn(), onSetScalarValue: vi.fn() });

    expect(readOnly.every((item) => item.editable === false)).toBe(true);
    expect(editable.every((item) => item.editable === true)).toBe(true);
  });

  it('an archived page shows what it has, read-only, with no actions and no new property drafts', () => {
    const page = pageFrom('priority: high\ntags: []', { status: 'archived' });
    const items = buildPageProperties(page, {
      onCommitTags: vi.fn(),
      onSetScalarValue: vi.fn(),
      onRemoveSystemProperty: vi.fn(),
      onDeleteProperty: vi.fn(),
      drafts: { items: [{ id: 1, type: 'text' }], onName: vi.fn(), onAbandon: vi.fn() },
    });

    expect(items.map((item) => item.name)).toEqual(['priority', 'Tags']);
    expect(items.every((item) => item.editable === false)).toBe(true);
    expect(items.every((item) => item.onRemove === undefined && item.onDelete === undefined)).toBe(true);
  });

  it('drafts are listed after the shown properties', () => {
    const drafts = { items: [{ id: 1, type: 'date' as const }], onName: vi.fn(), onAbandon: vi.fn() };

    expect(names('description: hi', { drafts })).toEqual(['']);
    expect(names('x: 1\ntags: []', { drafts })).toEqual(['x', 'Tags', '']);
  });

  it('renaming a custom property is offered and validated against every custom key', () => {
    const onRenameProperty = vi.fn();
    const items = buildPageProperties(pageFrom('priority: high\nowner: Jane'), { onRenameProperty });

    expect(items[0]!.onRename!('importance')).toBe(true);
    expect(onRenameProperty).toHaveBeenCalledExactlyOnceWith('priority', 'importance');
    expect(items[0]!.onRename!('OWNER')).toBe(false);
  });

  it('Created and Last edited carry the file times; a declared row with no file time has the value null', () => {
    const withTimes = {
      ...pageFrom('created: true\nmodified: true'),
      fileTimes: { createdAt: '2026-05-01T00:00:00.000Z', modifiedAt: '2026-05-02T00:00:00.000Z' },
    } as Page;

    expect(buildPageProperties(withTimes).map((item) => item.value)).toEqual(['2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z']);
    expect(buildPageProperties(pageFrom('created: true\nmodified: true')).map((item) => item.value)).toEqual([null, null]);
  });
});

describe('buildPageProperties — the physical order of the entries is the order shown', () => {
  it('interleaves system properties and custom properties exactly as their entries are in the file', () => {
    expect(names('Alpha: 1\ncreated: true\nBeta: 2\ntags:\n  - x\nGamma: 3')).toEqual(['Alpha', 'Created', 'Beta', 'Tags', 'Gamma']);
  });

  it('a nested mapping and a block list are single rows, with `Name` an ordinary custom property', () => {
    expect(names('project:\n  name: Clutter\n  settings:\n    priority: high\nName: This is weft\npeople:\n  - Ana')).toEqual(['project', 'Name', 'people']);
  });

  it('every row has a stable id and the key a reorder names it by — system by canonical key, custom by name', () => {
    const items = buildPageProperties(pageFrom('Due date: 2026-10-01\ntags:\n  - x'));

    expect(items.map((item) => [item.id, item.orderKey])).toEqual([
      ['custom:Due date', 'Due date'],
      ['system:tags', 'tags'],
    ]);
  });

  it('a row keeps its id when its entry moves: identity is the property, not its position', () => {
    expect([...ids('a: 1\nb: 2\nc: 3')].sort()).toEqual([...ids('c: 3\na: 1\nb: 2')].sort());
  });

  it('drafts come last and have no order key; the `kind: template` marker is never a row', () => {
    const items = buildPageProperties(pageFrom('kind: template\na: 1\ntags:\n  - x'), {
      drafts: { items: [{ id: 7, type: 'text' as const }], onName: vi.fn(), onAbandon: vi.fn() },
    });

    expect(items.map((item) => item.name)).toEqual(['a', 'Tags', '']);
    expect(items.at(-1)).toMatchObject({ id: 'draft:7' });
    expect(items.at(-1)!.orderKey).toBeUndefined();
  });

  it('Daily Notes show the same rows', () => {
    const daily = { ...pageFrom('a: 1\ntags:\n  - x'), type: 'daily-note' } as Page;

    expect(buildPageProperties(daily).map((item) => item.name)).toEqual(['a', 'Tags']);
  });

  it('a note with no recorded order shows only its custom properties', () => {
    const page = pageFrom('b: 1\na: 2', { frontmatterEntryOrder: undefined });

    expect(buildPageProperties(page).map((item) => item.name)).toEqual(['b', 'a']);
  });
});
