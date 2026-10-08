import { describe, expect, it } from 'vitest';

import { datesWithNotes } from './datesWithNotes';
import type { Page } from '@core/vault/models/Page';

function makeDailyNote(name: string): Page {
  return { name } as Page;
}

describe('datesWithNotes', () => {
  it('returns the ISO dates of the given daily notes', () => {
    const notes = [makeDailyNote('2026-07-10'), makeDailyNote('2026-07-15')];

    const result = datesWithNotes(notes);

    expect(result.has('2026-07-10')).toBe(true);
    expect(result.has('2026-07-15')).toBe(true);
    expect(result.has('2026-07-11')).toBe(false);
  });

  it('returns an empty set for no daily notes', () => {
    expect(datesWithNotes([]).size).toBe(0);
  });

  it('deduplicates repeated dates', () => {
    const notes = [makeDailyNote('2026-07-10'), makeDailyNote('2026-07-10')];

    expect(datesWithNotes(notes).size).toBe(1);
  });
});

describe('datesWithNotes fed by the vault\'s active Daily Notes', () => {
  it('a Daily Note inside Archive/ (directly or in a folder) does not mark its day; status alone does not hide one', async () => {
    const { Vault } = await import('@core/vault/models/Vault');
    const { VaultProjectionBuilder } = await import('@core/vault/knowledge/VaultProjectionBuilder');
    const { KnowledgeGraph } = await import('@core/vault/models/graph/KnowledgeGraph');
    const meta = (status: 'active' | 'archived') => ({ status, favorite: false }) as Page['metadata'];
    const note = (name: string, status: 'active' | 'archived', parentId: string | null = null) =>
      ({ id: name, type: 'daily-note', name, path: status === 'archived' ? `/vault/Archive/${name}.md` : `/vault/${name}.md`, parentId, metadata: meta(status), analysis: { tasks: [], tags: [], links: [], embeds: [], aliases: [] } }) as unknown as Page;
    const archivedFolder = { id: 'f', name: 'Old', path: '/vault/Archive/Old', parentId: null, metadata: { status: 'archived', favorite: false } } as never;
    const vault = new Vault(
      '/vault',
      [note('2026-07-10', 'active'), { ...note('2026-07-13', 'active'), metadata: meta('archived') } as Page, note('2026-07-11', 'archived'), { ...note('2026-07-12', 'active', 'f'), path: '/vault/Archive/Old/2026-07-12.md' }],
      [archivedFolder],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder()
    );

    expect([...datesWithNotes(Array.from(vault.dailyNotes()))]).toEqual(['2026-07-10', '2026-07-13']);
  });
});
