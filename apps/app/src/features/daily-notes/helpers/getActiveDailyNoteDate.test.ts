import { describe, expect, it } from 'vitest';

import { getActiveDailyNoteDate } from './getActiveDailyNoteDate';
import type { Vault } from '@core/vault/models/Vault';
import type { PageOperations, DraftInfo } from '@core/application/page/PageOperations';
import type { Page } from '@core/vault/models/Page';

function vaultWith(page: Page | undefined): Pick<Vault, 'getPage'> {
  return { getPage: () => page };
}

function pageOperationsWith(draft: DraftInfo | undefined): Pick<PageOperations, 'getDraft'> {
  return { getDraft: () => draft };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    type: 'daily-note',
    name: '2026-07-27',
    path: '/vault/Daily Notes/2026/July/2026-07-27.md',
    parentId: null,
    metadata: {
      icon: null,
      favorite: false,
      description: null,
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
    ...overrides,
  };
}

describe('getActiveDailyNoteDate', () => {
  it('returns undefined when no page is active', () => {
    expect(getActiveDailyNoteDate(vaultWith(undefined), null, pageOperationsWith(undefined))).toBeUndefined();
  });

  it("returns the persisted Daily Note's name when it is the active page", () => {
    const page = makePage({ name: '2026-07-27' });

    expect(
      getActiveDailyNoteDate(vaultWith(page), page.id, pageOperationsWith(undefined))
    ).toBe('2026-07-27');
  });

  it('returns undefined when the active persisted page is a regular Note', () => {
    const page = makePage({ type: 'note', name: 'My Note' });

    expect(
      getActiveDailyNoteDate(vaultWith(page), page.id, pageOperationsWith(undefined))
    ).toBeUndefined();
  });

  it("returns an unpersisted Daily Note draft's title (ADR-017)", () => {
    const draft: DraftInfo = { folderId: 'folder-1', type: 'daily-note', title: '2026-08-05' };

    expect(
      getActiveDailyNoteDate(vaultWith(undefined), 'draft-id', pageOperationsWith(draft))
    ).toBe('2026-08-05');
  });

  it('returns undefined when the active draft is a regular Note draft', () => {
    const draft: DraftInfo = { folderId: null, type: 'note', title: 'Untitled' };

    expect(
      getActiveDailyNoteDate(vaultWith(undefined), 'draft-id', pageOperationsWith(draft))
    ).toBeUndefined();
  });

  it('never falls back to today or any other date when nothing qualifies', () => {
    expect(
      getActiveDailyNoteDate(vaultWith(undefined), 'unknown-id', pageOperationsWith(undefined))
    ).toBeUndefined();
  });
});
