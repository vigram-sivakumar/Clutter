import { vi } from 'vitest';

import type { SystemIcon } from '@shared/icon';

import type { CollectionEntryModel } from '../page/CollectionEntryModel';

/**
 * Builds a `CollectionEntryModel` for tests from a flat, readable fixture. Everything that is a
 * collection property goes into `values` (as the raw value the domain adapter would produce:
 * dates are ISO instants, never display text); the rest is identity / payload. The one place
 * that knows the entry's shape, so a test never hand-assembles `values`.
 */
export interface EntryFixture {
  readonly id?: string;
  /** The Name value. */
  readonly title?: string;
  readonly icon?: SystemIcon;
  readonly emoji?: string | null;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  readonly description?: string;
  /** A cover that is SHOWN (an entry with a hidden cover simply has none). */
  readonly cover?: string;
  /** ISO instants. */
  readonly created?: string;
  readonly updated?: string;
  readonly archived?: string;
  readonly markdown?: string;
  readonly coverPositionAbove?: number;
  /** The Source property value: the note a Tag collection matching-content entry's line lives in. */
  readonly source?: string;
  /** A Tag collection matching-content entry's body line (the entry then stands for that line, not the note). */
  readonly tagLine?: string;
  /** The source note's id of such an entry. */
  readonly noteId?: string;
  readonly subfolderCount?: number;
  readonly noteCount?: number;
}

function entryOf(type: 'note' | 'folder', defaults: { id: string; title: string; icon: SystemIcon }, fixture: EntryFixture): CollectionEntryModel {
  const { id, title, icon, emoji, selected, onClick, description, cover, created, updated, archived, source, ...payload } = fixture;

  return {
    id: id ?? defaults.id,
    type,
    icon: icon ?? defaults.icon,
    emoji: emoji ?? null,
    selected: selected ?? false,
    onClick: onClick ?? vi.fn(),
    values: {
      name: title ?? defaults.title,
      type: type === 'folder' ? 'Folder' : 'Note',
      ...(description !== undefined && { description }),
      ...(cover !== undefined && { cover }),
      ...(created !== undefined && { created }),
      ...(updated !== undefined && { updated }),
      ...(archived !== undefined && { archived }),
      ...(source !== undefined && { source }),
    },
    ...payload,
  };
}

export function noteEntry(fixture: EntryFixture = {}): CollectionEntryModel {
  return entryOf('note', { id: 'note-1', title: 'My note', icon: 'note' }, fixture);
}

export function folderEntry(fixture: EntryFixture = {}): CollectionEntryModel {
  return entryOf('folder', { id: 'folder-1', title: 'My Folder', icon: 'folder' }, fixture);
}
