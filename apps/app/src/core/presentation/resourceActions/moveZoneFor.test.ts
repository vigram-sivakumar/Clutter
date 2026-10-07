import { describe, expect, it } from 'vitest';

import { buildResourceActionMenu } from './buildResourceActionMenu';
import { moveZoneFor } from './moveZoneFor';

describe('moveZoneFor — the resource decides its Move root (ADR-049)', () => {
  it('Note → workspace (vault root), Template → Templates, Asset → Assets', () => {
    expect(moveZoneFor('note', { isTemplate: false })).toBe('workspace');
    expect(moveZoneFor('note', {})).toBe('workspace');
    expect(moveZoneFor('note', { isTemplate: true })).toBe('templates');
    expect(moveZoneFor('asset', { assetKind: 'image' })).toBe('assets');
    expect(moveZoneFor('asset', { assetKind: 'pdf' })).toBe('assets');
  });

  it('a Template is a Template wherever it is listed — the zone reads the resource, never the surface', () => {
    for (const surface of ['sidebar', 'favorites', 'topbar'] as const) {
      expect(buildResourceActionMenu('note', { isTemplate: true, status: 'active' }, surface).map((i) => i.id)).toContain(
        'move-to'
      );
    }
    expect(moveZoneFor('note', { isTemplate: true, status: 'active' })).toBe('templates');
  });

  it('a folder moves within the hierarchy it already sits in', () => {
    expect(moveZoneFor('folder', {})).toBe('workspace');
    expect(moveZoneFor('folder', { moveZone: 'templates' })).toBe('templates');
    expect(moveZoneFor('folder', { moveZone: 'assets' })).toBe('assets');
  });

  it('kinds with no Move have no sealed zone', () => {
    expect(moveZoneFor('daily-note', {})).toBe('workspace');
    expect(moveZoneFor('tag', {})).toBe('workspace');
    expect(moveZoneFor('task', {})).toBe('workspace');
  });

  it('the canonical Move action is the same for every kind that has it — one definition, the zone differs', () => {
    const move = (kind: 'note' | 'folder' | 'asset', context = {}) => {
      const item = buildResourceActionMenu(kind, { status: 'active', assetKind: 'image', ...context }, 'sidebar').find(
        (entry) => entry.id === 'move-to'
      );
      // Same id, label and icon; only its position (and so its divider) depends on the menu around it.
      return { id: item?.id, label: item?.label, icon: item?.icon };
    };

    expect(move('note')).toEqual({ id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' });
    expect(move('note', { isTemplate: true })).toEqual(move('note'));
    expect(move('folder')).toEqual(move('note'));
    expect(move('asset')).toEqual(move('note'));
  });
});
