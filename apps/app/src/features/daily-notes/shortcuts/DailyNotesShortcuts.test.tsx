// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DailyNotesShortcuts } from './DailyNotesShortcuts';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { Page } from '@core/vault/models/Page';

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';
const TODAY = toISODate(new Date());

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

function makeDailyNote(name: string): Page {
  return {
    id: `daily-${name}`,
    type: 'daily-note',
    name,
    path: `${ROOT}/Daily Notes/${name}.md`,
    parentId: null,
    metadata: defaultMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
  };
}

function makeVault(pages: Page[] = []): Vault {
  return new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function renderShortcuts(vault: Vault, activeDate: string | undefined) {
  return render(
    <DailyNotesShortcuts vault={vault} activeDate={activeDate} onOpenDate={vi.fn()} />
  );
}

// The "Start your day..." CTA was removed in favor of a permanent first
// row in DailyNotesList (see DailyNotesList.test.tsx's "permanent today
// row" suite) — today's Daily Note is now always represented there,
// never as a conditional element in the shortcuts/calendar section.
// These tests are a regression guard: no state should bring the CTA back.
describe('DailyNotesShortcuts — no conditional "Start your day..." CTA', () => {
  it('never renders the CTA when today has no note and nothing is open', () => {
    renderShortcuts(makeVault(), undefined);

    expect(screen.queryByText('Start your day...')).toBeNull();
  });

  it('never renders the CTA when a persisted note for today already exists', () => {
    renderShortcuts(makeVault([makeDailyNote(TODAY)]), undefined);

    expect(screen.queryByText('Start your day...')).toBeNull();
  });

  it('never renders the CTA when today is open as an unpersisted draft', () => {
    renderShortcuts(makeVault(), TODAY);

    expect(screen.queryByText('Start your day...')).toBeNull();
  });

  it('never renders the CTA when a different, non-today date is open', () => {
    renderShortcuts(makeVault(), '2020-01-01');

    expect(screen.queryByText('Start your day...')).toBeNull();
  });
});
