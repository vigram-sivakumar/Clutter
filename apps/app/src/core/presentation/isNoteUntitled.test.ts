import { describe, expect, it } from 'vitest';
import { isNoteUntitled } from './isNoteUntitled';
import type { Page } from '../vault/models/Page';

const defaultMetadata: Page['metadata'] = {
  icon: null,
  cover: null,
  description: null,
  favorite: false,
  status: 'active',
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

const defaultAnalysis: Page['analysis'] = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    type: 'note',
    name: 'Untitled',
    path: '/vault/Untitled.md',
    parentId: null,
    metadata: defaultMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

describe('isNoteUntitled', () => {
  it('is true for a Note with an auto-generated filename', () => {
    expect(isNoteUntitled(makePage({ name: 'Untitled 2' }))).toBe(true);
  });

  it('is false for a Note with a deliberate filename', () => {
    expect(isNoteUntitled(makePage({ name: 'Meeting Notes' }))).toBe(false);
  });

  it('is always false for a Daily Note, even though its filename is never a deliberate title', () => {
    expect(
      isNoteUntitled(makePage({ type: 'daily-note', name: '2026-08-02' }))
    ).toBe(false);
  });
});
