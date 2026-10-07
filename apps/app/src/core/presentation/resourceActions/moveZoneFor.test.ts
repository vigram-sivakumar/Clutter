import { describe, expect, it } from 'vitest';

import { buildResourceActionMenu } from './buildResourceActionMenu';
import { moveZoneFor } from './moveZoneFor';

describe('moveZoneFor — the resource decides its Move picker root (ADR-049)', () => {
  it('Note → workspace (vault root), Asset → Assets', () => {
    expect(moveZoneFor('note', {})).toBe('workspace');
    expect(moveZoneFor('asset', { assetKind: 'image' })).toBe('assets');
    expect(moveZoneFor('asset', { assetKind: 'pdf' })).toBe('assets');
  });

  it('a folder moves within the hierarchy it already sits in', () => {
    expect(moveZoneFor('folder', {})).toBe('workspace');
    expect(moveZoneFor('folder', { moveZone: 'assets' })).toBe('assets');
  });

  it('there is no Templates zone: Templates are flat and a Template is never moved', () => {
    expect(moveZoneFor('note', { isTemplate: true })).toBe('workspace');
    for (const surface of ['sidebar', 'favorites', 'topbar'] as const) {
      expect(buildResourceActionMenu('note', { isTemplate: true, status: 'active' }, surface).map((i) => i.id)).not.toContain('move-to');
    }
  });

  it('kinds with no Move have no sealed zone', () => {
    expect(moveZoneFor('daily-note', {})).toBe('workspace');
    expect(moveZoneFor('tag', {})).toBe('workspace');
    expect(moveZoneFor('task', {})).toBe('workspace');
  });

  it('the canonical Move action is the same for every kind that has it — one definition', () => {
    const move = (kind: 'note' | 'folder' | 'asset') => {
      const item = buildResourceActionMenu(kind, { status: 'active', assetKind: 'image' }, 'sidebar').find(
        (entry) => entry.id === 'move-to'
      );
      return { id: item?.id, label: item?.label, icon: item?.icon };
    };

    expect(move('note')).toEqual({ id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' });
    expect(move('folder')).toEqual(move('note'));
    expect(move('asset')).toEqual(move('note'));
  });
});
