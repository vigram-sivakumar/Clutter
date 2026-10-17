// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
 * Regression coverage for the Daily Note calendar control (PageHost puts DailyNoteNavControls, calendar
 * button only, in the title section's controls row above the title — Daily Note pages only, drafts included;
 * the page top bar carries none). Mirrors
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

/** Every instance of the control on the page: there must be exactly one, in the controls row above the title. */
const allControls = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('.daily-note-nav-controls'));
const headerControls = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('.page-title-section > .page-header-controls .daily-note-nav-controls');
const calendarButtons = () => document.querySelectorAll('button[aria-label="Open calendar"]');

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('PageHost: the Daily Note calendar control above the title', () => {
  async function openDaily(isoDates: string[], open: string) {
    const pages = isoDates.map(buildDailyNotePage);
    const application = makeApplication(pages);
    await application.pageOperations.open(pages[isoDates.indexOf(open)]!.id);
    render(<AppLayout application={application} />);
    await flush();
    return application;
  }

  it('shows the calendar button — and only it — in the controls row above the title', async () => {
    await openDaily(['2026-01-15'], '2026-01-15');

    const controls = headerControls();
    expect(controls).not.toBeNull();
    expect(controls!.querySelectorAll('button')).toHaveLength(1);
    expect(controls!.querySelector('button[aria-label="Open calendar"]')).not.toBeNull();
    // previous / Today / next are neither here nor anywhere else, and leave no empty wrapper.
    expect(document.querySelector('button[aria-label="Previous day"]')).toBeNull();
    expect(document.querySelector('button[aria-label="Today"]')).toBeNull();
    expect(document.querySelector('button[aria-label="Next day"]')).toBeNull();
    expect(document.querySelector('.daily-note__date-nav')).toBeNull();
  });

  it('is above the title, not below it, not beside it, and not in the top bar — one control only', async () => {
    await openDaily(['2026-01-15'], '2026-01-15');

    const controlsRow = document.querySelector('.page-title-section > .page-header-controls')!;
    const content = document.querySelector('.page-title-section__content')!;
    expect(controlsRow.nextElementSibling).toBe(content); // the row sits directly above the title block
    expect(content.querySelector('.daily-note-nav-controls')).toBeNull();
    expect(document.querySelector('.page-title-section__content + .daily-note-nav-controls')).toBeNull();
    expect(document.querySelector('.topbar .daily-note-nav-controls')).toBeNull();
    expect(allControls()).toHaveLength(1);
    expect(calendarButtons()).toHaveLength(1);
  });

  it('does not render the control for a normal Note', async () => {
    const note = buildNotePage('Just a note');
    const application = makeApplication([note]);
    await application.pageOperations.open(note.id);

    render(<AppLayout application={application} />);
    await flush();

    expect(allControls()).toHaveLength(0);
    expect(calendarButtons()).toHaveLength(0);
  });

  it('renders it for a draft Daily Note too', async () => {
    const application = makeApplication([]);
    const draftPath = DailyNotePath.absoluteFrom(ROOT, new Date(2026, 0, 20));
    await application.pageOperations.openAtPath(draftPath, { type: 'daily-note' });

    render(<AppLayout application={application} />);
    await flush();

    expect(headerControls()).not.toBeNull();
    expect(allControls()).toHaveLength(1);
    expect(calendarButtons()).toHaveLength(1);
  });

  it('the calendar opens from there with the viewed date selected', async () => {
    await openDaily(['2026-01-15'], '2026-01-15');
    expect(document.querySelector('.overlay__surface .calendar')).toBeNull();

    fireEvent.click(headerControls()!.querySelector<HTMLButtonElement>('button[aria-label="Open calendar"]')!);
    await flush();

    const calendar = document.querySelector('.overlay__surface .calendar');
    expect(calendar).not.toBeNull();
    const selected = calendar!.querySelectorAll('.calendar-cell--selected');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.textContent?.trim()).toBe('15');
  });

  it('selecting a date opens that Daily Note and closes the overlay', async () => {
    await openDaily(['2026-01-15'], '2026-01-15');

    fireEvent.click(headerControls()!.querySelector<HTMLButtonElement>('button[aria-label="Open calendar"]')!);
    await flush();
    const calendar = document.querySelector('.overlay__surface .calendar')!;
    // Pick a different, unambiguous in-month day (10th).
    const targetDay = Array.from(calendar.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '10'
    );
    expect(targetDay).toBeDefined();
    fireEvent.click(targetDay!);
    await flush();

    await waitFor(() => {
      expect(document.querySelector('.page-title')?.textContent).toContain('10');
    });
    expect(document.querySelector('.overlay__surface .calendar')).toBeNull();
    // Still exactly one control after navigating.
    expect(allControls()).toHaveLength(1);
  });

  it('the selected date follows the page when navigating between Daily Notes', async () => {
    const application = await openDaily(['2026-01-15', '2026-01-16'], '2026-01-15');
    const selectedAfterOpening = async () => {
      fireEvent.click(headerControls()!.querySelector<HTMLButtonElement>('button[aria-label="Open calendar"]')!);
      await flush();
      const text = document.querySelector('.overlay__surface .calendar .calendar-cell--selected')?.textContent?.trim();
      fireEvent.keyDown(document, { key: 'Escape' });
      await flush();
      return text;
    };
    expect(await selectedAfterOpening()).toBe('15');

    await act(async () => {
      await application.pageOperations.open(buildDailyNotePage('2026-01-16').id);
    });
    await flush();

    expect(await selectedAfterOpening()).toBe('16');
    expect(allControls()).toHaveLength(1);
  });

  it('is gone again when navigating from a Daily Note to a regular note', async () => {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const note = buildNotePage('Just a note');
    const application = makeApplication([dailyNote, note]);
    await application.pageOperations.open(dailyNote.id);
    render(<AppLayout application={application} />);
    await flush();
    expect(allControls()).toHaveLength(1);

    await act(async () => {
      await application.pageOperations.open(note.id);
    });
    await flush();

    expect(allControls()).toHaveLength(0);
  });
});

