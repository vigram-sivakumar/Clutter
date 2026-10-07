import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { RESOURCE_ACTIONS } from './resourceActionDefinitions';
import { RESOURCE_ACTION_GROUPS } from './resourceActionTypes';

const SRC = join(__dirname, '..', '..', '..');
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

/**
 * The surfaces that build a resource's menu from the canonical actions. A divider here comes from a
 * group boundary (buildResourceActionMenu), never a hand-written `separatorBefore: true`. Scoped to
 * resource-action menus only: embed, table, property and collection menus legitimately use local
 * separators and are not listed.
 */
const RESOURCE_ACTION_CONSUMERS = [
  'features/notes/sidebar/FolderTree.tsx',
  'features/notes/sidebar/FavoriteList.tsx',
  'features/daily-notes/sidebar/DailyNotesList.tsx',
  'features/tags/helpers/renderTags.tsx',
  'features/tasks/sidebar/Task.tsx',
  'features/pdf/PdfViewerMoreActions.tsx',
  'app/layouts/page/topbar/buildTopBarActions.tsx',
  'app/layouts/page/topbar/topBarRegistry.tsx',
  'app/layouts/page/topbar/ResourceTopBarActions.tsx',
];

describe('resource-action menus: dividers come only from groups', () => {
  it.each(RESOURCE_ACTION_CONSUMERS)('%s hand-writes no `separatorBefore: true`', (file) => {
    expect(read(file)).not.toMatch(/separatorBefore:\s*true/);
  });

  it('only the builder sets separatorBefore inside the canonical layer', () => {
    const dir = join(SRC, 'core/presentation/resourceActions');
    const offenders = readdirSync(dir).filter(
      (name) =>
        !name.endsWith('.test.ts') &&
        name !== 'buildResourceActionMenu.ts' &&
        /separatorBefore/.test(readFileSync(join(dir, name), 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});

describe('canonical definitions: structure', () => {
  const all = Object.entries(RESOURCE_ACTIONS).flatMap(([kind, list]) => list.map((d) => ({ kind, d })));

  it('every definition has a known group, a finite order, and a non-empty id', () => {
    for (const { kind, d } of all) {
      expect(RESOURCE_ACTION_GROUPS, `${kind}/${d.id}`).toContain(d.group);
      expect(Number.isFinite(d.order), `${kind}/${d.id}`).toBe(true);
      expect(d.id.length).toBeGreaterThan(0);
    }
  });

  it('within one kind, no two actions share a group and order (Archive/Restore are exclusive by status)', () => {
    for (const [kind, list] of Object.entries(RESOURCE_ACTIONS)) {
      const slots = list.filter((d) => d.id !== 'archive' && d.id !== 'restore').map((d) => `${d.group}:${d.order}`);
      expect(new Set(slots).size, `${kind} has two actions at the same group/order`).toBe(slots.length);
    }
  });

  it('every destructive-group action is a removal action (delete)', () => {
    for (const { kind, d } of all) {
      if (d.group === 'destructive') {
        expect(d.id, kind).toBe('delete');
      }
    }
  });
});
