// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
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
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { TaskExtractor } from '@core/vault/ingest/extractors/TaskExtractor';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Page } from '@core/vault/models/Page';

/**
 * The Edit task flow through the real PageHost: a task's Edit button (beside its title in the Task
 * Collection) opens the same New task dialog in edit mode, and Save goes through the one existing
 * `TaskOperations.update` — it edits the task's own line in place, never creating a task.
 */

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

function setup(pages: Page[]) {
  const vault = new Vault(
    ROOT,
    pages,
    [],
    [],
    pages.flatMap((page) => page.analysis.tasks),
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
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
  application.collectionViewConfigStore.update('view:tasks', {
    layout: 'list',
  });
  application.navigation.openAllTasks();

  return { application, vault };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const editButtons = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    'button[aria-label="Edit task"]'
  ),
];
/** The Edit button of the task titled `title` (rows are sorted by name, so never rely on position). */
const rowOf = (title: string) =>
  [...document.querySelectorAll('.collection-entry__main')].find((content) =>
    content
      .querySelector('.collection-entry__title')
      ?.textContent?.startsWith(title)
  )!;
const editFor = (title: string) =>
  rowOf(title).querySelector<HTMLButtonElement>(
    'button[aria-label="Edit task"]'
  )!;
const dateFor = (title: string) =>
  rowOf(title).querySelector<HTMLButtonElement>(
    'button[aria-label="Set due date"], button[aria-label="Change due date"]'
  )!;
// Scoped to the picker: the sidebar's own calendar has day buttons too.
const pickDay = (day: string) =>
  fireEvent.click(
    [...document.querySelectorAll('.date-picker button')].find(
      (button) => button.textContent === day
    )!
  );
const dateButtons = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    'button[aria-label="Set due date"], button[aria-label="Change due date"]'
  ),
];
const titleField = () =>
  document.querySelector<HTMLTextAreaElement>('textarea, [role="textbox"]')!;

