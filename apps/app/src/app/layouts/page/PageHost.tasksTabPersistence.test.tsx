// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
} from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
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
import { TasksViewConfigStore } from '@core/application/task/TasksViewConfigStore';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { TaskExtractor } from '@core/vault/ingest/extractors/TaskExtractor';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';

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
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function pageWith(id: string, body: string, segment = `${id}.md`): Page {
  const directory = segment.includes('/')
    ? `${ROOT}/${segment.slice(0, segment.lastIndexOf('/'))}`
    : ROOT;

  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${segment}`,
      directoryPath: directory,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: new TaskExtractor().extract(body),
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

/**
 * The Tasks page's tab selection survives an app restart: choosing a tab is written through
 * `TasksViewConfigStore` (the same `tasksViewConfig` entry as the display preferences), and a fresh
 * `Application` booted over the same files — as `bootstrap()` does — reopens the page on that tab.
 */

const TASKS = [
  '- [ ] Plain undated task',
  '- [ ] Due today task @' + new Date().toISOString().slice(0, 10),
  '- [ ] Due later task @2999-01-01',
].join('\n');

async function boot(fileSystem: InMemoryVaultFileSystem) {
  const page = pageWith('p1', TASKS);
  const vault = new Vault(
    ROOT,
    [page],
    [],
    [],
    page.analysis.tasks,
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  // What bootstrap() does at start-up: load the persisted store from the files, then construct.
  const tasksViewConfigStore = await TasksViewConfigStore.load(fileSystem, ROOT);
  const application = new Application(
    vault,
    fileSystem,
    new SelfWriteRegistry(),
    undefined,
    undefined,
    undefined,
    tasksViewConfigStore
  );
  application.attachVault(
    vault,
    new PageCreator(new UuidGenerator(), new PageFactory()),
    new DailyNoteService()
  );
  application.collectionViewConfigStore.update('view:tasks', { layout: 'list' });
  application.navigation.openAllTasks();

  return application;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const activeTab = () => document.querySelector('.page-title-section .tab--active')?.textContent;
const listedTasks = () =>
  [...document.querySelectorAll('.collection-entry .task-title')].map((el) => el.textContent);
const tab = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('.page-title-section .tab')].find((el) => el.textContent === label)!;

describe('Tasks page tab selection persists across an app restart', () => {
  it('a first launch opens on All Tasks, with every task listed', async () => {
    render(<AppLayout application={await boot(new InMemoryVaultFileSystem())} />);
    await flush();

    expect(activeTab()).toBe('All Tasks');
    expect(listedTasks()).toHaveLength(3);
  });

  it.each([
    ['Today', ['Due today task']],
    ['Upcoming', ['Due later task']],
    ['Unscheduled', ['Plain undated task']],
  ])('after choosing %s and restarting, the page reopens on it with its list', async (label, expected) => {
    const fileSystem = new InMemoryVaultFileSystem();

    const first = render(<AppLayout application={await boot(fileSystem)} />);
    await flush();
    fireEvent.click(tab(label));
    await flush();
    expect(activeTab()).toBe(label);
    expect(listedTasks()).toEqual(expected);
    first.unmount();

    // "Restart": a brand-new Application over the same files.
    render(<AppLayout application={await boot(fileSystem)} />);
    await flush();

    expect(activeTab()).toBe(label);
    expect(listedTasks()).toEqual(expected);
  });

  it('the latest selection wins, and returning to All Tasks is remembered too', async () => {
    const fileSystem = new InMemoryVaultFileSystem();

    const first = render(<AppLayout application={await boot(fileSystem)} />);
    await flush();
    fireEvent.click(tab('Today'));
    await flush();
    fireEvent.click(tab('All Tasks'));
    await flush();
    first.unmount();

    render(<AppLayout application={await boot(fileSystem)} />);
    await flush();

    expect(activeTab()).toBe('All Tasks');
    expect(listedTasks()).toHaveLength(3);
  });

  it('an unrecognised stored tab (an old or hand-edited file) opens All Tasks instead of failing', async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({ tasksViewConfig: { selectedTab: 'overdue' } }),
    });

    render(<AppLayout application={await boot(fileSystem)} />);
    await flush();

    expect(activeTab()).toBe('All Tasks');
  });
});
