// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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
import { writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';

/**
 * The Date format preference and the system language, changed while the app is open: the dates already on
 * screen — a Daily Note's title in the page header, an `@date` mention in the editor — follow, with no reload
 * and no edit.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  setSystemLocaleOverride('en-IN');
});

const ROOT = '/vault';
// A past year, so the year always shows and the expectations hold on any day.
const ISO = '2020-01-15';
const DATE = new Date(2020, 0, 15);

function buildPage(path: string, id: string, content: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

async function openApplicationWith(page: Page): Promise<Application> {
  const vault = new Vault(
    ROOT,
    [page],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    []
  );
  const application = new Application(
    vault,
    new InMemoryVaultFileSystem(),
    new SelfWriteRegistry()
  );
  application.attachVault(
    vault,
    new PageCreator(new UuidGenerator(), new PageFactory()),
    new DailyNoteService()
  );
  await application.pageOperations.open(page.id);
  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const titleText = () =>
  document.querySelector<HTMLElement>('.page-title')!.textContent;

describe('a Daily Note title follows the Date format and the system language while the app is open', () => {
  async function renderDailyNote() {
    const page = buildPage(
      DailyNotePath.absoluteFrom(ROOT, DATE),
      `daily-${ISO}`,
      ''
    );
    render(<AppLayout application={await openApplicationWith(page)} />);
    await flush();
  }

  it('changes with the preference, and returns to the default when "system" is chosen again', async () => {
    await renderDailyNote();
    expect(titleText()).toBe('Wed, 15 January 2020');

    act(() => writeDateFormatChoice('dmy'));
    expect(titleText()).toBe('15/01/2020');

    act(() => writeDateFormatChoice('weekday'));
    expect(titleText()).toBe('Wed, 15 Jan 2020');

    act(() => writeDateFormatChoice('relative'));
    expect(titleText()).toBe('Wed, 15 January 2020');
    expect(localStorage.getItem('clutter-date-format')).toBeNull();
  });

  it('changes with the system language, with no stored override', async () => {
    await renderDailyNote();
    expect(titleText()).toBe('Wed, 15 January 2020');

    act(() => {
      setSystemLocaleOverride('en-US');
      window.dispatchEvent(new Event('languagechange'));
    });
    expect(titleText()).toBe('Wed, January 15, 2020');
    expect(localStorage.getItem('clutter-date-format')).toBeNull();
  });
});

describe('an @date mention in an open note follows the Date format', () => {
  const mention = () => document.querySelector<HTMLElement>('.tok-date');

  it('rewrites its label in place', async () => {
    const page = buildPage(
      `${ROOT}/Plan.md`,
      'plan',
      'Review @2020-03-05 later'
    );
    render(<AppLayout application={await openApplicationWith(page)} />);
    await flush();

    expect(mention()?.textContent).toBe('@5 Mar 2020');

    act(() => writeDateFormatChoice('dmy'));
    await flush();
    expect(mention()?.textContent).toBe('@05/03/2020');

    act(() => writeDateFormatChoice('relative'));
    await flush();
    expect(mention()?.textContent).toBe('@5 Mar 2020');
  });

  it('leaves the stored text exactly as written', async () => {
    const page = buildPage(
      `${ROOT}/Plan.md`,
      'plan',
      'Review @2020-03-05 later'
    );
    const application = await openApplicationWith(page);
    render(<AppLayout application={application} />);
    await flush();

    act(() => writeDateFormatChoice('mdy'));
    await flush();

    expect(document.querySelector('.cm-content')?.textContent).toContain('@');
    expect(application.vault.getPage('plan')?.source.markdown).toBe(
      'Review @2020-03-05 later'
    );
  });
});
