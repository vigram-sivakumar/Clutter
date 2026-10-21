// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreferredTemplatesStore } from '@core/application/templates/PreferredTemplatesStore';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { AppIcon } from '@shared/icon';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { PreferredTemplates, type TemplatesSource } from './PreferredTemplates';
import { Settings } from '../Settings';

const ROOT = '/vault';

const template = (
  id: string,
  name: string,
  description?: string,
  emoji: string | null = null
) =>
  ({
    id,
    type: 'note',
    // What the collection entry of a template page really carries: the generic note icon.
    icon: 'note',
    emoji,
    selected: false,
    onClick: vi.fn(),
    values: { name, ...(description !== undefined && { description }) },
  }) as unknown as CollectionEntryModel;

const MEETING = template('meeting', 'Meeting', 'Agenda and notes', '📅');
const JOURNAL = template('journal', 'Journal');
const WEEKLY = template('weekly', 'Weekly review', 'Plan the week');

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const flushWrites = () => new Promise((resolve) => setTimeout(resolve, 0));

function sourceFor(
  store: PreferredTemplatesStore,
  getTemplates: () => CollectionEntryModel[]
): TemplatesSource {
  return {
    getTemplates,
    onCreateTemplate: vi.fn(),
    onOpenTemplate: vi.fn(),
    preferred: {
      getIds: (context) => store.getIds(context),
      add: (id, context) => store.add(id, context),
      remove: (id, context) => store.remove(id, context),
      subscribe: store.subscribe,
      getDefaultDailyNoteId: () => store.getDefaultDailyNoteTemplateId(),
      setDefaultDailyNote: (id) => store.setDefaultDailyNoteTemplate(id),
    },
  };
}

