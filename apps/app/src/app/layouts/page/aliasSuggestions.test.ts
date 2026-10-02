import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';

import { createAliasSuggester } from './aliasSuggestions';

function makePage(id: string, path: string, aliases: string[] = []): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1, -3),
    path,
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: null,
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
      aliases,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: aliases.map((value) => ({ value })),
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  };
}

function suggesterFor(pages: Page[], currentPageId: string) {
  const vault = new Vault('/vault', pages, [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  return createAliasSuggester(vault, currentPageId);
}

describe('createAliasSuggester', () => {
  const current = makePage('me', '/vault/Me.md', ['Mine']);
  const guidelines = makePage('g', '/vault/Design/User Experience Guidelines.md', ['UX']);
  const research = makePage('r', '/vault/UX Research.md');

  it('offers other pages found by alias (adding the alias) or by title (adding the title)', () => {
    const suggest = suggesterFor([current, guidelines, research], 'me');

    expect(suggest('ux')).toEqual([
      { key: 'g:UX', value: 'UX', label: 'UX', detail: 'User Experience Guidelines' },
      { key: 'r:', value: 'UX Research', label: 'UX Research', detail: null },
    ]);
  });

  it("never suggests the current page's own title or aliases", () => {
    const suggest = suggesterFor([current, guidelines], 'me');

    expect(suggest('me')).toEqual([]);
    expect(suggest('mine')).toEqual([]);
  });

  it('shows one row per page when several pages share an alias', () => {
    const suggest = suggesterFor(
      [current, makePage('a', '/vault/A.md', ['Spec']), makePage('b', '/vault/B.md', ['Spec'])],
      'me'
    );

    expect(suggest('spec').map((row) => [row.value, row.detail])).toEqual([
      ['Spec', 'A'],
      ['Spec', 'B'],
    ]);
  });

  it('suggests nothing for empty text', () => {
    expect(suggesterFor([current, guidelines], 'me')('  ')).toEqual([]);
  });
});
