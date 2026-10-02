import { describe, expect, it, vi } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import type { Page } from '@core/vault/models/Page';

import { buildPageProperties } from './buildPageProperties';

const ALL = 'properties:\n  visible:\n    - tags\n    - aliases\n    - created\n    - modified';

function pageFrom(yaml: string, status: 'active' | 'archived' = 'active'): Page {
  const parsed = new FrontmatterParser().parse(`---\nid: p1\n${yaml}\n---\nbody`);

  return {
    id: 'p1',
    type: 'note',
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      status,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      tags: ['work'],
      aliases: ['Alt'],
      unownedFrontmatter: parsed.frontmatter.unownedLines ?? [],
    },
  } as unknown as Page;
}

function setup(yaml: string, status: 'active' | 'archived' = 'active') {
  const handlers = {
    onHideProperty: vi.fn(),
    onDeleteProperty: vi.fn(),
    onRemoveSystemProperty: vi.fn(),
    onCommitTags: vi.fn(),
    aliases: { onCommit: vi.fn() },
    onSetScalarValue: vi.fn(),
    onCommitListValue: vi.fn(),
  };
  const items = buildPageProperties(pageFrom(yaml, status), handlers);
  const row = (name: string) => items.find((item) => item.name === name)!;
  return { handlers, items, row };
}

describe('buildPageProperties — each property’s menu actions', () => {
  it('system properties can be hidden by their canonical key', () => {
    const { handlers, row } = setup(ALL);

    row('Tags').onHide!();
    row('Aliases').onHide!();
    row('Created').onHide!();
    row('Last edited').onHide!();

    // Canonical keys, never the labels.
    expect(handlers.onHideProperty.mock.calls).toEqual([['tags'], ['aliases'], ['created'], ['modified']]);
  });

  it('Tags and Aliases can be cleared; Created and Last edited cannot', () => {
    const { handlers, row } = setup(ALL);

    row('Tags').onClear!();
    row('Aliases').onClear!();

    expect(handlers.onCommitTags).toHaveBeenCalledExactlyOnceWith([]);
    expect(handlers.aliases.onCommit).toHaveBeenCalledExactlyOnceWith([]);
    expect(row('Created').onClear).toBeUndefined();
    expect(row('Last edited').onClear).toBeUndefined();
  });

  it('no system property can be deleted', () => {
    const { row } = setup(ALL);

    for (const name of ['Tags', 'Aliases', 'Created', 'Last edited']) {
      expect(row(name).onDelete).toBeUndefined();
    }
  });

  it('a custom property can be hidden, cleared and deleted, by its actual key', () => {
    const { handlers, row } = setup('Due date: 2026-10-01\nproperties:\n  visible:\n    - Due date');

    row('Due date').onHide!();
    row('Due date').onDelete!();

    expect(handlers.onHideProperty).toHaveBeenCalledExactlyOnceWith('Due date');
    expect(handlers.onDeleteProperty).toHaveBeenCalledExactlyOnceWith('Due date');
  });

  it.each([
    ['text', 'note: hi', 'text', null],
    ['number', 'est: 3', 'number', null],
    ['date', 'due: 2026-10-01', 'date', null],
    ['url', 'site: https://a.example', 'url', null],
    ['boolean', 'done: true', 'boolean', false],
  ] as const)('clearing a %s keeps its type: it is emptied, never removed', (_label, yaml, type, emptied) => {
    const key = yaml.split(':')[0]!;
    const { handlers, row } = setup(`${yaml}\nproperties:\n  visible:\n    - ${key}`);

    row(key).onClear!();

    expect(handlers.onSetScalarValue).toHaveBeenCalledExactlyOnceWith(key, type, emptied);
    expect(handlers.onDeleteProperty).not.toHaveBeenCalled();
  });

  it('clearing a list empties it', () => {
    const { handlers, row } = setup('people:\n  - Ana\n  - Bo\nproperties:\n  visible:\n    - people');

    row('people').onClear!();

    expect(handlers.onCommitListValue).toHaveBeenCalledExactlyOnceWith('people', []);
  });

  it('every system property can be removed by its canonical key; custom properties offer no Remove', () => {
    const { handlers, row } = setup(`priority: high\n${ALL}\n    - priority`);

    row('Tags').onRemove!();
    row('Aliases').onRemove!();
    row('Created').onRemove!();
    row('Last edited').onRemove!();

    expect(handlers.onRemoveSystemProperty.mock.calls).toEqual([['tags'], ['aliases'], ['created'], ['modified']]);
    expect(row('priority').onRemove).toBeUndefined();
  });

  it('an action is offered only when the host supplies its write', () => {
    const items = buildPageProperties(pageFrom(`priority: high\n${ALL}\n  - priority`), {});

    for (const item of items) {
      expect(item.onHide).toBeUndefined();
      expect(item.onClear).toBeUndefined();
      expect(item.onDelete).toBeUndefined();
      expect(item.onRemove).toBeUndefined();
    }
  });

  it('Hide alone is offered when only hiding is supplied', () => {
    const items = buildPageProperties(pageFrom(`priority: high\n${ALL}\n    - priority`), {
      onHideProperty: vi.fn(),
    });

    expect(items.every((item) => typeof item.onHide === 'function')).toBe(true);
    expect(items.every((item) => item.onClear === undefined && item.onDelete === undefined)).toBe(true);
  });

  it('an archived page offers no actions at all', () => {
    const { items } = setup(`priority: high\n${ALL}\n    - priority`, 'archived');

    for (const item of items) {
      expect(item.onHide).toBeUndefined();
      expect(item.onClear).toBeUndefined();
      expect(item.onDelete).toBeUndefined();
    }
  });

  it('a draft row has no menu: nothing exists to hide, clear or delete yet', () => {
    const items = buildPageProperties(pageFrom(ALL), {
      onHideProperty: vi.fn(),
      onDeleteProperty: vi.fn(),
      drafts: { items: [{ id: 1, type: 'text' }], onName: vi.fn(), onAbandon: vi.fn() },
    });

    const draft = items.at(-1)!;
    expect(draft.name).toBe('');
    expect(draft.onHide).toBeUndefined();
    expect(draft.onClear).toBeUndefined();
    expect(draft.onDelete).toBeUndefined();
  });
});