function setup(
  options: { ids?: string[]; templates?: CollectionEntryModel[] } = {}
) {
  const fileSystem = new InMemoryVaultFileSystem(
    options.ids
      ? {
          [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({
            preferredTemplates: options.ids,
          }),
        }
      : {}
  );
  let templates = options.templates ?? [MEETING, JOURNAL, WEEKLY];
  return {
    fileSystem,
    setTemplates: (next: CollectionEntryModel[]) => {
      templates = next;
    },
    async mount() {
      const store = await PreferredTemplatesStore.load(fileSystem, ROOT);
      const source = sourceFor(store, () => templates);
      const view = render(<PreferredTemplates templates={source} />);
      return { store, source, view };
    },
  };
}

const chooseButton = () =>
  screen.getByRole('button', { name: 'Choose templates' });
const pick = (name: string) => {
  fireEvent.click(chooseButton());
  fireEvent.click(screen.getByText(name));
};
const rows = () =>
  Array.from(document.querySelectorAll('.preferred-templates__list .entry'));
const titles = () =>
  rows().map((row) => row.querySelector('.entry__content')?.textContent);
const removeButton = (name: string) =>
  screen.getByRole('button', { name: `Remove ${name}` });

describe('PreferredTemplates — the entry and its button', () => {
  it('is the "Templates" group with the entry, a text-only outline button (no icon) in its trailing slot', async () => {
    await act(async () => void (await setup().mount()));
    // On the Daily notes page the Preferred templates group has no title of its own (the group above has "Template").
    expect(
      screen.getByText('Preferred templates').closest('.settings-group')?.querySelector('.settings-group__title')
    ).toBeNull();
    expect(screen.getByText('Preferred templates')).toBeInTheDocument();
    expect(
      screen.getByText('Choose which templates appear first in suggestions')
    ).toBeInTheDocument();
    expect(chooseButton()).toHaveClass('button--outline');
    expect(chooseButton().closest('.settings-entry__trailing')).not.toBeNull();
    expect(chooseButton().querySelector('.app-icon')).toBeNull();
  });

  it('keeps its button in the active (forced-hover) state only while the picker is open', async () => {
    await act(async () => void (await setup().mount()));
    expect(chooseButton()).not.toHaveClass('button--active');
    fireEvent.click(chooseButton());
    expect(chooseButton()).toHaveClass('button--active');
    expect(chooseButton()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByText('Journal'));
    expect(chooseButton()).not.toHaveClass('button--active');
  });

  it("opens the existing picker with the Space's templates, in the supplied order", async () => {
    await act(async () => void (await setup().mount()));
    fireEvent.click(chooseButton());
    expect(screen.getByPlaceholderText('Search templates')).toBeInTheDocument();
    expect(screen.getByText('New template')).toBeInTheDocument();
    const [a, b] = ['Meeting', 'Journal'].map((name) => screen.getByText(name));
    expect(
      a!.compareDocumentPosition(b!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("runs the creation flow from the picker's New template row", async () => {
    let source!: TemplatesSource;
    await act(async () => void ({ source } = await setup().mount()));
    fireEvent.click(chooseButton());
    fireEvent.click(screen.getByText('New template'));
    expect(source.onCreateTemplate).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText('Search templates')).toBeNull();
  });

  it('still opens an empty picker when no templates source is supplied', () => {
    render(<PreferredTemplates />);
    fireEvent.click(chooseButton());
    expect(screen.getByPlaceholderText('Search templates')).toBeInTheDocument();
  });
});

describe('PreferredTemplates — selected templates', () => {
  it('shows no list until a template is selected', async () => {
    await act(async () => void (await setup().mount()));
    expect(rows()).toHaveLength(0);
  });

  it('adds a selected template as an Entry row and closes the picker', async () => {
    await act(async () => void (await setup().mount()));
    pick('Meeting');
    expect(titles()).toEqual(['Meeting']);
    expect(screen.queryByPlaceholderText('Search templates')).toBeNull();
  });

  it("draws the template's own emoji when it has one", async () => {
    await act(async () => void (await setup().mount()));
    pick('Meeting'); // 📅
    const leading = rows()[0]!.querySelector('.entry__leading')!;
    expect(leading.querySelector('.emoji-icon')).toHaveTextContent('📅');
    expect(leading.querySelector('svg')).toBeNull();
  });

  it('falls back to the Template icon, never the generic note icon, when it has no emoji', async () => {
    await act(async () => void (await setup().mount()));
    pick('Journal'); // no emoji
    const leading = rows()[0]!.querySelector('.entry__leading')!;
    expect(leading.querySelector('.emoji-icon')).toBeNull();
    expect(leading.querySelector('[data-icon="template"] svg')).not.toBeNull();
    expect(leading.querySelector('[data-icon="note"]')).toBeNull();
  });

  it('draws the same icon as the "Start with template" rows do for the same template', async () => {
    await act(async () => void (await setup().mount()));
    pick('Meeting');
    pick('Journal');
    const drawn = rows().map(
      (row) => row.querySelector('.entry__leading')!.innerHTML
    );
    cleanup();
    const expected = [MEETING, JOURNAL].map((t) => {
      const { container, unmount } = render(
        <AppIcon icon="template" emoji={t.emoji} />
      );
      const html = container.innerHTML;
      unmount();
      return html;
    });
    expect(drawn).toEqual(expected);
  });

  it("has an icon-only dismiss button (a preference is removed, not a template deleted) in each row's trailing slot", async () => {
    await act(async () => void (await setup().mount()));
    pick('Meeting');
    const button = removeButton('Meeting');
    expect(button).toHaveClass('button--icon');
    expect(button.closest('.entry__trailing')).not.toBeNull();
    expect(button.querySelector('[data-icon="dismiss"] svg')).not.toBeNull();
    expect(button.querySelector('[data-icon="trash"]')).toBeNull();
  });

  it('keeps the rows inside the Templates group, below the Preferred templates entry', async () => {
    await act(async () => void (await setup().mount()));
    pick('Meeting');
    pick('Weekly review');
    const group = screen.getByText('Preferred templates').closest('.settings-group')!;
    expect(
      group.querySelectorAll('.preferred-templates__list .entry')
    ).toHaveLength(2);
    const entry = group.querySelector('.settings-entry')!;
    const list = group.querySelector('.preferred-templates__list')!;
    expect(
      entry.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('has no leftover comparison presentation (no SettingsEntry rows per template, no label)', async () => {
    await act(async () => void (await setup().mount()));
    pick('Meeting');
    expect(screen.queryByText('Entry variant')).toBeNull();
    // Only the two settings entries (Default, Preferred templates), never one per template.
    expect(
      document.querySelectorAll('.settings-group .settings-entry')
    ).toHaveLength(2);
  });

  it('does not offer an already selected template in the picker, so it cannot be selected twice', async () => {
    const { mount } = setup();
    let store!: PreferredTemplatesStore;
    await act(async () => void ({ store } = await mount()));
    pick('Meeting');
    fireEvent.click(chooseButton());
    // "Meeting" is now only a row title, not a picker row; the others are still offered.
    expect(screen.getAllByText('Meeting')).toHaveLength(1);
    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.getByText('Weekly review')).toBeInTheDocument();
    expect(screen.getByText('New template')).toBeInTheDocument();
    expect(store.getIds()).toEqual(['meeting']);
    expect(titles()).toEqual(['Meeting']);
  });

  it('offers only the "New template" row once every template is selected', async () => {
    await act(async () => void (await setup({ templates: [MEETING] }).mount()));
    pick('Meeting');
    fireEvent.click(chooseButton());
    expect(screen.getByText('New template')).toBeInTheDocument();
    expect(screen.getAllByText('Meeting')).toHaveLength(1);
  });

  it("lists the rows in the order they were selected, not the picker's order", async () => {
    await act(async () => void (await setup().mount()));
    pick('Weekly review');
    pick('Meeting');
    pick('Journal');
    expect(titles()).toEqual(['Weekly review', 'Meeting', 'Journal']);
  });

  it('removes only that row immediately, leaving the others and their order', async () => {
    await act(async () => void (await setup().mount()));
    pick('Weekly review');
    pick('Meeting');
    pick('Journal');
    fireEvent.click(removeButton('Meeting'));
    expect(titles()).toEqual(['Weekly review', 'Journal']);
  });

  it('removing the last row removes the list', async () => {
    await act(async () => void (await setup().mount()));
    pick('Meeting');
    fireEvent.click(removeButton('Meeting'));
    expect(document.querySelector('.preferred-templates__list')).toBeNull();
  });

  it('removing a preference leaves the template itself alone, and it can be selected again', async () => {
    const { mount } = setup();
    let source!: TemplatesSource;
    await act(async () => void ({ source } = await mount()));
    pick('Meeting');
    fireEvent.click(removeButton('Meeting'));
    expect(titles()).toEqual([]);
    // The template still exists, and the picker offers it again now that it isn't preferred.
    expect(source.getTemplates().map((t) => t.id)).toContain('meeting');
    fireEvent.click(chooseButton());
    expect(screen.getByText('Meeting')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Meeting'));
    expect(titles()).toEqual(['Meeting']);
  });

  it('does not let the delete click reach a parent handler', async () => {
    const harness = setup();
    const parentClick = vi.fn();
    const store = await PreferredTemplatesStore.load(harness.fileSystem, ROOT);
    store.add('meeting');
    render(
      <div onClick={parentClick}>
        <PreferredTemplates templates={sourceFor(store, () => [MEETING])} />
      </div>
    );
    fireEvent.click(removeButton('Meeting'));
    expect(parentClick).not.toHaveBeenCalled();
    expect(store.getIds()).toEqual([]);
  });

  it('shows saved selections on the next start, in order', async () => {
    const harness = setup();
    let store!: PreferredTemplatesStore;
    await act(async () => void ({ store } = await harness.mount()));
    pick('Weekly review');
    pick('Meeting');
    fireEvent.click(removeButton('Weekly review'));
    pick('Journal');
    await act(flushWrites);
    expect(store.getIds()).toEqual(['meeting', 'journal']);

    cleanup();
    // "Restart": a brand-new store reads the same file.
    await act(async () => void (await harness.mount()));
    expect(titles()).toEqual(['Meeting', 'Journal']);
  });

  it('skips a saved template that no longer exists, without removing its preference', async () => {
    const harness = setup({ ids: ['gone', 'meeting'] });
    let store!: PreferredTemplatesStore;
    await act(async () => void ({ store } = await harness.mount()));
    expect(titles()).toEqual(['Meeting']);
    expect(store.getIds()).toEqual(['gone', 'meeting']);
  });

  it('shows a template again if it comes back after being unavailable', async () => {
    const harness = setup({ ids: ['journal'], templates: [MEETING] });
    await act(async () => void (await harness.mount()));
    expect(titles()).toEqual([]);
    cleanup();
    harness.setTemplates([MEETING, JOURNAL]);
    await act(async () => void (await harness.mount()));
    expect(titles()).toEqual(['Journal']);
  });
});

describe('PreferredTemplates — clicking a row opens the template', () => {
  const row = (index = 0) => rows()[index] as HTMLElement;

  async function mountWith(onCloseSettings?: () => void) {
    const harness = setup();
    const store = await PreferredTemplatesStore.load(harness.fileSystem, ROOT);
    const source = sourceFor(store, () => [MEETING, JOURNAL]);
    render(
      <PreferredTemplates
        templates={source}
        onCloseSettings={onCloseSettings}
      />
    );
    return { store, source };
  }

  it('has no Open button: the row is the button, with only the delete icon in its trailing slot', async () => {
    const { store } = await mountWith();
    act(() => store.add('meeting'));
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();
    expect(screen.queryByText('Open')).toBeNull();
    expect(row()).toHaveClass('entry-interactive');
    expect(row()).toHaveAttribute('role', 'button');
    expect(row().querySelectorAll('.entry__trailing button')).toHaveLength(1);
    expect(removeButton('Meeting').closest('.entry__trailing')).not.toBeNull();
  });

  it('closes Settings first, then opens that template in the current Space', async () => {
    const calls: string[] = [];
    const { store, source } = await mountWith(() => calls.push('close'));
    vi.mocked(source.onOpenTemplate).mockImplementation(
      (id) => void calls.push(`open:${id}`)
    );
    act(() => {
      store.add('journal');
      store.add('meeting');
    });
    fireEvent.click(row(1));
    expect(calls).toEqual(['close', 'open:meeting']);
  });

  it('opens from the keyboard too (Enter on the focused row)', async () => {
    const { store, source } = await mountWith();
    act(() => store.add('meeting'));
    fireEvent.keyDown(row(), { key: 'Enter' });
    expect(source.onOpenTemplate).toHaveBeenCalledWith('meeting');
  });

  it('does not remove the preference, or touch the template, when opening it', async () => {
    const { store, source } = await mountWith();
    act(() => store.add('meeting'));
    fireEvent.click(row());
    expect(store.getIds()).toEqual(['meeting']);
    expect(titles()).toEqual(['Meeting']);
    expect(source.getTemplates().map((t) => t.id)).toContain('meeting');
  });

  it('the delete icon removes the preference without opening the template or closing Settings', async () => {
    const onClose = vi.fn();
    const { store, source } = await mountWith(onClose);
    act(() => store.add('meeting'));
    fireEvent.click(removeButton('Meeting'));
    expect(store.getIds()).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
    expect(source.onOpenTemplate).not.toHaveBeenCalled();
  });

  it('a click on the row does not reach a parent handler beyond the row itself being handled', async () => {
    const harness = setup();
    const store = await PreferredTemplatesStore.load(harness.fileSystem, ROOT);
    store.add('meeting');
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <PreferredTemplates templates={sourceFor(store, () => [MEETING])} />
      </div>
    );
    fireEvent.click(removeButton('Meeting'));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('still opens with no close handler supplied', async () => {
    const harness = setup();
    const store = await PreferredTemplatesStore.load(harness.fileSystem, ROOT);
    store.add('meeting');
    const source = sourceFor(store, () => [MEETING]);
    render(<PreferredTemplates templates={source} />);
    fireEvent.click(row());
    expect(source.onOpenTemplate).toHaveBeenCalledWith('meeting');
  });
});

describe('PreferredTemplates — Notes and Daily notes pages', () => {
  const mountBoth = async () => {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({
        preferredTemplates: ['weekly'],
      }),
    });
    const store = await PreferredTemplatesStore.load(fileSystem, ROOT);
    const source = sourceFor(store, () => [MEETING, JOURNAL, WEEKLY]);
    return { fileSystem, store, source };
  };

  it('the Notes page starts empty for a user with only Daily notes preferences', async () => {
    const { source } = await mountBoth();
    render(<PreferredTemplates context="notes" templates={source} />);
    expect(titles()).toEqual([]);
  });

  it('the Daily notes page keeps its existing selection', async () => {
    const { source } = await mountBoth();
    render(<PreferredTemplates context="dailyNotes" templates={source} />);
    expect(titles()).toEqual(['Weekly review']);
  });

  it('choosing on the Notes page leaves the Daily notes selection alone, and the reverse', async () => {
    const { store, source } = await mountBoth();
    render(<PreferredTemplates context="notes" templates={source} />);
    pick('Meeting');
    expect(titles()).toEqual(['Meeting']);
    expect(store.getIds('notes')).toEqual(['meeting']);
    expect(store.getIds('dailyNotes')).toEqual(['weekly']);

    cleanup();
    render(<PreferredTemplates context="dailyNotes" templates={source} />);
    expect(titles()).toEqual(['Weekly review']);
    pick('Journal');
    expect(store.getIds('dailyNotes')).toEqual(['weekly', 'journal']);
    expect(store.getIds('notes')).toEqual(['meeting']);
  });

  it('offers a template on the Notes page even when it is preferred for Daily notes', async () => {
    const { source } = await mountBoth();
    render(<PreferredTemplates context="notes" templates={source} />);
    fireEvent.click(chooseButton());
    expect(screen.getByText('Weekly review')).toBeInTheDocument();
  });

  it('removing on the Notes page drops only its preference, never the template or the other list', async () => {
    const { store, source } = await mountBoth();
    store.add('weekly', 'notes');
    render(<PreferredTemplates context="notes" templates={source} />);
    fireEvent.click(removeButton('Weekly review'));
    expect(store.getIds('notes')).toEqual([]);
    expect(store.getIds('dailyNotes')).toEqual(['weekly']);
    expect(source.getTemplates()).toContain(WEEKLY);
  });

  it('persists the Notes selection across a reload', async () => {
    const { fileSystem, source } = await mountBoth();
    render(<PreferredTemplates context="notes" templates={source} />);
    pick('Meeting');
    await act(flushWrites);
    cleanup();

    const reloaded = await PreferredTemplatesStore.load(fileSystem, ROOT);
    render(
      <PreferredTemplates
        context="notes"
        templates={sourceFor(reloaded, () => [MEETING, JOURNAL, WEEKLY])}
      />
    );
    expect(titles()).toEqual(['Meeting']);
  });
});

describe('Settings — the Notes page', () => {
  it('opens its own Templates page from the sidebar, separate from Daily notes', async () => {
    const { source } = await (async () => {
      const store = await PreferredTemplatesStore.load(
        new InMemoryVaultFileSystem(),
        ROOT
      );
      return { source: sourceFor(store, () => [MEETING, JOURNAL, WEEKLY]) };
    })();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<Settings templates={source} />);

    fireEvent.click(screen.getByText('Notes'));
    expect(
      screen.getByRole('heading', { name: 'Notes' })
    ).toBeInTheDocument();
    pick('Meeting');
    expect(titles()).toEqual(['Meeting']);

    fireEvent.click(screen.getByText('Daily notes'));
    expect(screen.getByRole('heading', { name: 'Daily notes' })).toBeInTheDocument();
    expect(titles()).toEqual([]);

    fireEvent.click(screen.getByText('Notes'));
    expect(titles()).toEqual(['Meeting']);
  });
});

describe('PreferredTemplates — the default daily note template', () => {
  const selectButton = () => screen.getByRole('button', { name: 'Select template' });
  const defaultRow = () => document.querySelector('.preferred-templates__list--default');
  const defaultTitles = () =>
    Array.from(defaultRow()?.querySelectorAll('.entry__content') ?? []).map((el) => el.textContent);
  const preferredTitles = () =>
    Array.from(
      document.querySelectorAll('.preferred-templates__list:not(.preferred-templates__list--default) .entry__content')
    ).map((el) => el.textContent);

  async function mountDaily(options: { default?: string; ids?: string[]; templates?: CollectionEntryModel[] } = {}) {
    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({
        ...(options.ids && { preferredTemplates: options.ids }),
        ...(options.default && { defaultDailyNoteTemplate: options.default }),
      }),
    });
    const store = await PreferredTemplatesStore.load(fileSystem, ROOT);
    const source = sourceFor(store, () => options.templates ?? [MEETING, JOURNAL, WEEKLY]);
    const view = render(<PreferredTemplates context="dailyNotes" templates={source} />);
    return { fileSystem, store, source, view };
  }

  it("is None by default: a small \"Select template\" button under its own \"Today's template\" entry, above Preferred templates", async () => {
    await act(async () => void (await mountDaily()));
    const entries = Array.from(document.querySelectorAll('.settings-entry__title')).map((el) => el.textContent);
    expect(entries).toEqual(["Today's template", 'Preferred templates']);
    expect(
      screen.getByText("Choose which template to apply when creating today's daily note")
    ).toBeInTheDocument();
    expect(selectButton()).toHaveClass('button--small', 'button--outline');
    expect(selectButton().querySelector('.app-icon')).toBeNull();
    expect(defaultRow()).toBeNull();
  });

  it('is only on the Daily notes page', async () => {
    const store = await PreferredTemplatesStore.load(new InMemoryVaultFileSystem(), ROOT);
    render(<PreferredTemplates context="notes" templates={sourceFor(store, () => [MEETING])} />);
    expect(screen.queryByText("Today's template")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select template' })).toBeNull();
  });

  it('opens the existing picker with every template, preferred ones included', async () => {
    await act(async () => void (await mountDaily({ ids: ['weekly'] })));
    fireEvent.click(selectButton());
    expect(screen.getByText('Meeting')).toBeInTheDocument();
    expect(screen.getByText('Journal')).toBeInTheDocument();
    // Weekly review is preferred, so it is also a row on the page: the picker still offers it.
    expect(screen.getAllByText('Weekly review')).toHaveLength(2);
  });

  it('choosing a template saves it, hides the button and shows the template under the entry', async () => {
    const { store } = await (async () => {
      let mounted!: Awaited<ReturnType<typeof mountDaily>>;
      await act(async () => {
        mounted = await mountDaily();
      });
      return mounted;
    })();
    fireEvent.click(selectButton());
    fireEvent.click(screen.getByText('Meeting'));

    expect(store.getDefaultDailyNoteTemplateId()).toBe('meeting');
    expect(screen.queryByRole('button', { name: 'Select template' })).toBeNull();
    expect(defaultTitles()).toEqual(['Meeting']);
  });

  it("draws the default with the template's own emoji, or the Template icon, like the preferred rows", async () => {
    await act(async () => void (await mountDaily({ default: 'meeting' })));
    expect(defaultRow()?.querySelector('.entry__leading')?.textContent).toContain('📅');
    cleanup();
    await act(async () => void (await mountDaily({ default: 'journal' })));
    expect(defaultRow()?.querySelector('.entry__leading svg')).not.toBeNull();
  });

  it('is a single selection kept apart from the Preferred templates list', async () => {
    await act(async () => void (await mountDaily({ default: 'meeting', ids: ['weekly'] })));
    expect(defaultTitles()).toEqual(['Meeting']);
    expect(preferredTitles()).toEqual(['Weekly review']);
    const cell = (element: Element | null) => element?.closest('.settings-group__entries > div');
    const preferredList = document.querySelector('.preferred-templates__list:not(.preferred-templates__list--default)');
    expect(cell(defaultRow())).not.toBe(cell(preferredList));
  });

  it('is its own group, above the Preferred templates group, with the usual divider between the Default entry and its template', async () => {
    await act(async () => void (await mountDaily({ default: 'meeting', ids: ['weekly'] })));
    expect(document.querySelectorAll('.settings-group')).toHaveLength(2);
    expect(
      Array.from(document.querySelectorAll('.settings-group__title')).map((el) => el.textContent)
    ).toEqual(['Template']);

    const group = screen.getByText("Today's template").closest('.settings-group')!;
    expect(group.querySelector('.settings-entry')).not.toBeNull();
    expect(group.querySelector('.preferred-templates__list--default')).not.toBeNull();
    expect(group.querySelectorAll('.settings-group__divider')).toHaveLength(1);
    expect(group.querySelector('.preferred-templates__list:not(.preferred-templates__list--default)')).toBeNull();
  });

  it('removing it clears only the default, restores the button and leaves the template and the preferred list alone', async () => {
    let mounted!: Awaited<ReturnType<typeof mountDaily>>;
    await act(async () => {
      mounted = await mountDaily({ default: 'meeting', ids: ['weekly'] });
    });
    fireEvent.click(removeButton('Meeting'));

    expect(mounted.store.getDefaultDailyNoteTemplateId()).toBeUndefined();
    expect(mounted.store.getIds('dailyNotes')).toEqual(['weekly']);
    expect(mounted.source.getTemplates()).toContain(MEETING);
    expect(defaultRow()).toBeNull();
    expect(selectButton()).toBeInTheDocument();
  });

  it('removing a preferred template does not touch the default, and choosing the default does not add a preferred one', async () => {
    let mounted!: Awaited<ReturnType<typeof mountDaily>>;
    await act(async () => {
      mounted = await mountDaily({ default: 'weekly', ids: ['weekly'] });
    });
    expect(defaultTitles()).toEqual(['Weekly review']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Weekly review' })[1]!);
    expect(mounted.store.getIds('dailyNotes')).toEqual([]);
    expect(mounted.store.getDefaultDailyNoteTemplateId()).toBe('weekly');

    fireEvent.click(removeButtonIn(defaultRow()!, 'Weekly review'));
    fireEvent.click(selectButton());
    fireEvent.click(screen.getByText('Journal'));
    expect(mounted.store.getIds('dailyNotes')).toEqual([]);
  });

  it('shows the saved default after a restart', async () => {
    await act(async () => void (await mountDaily({ default: 'journal' })));
    expect(defaultTitles()).toEqual(['Journal']);
  });

  it('reads a default whose template is unavailable as None, without losing the saved choice', async () => {
    let mounted!: Awaited<ReturnType<typeof mountDaily>>;
    await act(async () => {
      mounted = await mountDaily({ default: 'gone' });
    });
    expect(defaultRow()).toBeNull();
    expect(selectButton()).toBeInTheDocument();
    expect(mounted.store.getDefaultDailyNoteTemplateId()).toBe('gone');
  });

  it('clicking the default row opens the template, closing Settings first; removing does not', async () => {
    const onCloseSettings = vi.fn();
    const store = await PreferredTemplatesStore.load(
      new InMemoryVaultFileSystem({ [`${ROOT}/.clutter/workspace.json`]: JSON.stringify({ defaultDailyNoteTemplate: 'meeting' }) }),
      ROOT
    );
    const source = sourceFor(store, () => [MEETING, JOURNAL]);
    render(<PreferredTemplates context="dailyNotes" templates={source} onCloseSettings={onCloseSettings} />);

    fireEvent.click(screen.getByText('Meeting'));
    expect(onCloseSettings).toHaveBeenCalledTimes(1);
    expect(source.onOpenTemplate).toHaveBeenCalledWith('meeting');

    fireEvent.click(removeButton('Meeting'));
    expect(source.onOpenTemplate).toHaveBeenCalledTimes(1);
  });
});

const removeButtonIn = (container: Element, name: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === `Remove ${name}`)!;

describe('PreferredTemplates — group titles', () => {
  it('the Notes page keeps one group, titled "Template"', async () => {
    const store = await PreferredTemplatesStore.load(new InMemoryVaultFileSystem(), ROOT);
    render(<PreferredTemplates context="notes" templates={sourceFor(store, () => [MEETING])} />);
    expect(
      Array.from(document.querySelectorAll('.settings-group__title')).map((el) => el.textContent)
    ).toEqual(['Template']);
  });
});