describe('PageHost: Edit task from the Task Collection', () => {
  const NOTE =
    '- [ ] Collect the bill @2020-01-05\n- [ ] Call the bank @2020-01-06';

  it('every task has an Edit button beside its title', async () => {
    const { application } = setup([pageWith('p1', NOTE)]);
    render(<AppLayout application={application} />);
    await flush();

    expect(editButtons()).toHaveLength(2);
    expect(dateButtons()).toHaveLength(2);
    // Both actions sit in one actions div, the body's (title + description's) sibling inside the entry's main row.
    const actions = editFor('Collect the bill').closest(
      '.collection-entry__actions'
    )!;
    expect(actions.parentElement).toHaveClass('collection-entry__main');
    expect(actions.previousElementSibling).toHaveClass(
      'collection-entry__body'
    );
    expect(
      [...actions.children].map((child) => child.getAttribute('aria-label'))
    ).toEqual(['Edit task', 'Change due date']);
  });

  it('Edit opens the New task dialog in edit mode, prepopulated with that task', async () => {
    const { application } = setup([pageWith('p1', NOTE)]);
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(editFor('Call the bank'));
    await flush();

    expect(document.body).toHaveTextContent('Edit task');
    expect(document.body).toHaveTextContent('Save changes');
    expect(titleField()).toHaveValue('Call the bank');
    expect(
      document.querySelector('.new-task__due-date-button')
    ).toHaveTextContent('6 Jan 20');
  });

  it('Save changes updates the existing task in its own note — no task is created', async () => {
    const { application, vault } = setup([pageWith('p1', NOTE)]);
    render(<AppLayout application={application} />);
    await flush();
    const tasksBefore = [...vault.tasks()].length;

    fireEvent.click(editFor('Collect the bill'));
    await flush();
    fireEvent.change(titleField(), { target: { value: 'Collect the parcel' } });
    fireEvent.click(document.querySelector('.new-task__create-button')!);
    await flush();

    await waitFor(() =>
      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Collect the parcel @2020-01-05\n- [ ] Call the bank @2020-01-06'
      )
    );
    expect([...vault.tasks()]).toHaveLength(tasksBefore);
    expect([...vault.tasks()].every((task) => task.sourcePageId === 'p1')).toBe(
      true
    );
    // The dialog closed itself.
    await waitFor(() =>
      expect(document.body).not.toHaveTextContent('Save changes')
    );
  });

  it('Cancel leaves the task unchanged', async () => {
    const { application, vault } = setup([pageWith('p1', NOTE)]);
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(editFor('Collect the bill'));
    await flush();
    fireEvent.change(titleField(), { target: { value: 'Something else' } });
    fireEvent.click(
      document.querySelector<HTMLElement>('.new-task [aria-label="Close"]')!
    );
    await flush();

    expect(vault.getPage('p1')!.source.markdown).toBe(NOTE);
    expect(document.body).not.toHaveTextContent('Save changes');
  });

  it('a task in a Daily Note is edited in that Daily Note — never moved, nothing created', async () => {
    const daily = pageWith(
      'd1',
      '- [ ] Submit report @2020-01-05',
      'Daily Notes/2020/January/2020-01-05.md'
    );
    const { application, vault } = setup([daily]);
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(editFor('Submit report'));
    await flush();
    fireEvent.change(titleField(), { target: { value: 'Submit the report' } });
    fireEvent.click(document.querySelector('.new-task__create-button')!);
    await flush();

    await waitFor(() =>
      expect(vault.getPage('d1')!.source.markdown).toBe(
        '- [ ] Submit the report @2020-01-05'
      )
    );
    expect([...vault.pages()]).toHaveLength(1);
    expect([...vault.tasks()].map((task) => task.sourcePageId)).toEqual(['d1']);
  });

  it('the due-date button opens the existing picker; choosing a day updates THAT task in its own note — no task is created', async () => {
    const { application, vault } = setup([pageWith('p1', NOTE)]);
    render(<AppLayout application={application} />);
    await flush();
    const tasksBefore = [...vault.tasks()].length;

    fireEvent.click(dateFor('Collect the bill'));
    await flush();
    pickDay('15');
    await flush();

    await waitFor(() =>
      expect(vault.getPage('p1')!.source.markdown).toBe(
        '- [ ] Collect the bill @2020-01-15\n- [ ] Call the bank @2020-01-06'
      )
    );
    expect([...vault.tasks()]).toHaveLength(tasksBefore);
    expect([...vault.pages()]).toHaveLength(1);
  });

  it('a task in a Daily Note keeps living in that Daily Note when its date is changed from the picker', async () => {
    const daily = pageWith(
      'd1',
      '- [ ] Submit report @2020-01-05',
      'Daily Notes/2020/January/2020-01-05.md'
    );
    const { application, vault } = setup([daily]);
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(dateFor('Submit report'));
    await flush();
    pickDay('20');
    await flush();

    await waitFor(() =>
      expect(vault.getPage('d1')!.source.markdown).toBe(
        '- [ ] Submit report @2020-01-20'
      )
    );
    expect([...vault.pages()]).toHaveLength(1);
    expect([...vault.tasks()].map((task) => task.sourcePageId)).toEqual(['d1']);
  });

  it('New task is unchanged: the header button still opens it in create mode, empty', async () => {
    const { application } = setup([pageWith('p1', NOTE)]);
    render(<AppLayout application={application} />);
    await flush();

    fireEvent.click(document.querySelector('button[aria-label="New task"]')!);
    await flush();

    expect(document.body).toHaveTextContent('New task');
    expect(document.body).not.toHaveTextContent('Save changes');
    expect(titleField()).toHaveValue('');
  });
});

