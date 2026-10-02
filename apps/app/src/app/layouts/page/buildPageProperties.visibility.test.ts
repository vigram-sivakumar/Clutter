import { describe, expect, it, vi } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import type { Page } from '@core/vault/models/Page';

import { buildPageProperties } from './buildPageProperties';

/**
 * A page whose frontmatter is exactly `yaml` — no default visibility
 * added, unlike the shared fixtures: these tests are about what is shown.
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

describe('buildPageProperties — only what the note shows', () => {
  it('shows nothing when there is no properties.visible, whatever the page holds', () => {
    const page = pageFrom('Due date: 2026-10-01\npeople:\n  - Ana\npriority: high');

    expect(names(page)).toEqual([]);
    // The values are all still there, just not listed.
    expect(page.metadata.tags).toEqual(['work']);
    expect(page.metadata.unownedFrontmatter).toContain('priority: high');
  });

  it('shows nothing for an empty or unrelated properties block', () => {
    expect(names(pageFrom('properties:\n  visible:'))).toEqual([]);
    expect(names(pageFrom('properties:\n  other: 1'))).toEqual([]);
    expect(names(pageFrom('visible:\n  - tags'))).toEqual([]);
  });

  it.each([
    ['tags', 'Tags'],
    ['aliases', 'Aliases'],
    ['created', 'Created'],
    ['modified', 'Last edited'],
  ])('shows the %s system property, labelled %s, only when its canonical key is listed', (key, label) => {
    expect(names(pageFrom(`properties:\n  visible:\n    - ${key}`))).toEqual([label]);
  });

  it('matches system keys by canonical key, never by the UI label', () => {
    expect(names(pageFrom('properties:\n  visible:\n    - Last edited\n    - Created\n    - Tags'))).toEqual([]);
  });

  it('shows a custom property only when its actual frontmatter key is listed', () => {
    const yaml = 'Due date: 2026-10-01\npriority: high\nproperties:\n  visible:\n    - Due date';

    expect(names(pageFrom(yaml))).toEqual(['Due date']);
  });

  it('a listed custom key that is not in the frontmatter shows nothing', () => {
    expect(names(pageFrom('priority: high\nproperties:\n  visible:\n    - ghost\n    - priority'))).toEqual([
      'priority',
    ]);
  });

  it('rows follow the order the properties were added to properties.visible, system and custom interleaved', () => {
    const yaml = 'Due date: 2026-10-01\npriority: high\nproperties:\n  visible:\n    - modified\n    - priority\n    - tags\n    - Due date';

    expect(names(pageFrom(yaml))).toEqual(['Last edited', 'priority', 'Tags', 'Due date']);
  });

  it('a key listed twice is shown once', () => {
    expect(names(pageFrom('properties:\n  visible:\n    - tags\n    - tags'))).toEqual(['Tags']);
  });

  it('`properties` is never a row, even though it is a frontmatter key', () => {
    const page = pageFrom('priority: high\nproperties:\n  visible:\n    - tags\n    - properties\n    - priority');

    expect(names(page)).toEqual(['Tags', 'priority']);
  });

  it('visibility is separate from editability: a shown property is editable only when the host allows it', () => {
    const yaml = 'priority: high\nproperties:\n  visible:\n    - tags\n    - priority';
    const readOnly = buildPageProperties(pageFrom(yaml));
    const editable = buildPageProperties(pageFrom(yaml), {
      onCommitTags: vi.fn(),
      onSetScalarValue: vi.fn(),
    });

    expect(readOnly.every((item) => item.editable === false)).toBe(true);
    expect(editable.every((item) => item.editable === true)).toBe(true);
  });

  it('an archived page shows what it lists, read-only, and offers no new property drafts', () => {
    const page = pageFrom('priority: high\nproperties:\n  visible:\n    - tags\n    - priority', {
      status: 'archived',
    });
    const items = buildPageProperties(page, {
      onCommitTags: vi.fn(),
      onSetScalarValue: vi.fn(),
      drafts: { items: [{ id: 1, type: 'text' }], onName: vi.fn(), onAbandon: vi.fn() },
    });

    expect(items.map((item) => item.name)).toEqual(['Tags', 'priority']);
    expect(items.every((item) => item.editable === false)).toBe(true);
  });

  it('drafts are listed after the shown properties, whatever is shown', () => {
    const drafts = { items: [{ id: 1, type: 'date' as const }], onName: vi.fn(), onAbandon: vi.fn() };

    expect(names(pageFrom('x: 1'), { drafts })).toEqual(['']);
    expect(names(pageFrom('properties:\n  visible:\n    - tags'), { drafts })).toEqual(['Tags', '']);
  });

  it('renaming a shown custom property is still offered and validated', () => {
    const onRenameProperty = vi.fn();
    const items = buildPageProperties(pageFrom('priority: high\nowner: Jane\nproperties:\n  visible:\n    - priority'), {
      onRenameProperty,
    });

    expect(items[0]!.onRename!('importance')).toBe(true);
    expect(onRenameProperty).toHaveBeenCalledExactlyOnceWith('priority', 'importance');
    // Uniqueness is still checked against every custom key, shown or not.
    expect(items[0]!.onRename!('OWNER')).toBe(false);
  });
});
