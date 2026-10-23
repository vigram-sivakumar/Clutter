// @vitest-environment jsdom

// A timezone west of UTC, set before any date is made. This is where `new Date('YYYY-MM-DD')` (UTC midnight) is the
// evening of the day before, and where opening a daily note by parsing its ISO date that way opened the wrong one.
vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles';
});

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '@app/layouts/app-layout/AppLayout';
import { Application } from '@core/application/Application';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { DailyNotePath } from '@core/vault/ingest/DailyNotePath';
import { shiftDailyNoteDate, todayAsDailyNoteDate } from '@features/daily-notes/helpers/shiftDailyNoteDate';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { ShortcutsProvider } from './ShortcutsProvider';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
  convertFileSrc: (path: string) => `app://${path}`,
}));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  // jsdom has no layout: the daily notes list scrolls the chosen date into view.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })
  );
});
afterAll(() => void vi.unstubAllGlobals());
beforeEach(() => void vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeApplication(): Application {
  const vault = new Vault('/vault', [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), []);
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return application;
}

const press = (init: KeyboardEventInit & { code: string }) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, metaKey: true, ...init }));
  });

describe('daily notes open the day that was meant, west of UTC', () => {
  it('the test really is west of UTC: parsing an ISO date as UTC lands on the day before', () => {
    expect(new Date('2026-10-23').getDate()).toBe(22);
    expect(toDate('2026-10-23').getDate()).toBe(23);
  });

  it('⌃⌘← and ⌃⌘→ open yesterday’s and tomorrow’s daily notes by local calendar date', () => {
    const application = makeApplication();
    const open = vi.spyOn(application.pageOperations, 'openAtPath').mockResolvedValue(undefined as never);
    render(
      <ShortcutsProvider>
        <AppLayout application={application} />
      </ShortcutsProvider>
    );
    const today = todayAsDailyNoteDate();
    press({ code: 'ArrowLeft', ctrlKey: true });
    press({ code: 'ArrowRight', ctrlKey: true });
    expect(open.mock.calls.map(([path]) => path)).toEqual([
      DailyNotePath.absoluteFrom('/vault', toDate(shiftDailyNoteDate(today, -1))),
      DailyNotePath.absoluteFrom('/vault', toDate(shiftDailyNoteDate(today, 1))),
    ]);
  });

  it('clicking a date in the sidebar calendar opens that date’s daily note, not the day before', async () => {
    const application = makeApplication();
    const open = vi.spyOn(application.pageOperations, 'openAtPath').mockResolvedValue(undefined as never);
    render(
      <ShortcutsProvider>
        <AppLayout application={application} />
      </ShortcutsProvider>
    );
    fireEvent.click(screen.getByTestId('sidebar.tab.daily-notes'));
    // The calendar shows the current week; any date in it will do, and today's is always there.
    const now = new Date();
    const cell = await waitFor(() => {
      const found = [...document.querySelectorAll('.calendar-cell:not(.calendar-cell--outside-month)')].find(
        (el) => el.textContent === String(now.getDate())
      );
      expect(found).toBeDefined();
      return found!;
    });
    fireEvent.click(cell);
    const clicked = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expect(open).toHaveBeenCalledWith(DailyNotePath.absoluteFrom('/vault', clicked), { type: 'daily-note' });
  });
});
