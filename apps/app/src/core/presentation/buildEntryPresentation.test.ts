import { describe, expect, it } from 'vitest';
import { buildEntryPresentation } from './buildEntryPresentation';
import { formatDailyNoteDateLabel } from './formatDailyNoteTitle';
import type { Folder } from '@core/vault/models/Folder';

const defaultMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Untitled',
    path: '/vault/Untitled',
    parentId: null,
    metadata: defaultMetadata,
    ...overrides,
  };
}

describe('buildEntryPresentation (folder)', () => {
  it('shows the deliberate folder name with default styling', () => {
    const result = buildEntryPresentation(makeFolder({ name: 'Projects' }));

    expect(result.title).toBe('Projects');
    expect(result.titleStyle).toBe('default');
  });

  it('shows the placeholder with placeholder styling for a generated folder name', () => {
    const result = buildEntryPresentation(makeFolder({ name: 'Untitled 2' }));

    expect(result.title).toBe('New Folder');
    expect(result.titleStyle).toBe('placeholder');
  });
});

describe('buildEntryPresentation (page)', () => {
  const page = (overrides: Partial<Parameters<typeof buildEntryPresentation>[0]> = {}) =>
    ({
      type: 'note',
      name: 'Meeting',
      description: null,
      markdown: '',
      icon: null,
      ...overrides,
    }) as Parameters<typeof buildEntryPresentation>[0];

  it('a Daily Note is its formatted date title in any list (the Trash, a collection), whatever it holds', () => {
    for (const content of [
      { description: null, markdown: '' },
      { description: null, markdown: 'Meeting notes' },
      { description: 'Planning day', markdown: 'Meeting notes' },
    ]) {
      const result = buildEntryPresentation(page({ type: 'daily-note', name: '2026-08-02', ...content }));

      expect(result.title).toBe(formatDailyNoteDateLabel('2026-08-02'));
      expect(result.titleStyle).toBe('default');
    }
  });

  it('a regular titled note keeps its title', () => {
    const result = buildEntryPresentation(page({ name: 'Meeting' }));

    expect(result.title).toBe('Meeting');
    expect(result.titleStyle).toBe('default');
  });

  it('a regular untitled note keeps its existing placeholder', () => {
    const result = buildEntryPresentation(page({ name: 'Untitled 2' }));

    expect(result.title).toBe('New Note');
    expect(result.titleStyle).toBe('placeholder');
  });
});