describe('PageHost: Task Inbox collection', () => {
  it('uses the task collection without tabs or Source and opens Inbox tasks in the edit dialog', async () => {
    const { application } = setup([
      pageWith(
        'inbox-source',
        '- [ ] Captured @2026-11-20',
        '.clutter/inbox.md'
      ),
      pageWith('other', '- [ ] Elsewhere'),
    ]);
    application.navigation.openTaskInbox();
    render(<AppLayout application={application} />);
    await flush();
    const body = document.querySelector('.collection__content')!;
    expect(body).toHaveTextContent('Captured');
    expect(body).not.toHaveTextContent('Elsewhere');
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.querySelector('.collection__bottom-spacer')).not.toBeNull();
    fireEvent.click(rowOf('Captured'));
    await flush();
    expect(document.body).toHaveTextContent('Save changes');
    expect(titleField()).toHaveValue('Captured');
    expect(application.workspace.activeView).toMatchObject({
      type: 'filtered-view',
      view: { kind: 'tasks-inbox' },
    });
  });

  it('explains Tidy up in a confirmation and includes completed dated tasks', async () => {
    const { application } = setup([
      pageWith(
        'inbox-source',
        '- [x] Finished @2026-11-20 @completed:2026-11-14',
        '.clutter/inbox.md'
      ),
    ]);
    const tidy = vi
      .spyOn(application.taskOperations, 'tidyInbox')
      .mockResolvedValue(undefined);
    application.navigation.openTaskInbox();
    render(<AppLayout application={application} />);
    await flush();
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Tidy up"]')!;
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await flush();
    expect(document.body).toHaveTextContent('including completed tasks');
    expect(tidy).not.toHaveBeenCalled();
    const confirm = document.querySelector<HTMLButtonElement>(
      '.confirmation__actions button:last-child'
    )!;
    fireEvent.click(confirm);
    await flush();
    expect(tidy).toHaveBeenCalledWith(ROOT, 'inbox-source');
  });

  it('shows an empty Inbox without creating a source document', async () => {
    const { application, vault } = setup([]);
    application.navigation.openTaskInbox();
    render(<AppLayout application={application} />);
    await flush();
    expect(document.querySelector('.collection__content')).toHaveTextContent(
      'Tasks you create in Inbox will appear here'
    );
    expect([...vault.pages()]).toHaveLength(0);
  });
});


describe('Tidy up button availability', () => {
  it.each([
    ['missing Inbox', undefined],
    ['empty Inbox', ''],
    ['only undated tasks', '- [ ] Undated\n- [x] Done without a date'],
    ['only invalid dates', '- [ ] Invalid @2026-13-45'],
  ])('hides the button for %s even when another note has dated tasks', async (_label, body) => {
    const pages = [pageWith('other', '- [ ] Elsewhere @2026-11-20')];
    if (body !== undefined) pages.push(pageWith('inbox-source', body, '.clutter/inbox.md'));
    const { application } = setup(pages);
    application.navigation.openTaskInbox();
    render(<AppLayout application={application} />);
    await flush();
    expect(document.querySelector('button[aria-label="Tidy up"]')).toBeNull();
  });

  it('hides the trigger during a transfer and restores it after a failed attempt', async () => {
    const { application } = setup([pageWith('inbox-source', '- [ ] Dated @2026-11-20', '.clutter/inbox.md')]);
    let fail!: (error: Error) => void;
    vi.spyOn(application.taskOperations, 'tidyInbox').mockImplementation(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    application.navigation.openTaskInbox();
    render(<AppLayout application={application} />);
    await flush();
    fireEvent.click(document.querySelector('button[aria-label="Tidy up"]')!);
    await flush();
    fireEvent.click(document.querySelector('.confirmation__actions button:last-child')!);
    await flush();
    expect(document.querySelector('button[aria-label="Tidy up"]')).toBeNull();
    await act(async () => { fail(new Error('Couldn’t save')); });
    await flush();
    expect(document.querySelector('button[aria-label="Tidy up"]')).not.toBeNull();
  });
});