describe('PageHost: the calendar and More menus share the controls row', () => {
  async function openDailyNote() {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const application = makeApplication([dailyNote]);
    await application.pageOperations.open(dailyNote.id);
    render(<AppLayout application={application} />);
    await flush();
  }
  const row = () => document.querySelector('.page-title-section > .page-header-controls')!;
  const calendarButton = () => screen.getByRole('button', { name: 'Open calendar' });
  // The title section's own More actions button (the top bar has another one).
  const moreButton = () => row().querySelector<HTMLButtonElement>('.page-header-controls__menu')!;

  it('opening the calendar highlights its button and keeps both visible; More stays closed', async () => {
    await openDailyNote();
    expect(row()).not.toHaveAttribute('data-menu-open');

    fireEvent.click(calendarButton());
    await flush();

    expect(document.querySelector('.overlay__surface .calendar')).not.toBeNull();
    expect(calendarButton()).toHaveClass('button--active');
    expect(row()).toHaveAttribute('data-menu-open');
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening More closes the calendar, and opening the calendar closes More — never both', async () => {
    await openDailyNote();

    fireEvent.click(calendarButton());
    await flush();
    fireEvent.click(moreButton());
    await flush();
    expect(document.querySelector('.overlay__surface .calendar')).toBeNull();
    expect(calendarButton()).toHaveAttribute('aria-expanded', 'false');
    expect(moreButton()).toHaveAttribute('aria-expanded', 'true');
    expect(moreButton()).toHaveClass('button--active');
    expect(row()).toHaveAttribute('data-menu-open');

    fireEvent.click(calendarButton());
    await flush();
    expect(document.querySelector('.overlay__surface .calendar')).not.toBeNull();
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false');
    expect(calendarButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('selecting a date still navigates and clears the row marker', async () => {
    await openDailyNote();
    fireEvent.click(calendarButton());
    await flush();

    const day = Array.from(document.querySelectorAll<HTMLButtonElement>('.overlay__surface .calendar button')).find(
      (button) => button.textContent?.trim() === '10'
    );
    fireEvent.click(day!);
    await flush();

    await waitFor(() => expect(document.querySelector('.page-title')?.textContent).toContain('10'));
    expect(document.querySelector('.overlay__surface .calendar')).toBeNull();
    expect(row()).not.toHaveAttribute('data-menu-open');
  });
});

describe('PageHost: every menu trigger keeps its forced-hover state while its menu is open', () => {
  async function openDailyNote() {
    const dailyNote = buildDailyNotePage('2026-01-15');
    const application = makeApplication([dailyNote]);
    await application.pageOperations.open(dailyNote.id);
    render(<AppLayout application={application} />);
    await flush();
  }
  const titleRow = () => document.querySelector('.page-title-section > .page-header-controls')!;
  const triggers = () => ({
    calendar: screen.getByRole('button', { name: 'Open calendar' }),
    titleMore: titleRow().querySelector<HTMLButtonElement>('.page-header-controls__menu')!,
    topBarMore: document.querySelector<HTMLButtonElement>('.topbar button[aria-label="More actions"]')!,
  });
  const close = async () => {
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
  };

  it.each(['calendar', 'titleMore', 'topBarMore'] as const)(
    '%s: highlighted while its menu is open — through the pointer leaving — and normal again after it closes',
    async (name) => {
      await openDailyNote();
      for (const trigger of Object.values(triggers())) expect(trigger).not.toHaveClass('button--active');

      fireEvent.click(triggers()[name]);
      await flush();
      fireEvent.mouseLeave(titleRow());
      fireEvent.pointerLeave(document.querySelector('.page-title-section')!);

      expect(triggers()[name]).toHaveClass('button--active');
      expect(triggers()[name]).toHaveAttribute('aria-expanded', 'true');
      for (const [other, trigger] of Object.entries(triggers())) {
        if (other !== name) expect(trigger).not.toHaveClass('button--active');
      }

      await close();
      expect(triggers()[name]).not.toHaveClass('button--active');
      expect(triggers()[name]).toHaveAttribute('aria-expanded', 'false');
    }
  );
});

