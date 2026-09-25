// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '../app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import type { Page } from '@core/vault/models/Page';

/**
 * Regression coverage for the Daily Notes nav row (PageHost's
 * belowDescription wiring — [Calendar] [←] [Today] [→], below the
 * title/description, Daily Note pages only). Mirrors
 * PageHost.pdfEmbedExpand.test.tsx's real-AppLayout-composition approach so
 * a break anywhere in the chain (PageHost -> Page -> PageTitleSection ->
 * DailyNoteNavControls -> PageOperations.openAtPath) fails a test, not just
 * a unit in isolation.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function buildDailyNotePage(isoDate: string): Page {
  const builder = new PageBuilder(ROOT);
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!);
  const path = DailyNotePath.absoluteFrom(ROOT, date);

  return builder.build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id: `daily-${isoDate}` },
      frontmatterAnalysis: { aliases: [] },
      content: '',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function buildNotePage(markdown: string, pathSegment = 'Note.md'): Page {
  const builder = new PageBuilder(ROOT);
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${pathSegment}`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: markdown,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeApplication(pages: Page[]): Application {
  const vault = new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('PageHost: Daily Notes nav controls', () => {
  it('renders [Calendar] [←] [Today] [→] below the title/description for a Daily Note', async () => {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const application = makeApplication([dailyNote]);
    await application.pageOperations.open(dailyNote.id);

    render(<AppLayout application={application} />);
    await flush();

    const controls = document.querySelector('.daily-note-nav-controls');
    expect(controls).not.toBeNull();
    expect(controls!.querySelector('button[aria-label="Open calendar"]')).not.toBeNull();
    expect(controls!.querySelector('button[aria-label="Previous day"]')).not.toBeNull();
    expect(controls!.querySelector('button[aria-label="Today"]')).not.toBeNull();
    expect(controls!.querySelector('button[aria-label="Next day"]')).not.toBeNull();

    // Below the title/description, inside PageTitleSection's content area
    // — not beside the title (PageHeaderControls' emoji/more-actions row).
    const content = document.querySelector('.page-title-section__content')!;
    expect(content.contains(controls)).toBe(true);
  });

  it('does not render the controls for a normal Note', async () => {
    const note = buildNotePage('Just a note');
    const application = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    expect(document.querySelector('.daily-note-nav-controls')).toBeNull();
  });

  it('Previous opens the previous day\'s Daily Note', async () => {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const application = makeApplication([dailyNote]);
    await application.pageOperations.open(dailyNote.id);

    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(document.querySelector<HTMLButtonElement>(
      '.daily-note-nav-controls button[aria-label="Previous day"]'
    )!);
    await flush();

    await waitFor(() => {
      expect(document.querySelector('.page-title')?.textContent).toContain('14');
    });
  });

  it('Next opens the next day\'s Daily Note', async () => {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const application = makeApplication([dailyNote]);
    await application.pageOperations.open(dailyNote.id);

    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(document.querySelector<HTMLButtonElement>(
      '.daily-note-nav-controls button[aria-label="Next day"]'
    )!);
    await flush();

    await waitFor(() => {
      expect(document.querySelector('.page-title')?.textContent).toContain('16');
    });
  });

  it('Today opens today\'s Daily Note', async () => {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const application = makeApplication([dailyNote]);
    await application.pageOperations.open(dailyNote.id);

    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(document.querySelector<HTMLButtonElement>(
      '.daily-note-nav-controls button[aria-label="Today"]'
    )!);
    await flush();

    const todayDay = String(new Date().getDate());
    await waitFor(() => {
      expect(document.querySelector('.page-title')?.textContent).toContain(todayDay);
    });
  });

  it('Calendar button opens the existing Calendar overlay, and selecting a date opens that Daily Note', async () => {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const application = makeApplication([dailyNote]);
    await application.pageOperations.open(dailyNote.id);

    render(<AppLayout application={application} />);
    await flush();

    expect(document.querySelector('.overlay__surface .calendar')).toBeNull();

    fireEvent.click(document.querySelector<HTMLButtonElement>(
      '.daily-note-nav-controls button[aria-label="Open calendar"]'
    )!);
    await flush();

    const calendar = document.querySelector('.overlay__surface .calendar');
    expect(calendar).not.toBeNull();

    const selectedDay = calendar!.querySelector<HTMLButtonElement>(
      '[aria-selected="true"]'
    );
    expect(selectedDay).not.toBeNull();

    // Pick a different, unambiguous in-month day (10th).
    const targetDay = Array.from(calendar!.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '10'
    );
    expect(targetDay).toBeDefined();
    fireEvent.click(targetDay!);
    await flush();

    await waitFor(() => {
      expect(document.querySelector('.page-title')?.textContent).toContain('10');
    });
    // Selecting a date closes the overlay.
    expect(document.querySelector('.overlay__surface .calendar')).toBeNull();
  });
});
