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
    <DailyNotesShortcuts
      vault={vault}
      activeDate={activeDate}
      onStartToday={vi.fn()}
      onOpenDate={vi.fn()}
    />
  );
}

describe('DailyNotesShortcuts — "Start your day..." visibility', () => {
  it('shows the CTA when today has no note and nothing is open', () => {
    renderShortcuts(makeVault(), undefined);

    expect(screen.queryByText('Start your day...')).not.toBeNull();
  });

  it('hides the CTA when a persisted note for today already exists', () => {
    renderShortcuts(makeVault([makeDailyNote(TODAY)]), undefined);

    expect(screen.queryByText('Start your day...')).toBeNull();
  });

  it('hides the CTA when today is open as an unpersisted draft (no Vault page yet, activeDate is today)', () => {
    renderShortcuts(makeVault(), TODAY);

    expect(screen.queryByText('Start your day...')).toBeNull();
  });

  it('still shows the CTA when a different, non-today date is open', () => {
    renderShortcuts(makeVault(), '2020-01-01');

    expect(screen.queryByText('Start your day...')).not.toBeNull();
  });
});
