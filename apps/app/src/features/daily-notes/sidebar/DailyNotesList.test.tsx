// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyNotesList } from './DailyNotesList';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { Workspace } from '@core/workspace/Workspace';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const defaultPageMetadata: Page['metadata'] = {
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

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function makeDailyNote(id: string, name: string, parentId: string): Page {
  return {
    id,
    type: 'daily-note',
    name,
    path: `${ROOT}/Daily Notes/2026/August/${name}.md`,
    parentId,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
  };
}

describe('DailyNotesList — empty month sections', () => {
  it('does not render a month section with no Daily Notes in it', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    // A month folder with zero Daily Notes inside — the empty-section case.
    const emptyMonth = makeFolder(
      'month-july',
      `${ROOT}/Daily Notes/2026/July`,
      'year-2026'
    );
    const vault = new Vault(
      ROOT,
      [],
      [dailyNotesRoot, year, emptyMonth],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder()
    );

    render(
      <DailyNotesList
        vault={vault}
        query={new VaultQuery(vault)}
        workspace={new Workspace()}
        onOpen={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    // Regex (not an exact string) so this doesn't depend on whether
    // formatMonthSectionTitle renders "July" or "July 2026" (isCurrentYear
    // is wall-clock-dependent, not something this test should assume).
    expect(screen.queryByText(/July/)).toBeNull();
  });

  it('renders a month section that has at least one Daily Note', () => {
    const dailyNotesRoot = makeFolder('root', `${ROOT}/Daily Notes`, null);
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'root');
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
    const note = makeDailyNote('daily-1', '2026-08-15', 'month-august');
    const vault = new Vault(
      ROOT,
      [note],
      [dailyNotesRoot, year, month],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      new VaultProjectionBuilder()
    );

    render(
      <DailyNotesList
        vault={vault}
        query={new VaultQuery(vault)}
        workspace={new Workspace()}
        onOpen={vi.fn()}
        onOpenFolder={vi.fn()}
      />
    );

    expect(screen.queryByText(/August/)).not.toBeNull();
  });
});
