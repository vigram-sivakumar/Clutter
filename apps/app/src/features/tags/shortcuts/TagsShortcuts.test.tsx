// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TagsShortcuts } from './TagsShortcuts';
import { NewTagDialog } from './NewTagDialog';
import { TagOperations } from '@core/application/tags/TagOperations';
import type { PageOperations } from '@core/application/page/PageOperations';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { TagMetadataStore } from '@core/vault/persistence/TagMetadataStore';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import type { Page } from '@core/vault/models/Page';
import type { TagMetadataEntry } from '@core/vault/models/Tag';

// Overlay positioning observes elements via ResizeObserver, which jsdom lacks.
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

function makeNote(id: string, markdown: string): Page {
  return {
    id,
    type: 'note',
    name: id,
    path: `${ROOT}/${id}.md`,
    parentId: null,
    metadata: {
      icon: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side',
      coverPositionAbove: 50,
      coverPositionSide: 50,
      description: '',
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: [...markdown.matchAll(/#([a-z-]+)/g)].map((match) => ({
        name: match[1]!,
        sourcePageId: id,
      })),
      links: [],
      embeds: [],
    },
  };
}

/** The real domain stack behind the dialog: Vault + TagMetadataStore + TagOperations. */
function setup(seed: Record<string, TagMetadataEntry> = {}) {
  const note = makeNote('n1', 'Existing #design note');
  const metadata = new Map(Object.entries(seed));
  const fileSystem = new InMemoryVaultFileSystem({
    [note.path]: 'Existing #design note',
    ...(metadata.size > 0 && {
      [`${ROOT}/.clutter/tags.json`]: JSON.stringify({ version: 2, tags: seed }),
    }),
  });
  const vault = new Vault(
    ROOT,
    [note],
    [],
    new TagBuilder().build([note], metadata),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    metadata
  );
  const tagOperations = new TagOperations(
    vault,
    new TagMetadataStore(fileSystem, ROOT),
    fileSystem,
    { getSession: () => undefined } as unknown as PageOperations
  );
  const declare = vi.spyOn(tagOperations, 'declare');
  const onShortcut = vi.fn();

  render(
    <SidebarHost
      onShortcut={onShortcut}
      validateTagName={(input) => tagOperations.checkNewTagName(input)}
      onCreateTag={(name, icon) => tagOperations.declare(name, { icon })}
      unusedTagCount={tagOperations.countUnusedTags()}
      onTidyUp={async () => {
        await tagOperations.deleteUnusedTags();
      }}
      onRestyle={async (style) => {
        await tagOperations.restyle(style);
      }}
    />
  );

  const open = () => fireEvent.click(screen.getByText('New'));
  const nameField = () => screen.getByRole('textbox');
  const type = (value: string) => fireEvent.change(nameField(), { target: { value } });
  const createButton = () => screen.getByRole('button', { name: 'Create' });
  const definitions = async () => {
    const path = `${ROOT}/.clutter/tags.json`;
    return (await fileSystem.exists(path)) ? JSON.parse(await fileSystem.readFile(path)).tags : {};
  };

  return { vault, fileSystem, note, declare, onShortcut, open, nameField, type, createButton, definitions };
}

// Stands in for Sidebar, which now hosts the New tag dialog (so the top controls' New tag can open
// it too): the row only requests it, the host renders it.
function SidebarHost({
  validateTagName,
  onCreateTag,
  ...rest
}: Omit<ComponentProps<typeof TagsShortcuts>, 'onRequestNewTag'> & {
  validateTagName: ComponentProps<typeof NewTagDialog>['validateName'];
  onCreateTag: ComponentProps<typeof NewTagDialog>['onSubmit'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TagsShortcuts {...rest} onRequestNewTag={() => setOpen(true)} />
      <NewTagDialog
        open={open}
        onClose={() => setOpen(false)}
        validateName={validateTagName}
        onSubmit={onCreateTag}
      />
    </>
  );
}

describe('Tags sidebar — New tag', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('"New" is enabled and opens the New tag dialog without invoking onShortcut', () => {
    const t = setup();

    expect(screen.getByText('New').closest('[aria-disabled="true"]')).toBeNull();
    t.open();

    expect(screen.getByText('New tag')).toBeInTheDocument();
    // The name field has no visible label — just a placeholder (and an accessible name).
    expect(screen.queryByText('Tag name')).toBeNull();
    expect(screen.getByPlaceholderText('Tag name')).toBe(screen.getByRole('textbox', { name: 'Tag name' }));
    // The emoji button has no visible label and sits at the footer's left, before Create.
    expect(screen.queryByText('Emoji')).toBeNull();
    const footer = t.createButton().closest('.new-tag__footer')!;
    expect(footer.firstElementChild).toBe(screen.getByRole('button', { name: 'Choose emoji' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(t.createButton()).toBeInTheDocument();
    expect(t.onShortcut).not.toHaveBeenCalled();
  });

  it('an empty name cannot be submitted', async () => {
    const t = setup();
    t.open();

    expect(t.createButton()).toBeDisabled();
    fireEvent.submit(t.nameField().closest('form')!);

    expect(t.declare).not.toHaveBeenCalled();
    expect(await t.definitions()).toEqual({});
  });

  it('a whitespace-only name cannot be submitted and shows no error', async () => {
    const t = setup();
    t.open();
    t.type('    ');

    expect(t.createButton()).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.submit(t.nameField().closest('form')!);

    expect(t.declare).not.toHaveBeenCalled();
  });

  it('a name the tag grammar rejects shows an inline message and cannot be created', async () => {
    const t = setup();
    t.open();

    t.type('1984');
    expect(screen.getByRole('alert')).toHaveTextContent(/letters, numbers, hyphens/i);
    expect(t.createButton()).toBeDisabled();

    t.type('a/b');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(t.createButton()).toBeDisabled();
    expect(await t.definitions()).toEqual({});
  });

  it('an uppercase name is stored lower-case', async () => {
    const t = setup();
    t.open();
    t.type('  Research  ');
    fireEvent.click(t.createButton());

    await waitFor(() => expect(t.declare).toHaveBeenCalledWith('research', { icon: undefined }));
    expect(await t.definitions()).toEqual({ research: { name: 'research' } });
  });

  it('underscores become hyphens', async () => {
    const t = setup();
    t.open();
    t.type('Design_System');

    expect(screen.queryByText(/will be created as/i)).toBeNull();
    fireEvent.click(t.createButton());

    await waitFor(() => expect(t.declare).toHaveBeenCalledWith('design-system', { icon: undefined }));
    expect(await t.definitions()).toEqual({ 'design system': { name: 'design-system' } });
  });

  it('a normalized duplicate of an existing tag is refused inline, whatever its spelling', async () => {
    const t = setup();
    t.open();

    for (const attempt of ['design', 'Design', 'DESIGN', ' design_ ']) {
      t.type(attempt);
      expect(screen.getByRole('alert')).toHaveTextContent('A tag named “design” already exists.');
      expect(t.createButton()).toBeDisabled();
    }

    fireEvent.submit(t.nameField().closest('form')!);
    expect(t.declare).not.toHaveBeenCalled();
    expect(await t.definitions()).toEqual({});
  });

  it('a duplicate of another declared (unused) tag is refused too', async () => {
    const t = setup();
    t.open();
    t.type('research');
    fireEvent.click(t.createButton());
    await waitFor(() => expect(screen.queryByText('New tag')).toBeNull());

    t.open();
    t.type('Research');

    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(t.createButton()).toBeDisabled();
  });

  it('the emoji is optional: a tag created without one has none', async () => {
    const t = setup();
    t.open();
    t.type('plain');
    fireEvent.click(t.createButton());

    await waitFor(() => expect(screen.queryByText('New tag')).toBeNull());
    expect((await t.definitions()).plain).toEqual({ name: 'plain' });
    expect([...t.vault.tags()].find((tag) => tag.name === 'plain')?.icon).toBeUndefined();
  });

  it('the chosen emoji (from the existing emoji picker) is stored as tag metadata', async () => {
    const t = setup();
    t.open();
    t.type('ideas');
    fireEvent.click(screen.getByRole('button', { name: 'Choose emoji' }));
    fireEvent.click(await screen.findByText('😀'));

    // The button now shows the choice.
    expect(screen.getByRole('button', { name: /Emoji 😀/ })).toBeInTheDocument();
    fireEvent.click(t.createButton());

    await waitFor(() => expect(screen.queryByText('New tag')).toBeNull());
    expect((await t.definitions()).ideas).toEqual({ name: 'ideas', icon: '😀' });
    expect([...t.vault.tags()].find((tag) => tag.name === 'ideas')?.icon).toBe('😀');
  });

  it('creating closes the dialog, and the tag exists at once with zero usage', async () => {
    const t = setup();
    t.open();
    t.type('research');
    fireEvent.click(t.createButton());

    await waitFor(() => expect(screen.queryByText('New tag')).toBeNull());
    const created = [...t.vault.tags()].find((tag) => tag.name === 'research');
    expect(created).toEqual({
      name: 'research',
      icon: undefined,
      favorite: false,
      declared: true,
      usageCount: 0,
    });
    // The pre-existing, used tag is untouched.
    expect([...t.vault.tags()].map((tag) => [tag.name, tag.usageCount])).toEqual([
      ['design', 1],
      ['research', 0],
    ]);
  });

  it('creating a tag does not touch any note', async () => {
    const t = setup();
    const before = await t.fileSystem.readFile(t.note.path);
    const fileWrites: string[] = [];
    const write = t.fileSystem.writeFile.bind(t.fileSystem);
    t.fileSystem.writeFile = async (path, contents) => {
      fileWrites.push(path);
      return write(path, contents);
    };

    t.open();
    t.type('research');
    fireEvent.click(t.createButton());
    await waitFor(() => expect(screen.queryByText('New tag')).toBeNull());

    expect(await t.fileSystem.readFile(t.note.path)).toBe(before);
    expect(t.vault.getPage('n1')!.source.markdown).toBe('Existing #design note');
    expect(t.vault.getPage('n1')!.analysis.tags.map((tag) => tag.name)).toEqual(['design']);
    // Only the tag definition file (via its atomic temp file) was written.
    expect(fileWrites.every((path) => path.includes('/.clutter/tags.json'))).toBe(true);
  });

  it('Close (the dismiss icon) closes the dialog and changes nothing', async () => {
    const t = setup();
    t.open();
    t.type('research');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByText('New tag')).toBeNull();
    expect(t.declare).not.toHaveBeenCalled();
    expect(await t.definitions()).toEqual({});
    expect([...t.vault.tags()].map((tag) => tag.name)).toEqual(['design']);
  });

  it('reopening after closing starts from a blank form', () => {
    const t = setup();
    t.open();
    t.type('research');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    t.open();

    expect(t.nameField()).toHaveValue('');
  });

  it('a failed creation is reported inline and the dialog stays open', async () => {
    const t = setup();
    t.declare.mockRejectedValueOnce(new Error('disk full'));
    t.open();
    t.type('research');
    fireEvent.click(t.createButton());

    expect(await screen.findByText('disk full')).toBeInTheDocument();
    expect(screen.getByText('New tag')).toBeInTheDocument();
    expect(t.createButton()).toBeEnabled();
  });
});

describe('Tags sidebar — Tidy up', () => {
  const UNUSED = { research: { name: 'research' }, ideas: { name: 'ideas', icon: '💡' } };
  const confirmation = () => document.querySelector('.confirmation') as HTMLElement | null;
  const tidyRow = () => screen.getByText('Tidy up').closest('.entry') as HTMLElement;

  it('sits directly after New in the shortcuts', () => {
    setup(UNUSED);

    const rows = screen.getAllByText(/^(New|Tidy up)$/).map((element) => element.textContent);
    expect(rows).toEqual(['New', 'Tidy up']);
  });

  it('opens a menu; Remove unused is disabled while no tag is unused and opens nothing', () => {
    setup({ design: { name: 'design', icon: '🎨' } });

    expect(tidyRow().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(screen.getByText('Tidy up'));
    const remove = screen.getByText('Remove unused').closest('.entry') as HTMLElement;
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByText('Remove unused'));

    expect(confirmation()).toBeNull();
  });

  it('Remove unused opens the confirmation with the unused count', () => {
    setup(UNUSED);

    fireEvent.click(screen.getByText('Tidy up'));
    fireEvent.click(screen.getByText('Remove unused'));

    expect(confirmation()).not.toBeNull();
    expect(screen.getByText('Tidy up unused tags')).toBeInTheDocument();
    expect(screen.getByText('This will permanently remove 2 unused tags.')).toBeInTheDocument();
    expect(within(confirmation()!).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(confirmation()!).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('says "1 unused tag" for a single one', () => {
    setup({ research: { name: 'research' } });
    fireEvent.click(screen.getByText('Tidy up'));
    fireEvent.click(screen.getByText('Remove unused'));

    expect(screen.getByText('This will permanently remove 1 unused tag.')).toBeInTheDocument();
  });

  it('Cancel changes nothing', async () => {
    const t = setup(UNUSED);
    fireEvent.click(screen.getByText('Tidy up'));
    fireEvent.click(screen.getByText('Remove unused'));
    fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Cancel' }));

    expect(confirmation()).toBeNull();
    expect([...t.vault.tags()].map((tag) => tag.name)).toEqual(['design', 'ideas', 'research']);
    expect(await t.definitions()).toEqual(UNUSED);
  });

  it('confirming removes only the unused definitions and keeps every used tag; no note is touched', async () => {
    const t = setup({ ...UNUSED, design: { name: 'design', icon: '🎨', favorite: true } });
    const before = await t.fileSystem.readFile(t.note.path);
    const noteWrites: string[] = [];
    const write = t.fileSystem.writeFile.bind(t.fileSystem);
    t.fileSystem.writeFile = async (path, contents) => {
      if (!path.includes('/.clutter/')) noteWrites.push(path);
      return write(path, contents);
    };

    fireEvent.click(screen.getByText('Tidy up'));
    fireEvent.click(screen.getByText('Remove unused'));
    fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(confirmation()).toBeNull());
    await waitFor(() => expect([...t.vault.tags()].map((tag) => tag.name)).toEqual(['design']));

    // The used tag keeps its definition (icon, pin) — only 0-usage ones are gone.
    expect(await t.definitions()).toEqual({ design: { name: 'design', icon: '🎨', favorite: true } });
    expect([...t.vault.tags()][0]).toMatchObject({ name: 'design', icon: '🎨', favorite: true, usageCount: 1 });
    expect(await t.fileSystem.readFile(t.note.path)).toBe(before);
    expect(noteWrites).toEqual([]);
  });
});

describe('Tags sidebar — Tidy up → Style (restyle existing tags)', () => {
  const confirmation = () => document.querySelector('.confirmation') as HTMLElement | null;

  function renderTidyUp() {
    const onRestyle = vi.fn(async () => {});
    const onShortcut = vi.fn();

    render(
      <TagsShortcuts
        onShortcut={onShortcut}
        onRequestNewTag={() => {}}
        unusedTagCount={0}
        onTidyUp={async () => {}}
        onRestyle={onRestyle as never}
      />
    );

    return { onRestyle, onShortcut };
  }

  const open = () => fireEvent.click(screen.getByText('Tidy up'));

  it('keeps the Tidy up row in the hover state (not selected) while its menu is open', () => {
    renderTidyUp();
    const row = screen.getByText('Tidy up').closest('.entry') as HTMLElement;
    expect(row.classList.contains('entry-force-hover')).toBe(false);

    open();
    expect(row.classList.contains('entry-force-hover')).toBe(true);

    open();
    expect(row.classList.contains('entry-force-hover')).toBe(false);
  });

  it('has no separate Configure row', () => {
    renderTidyUp();

    expect(screen.queryByText('Configure')).toBeNull();
    expect(screen.getAllByText(/^(New|Tidy up)$/).map((element) => element.textContent)).toEqual(['New', 'Tidy up']);
  });

  it('opens a menu of Remove unused, then a Style group of exactly the three styles', () => {
    renderTidyUp();
    open();

    expect(screen.getByText('Style')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Remove unused',
      'lowercase',
      'Sentence case',
      'Title Case',
    ]);
  });

  it('every style is always selectable — nothing is pre-scanned to disable one', () => {
    renderTidyUp();
    open();

    for (const label of ['lowercase', 'Sentence case', 'Title Case']) {
      const row = screen.getByText(label).closest('.entry') as HTMLElement;
      expect(row.getAttribute('aria-disabled')).not.toBe('true');
    }
    expect(screen.queryByText('Up to date')).toBeNull();
  });

  it('choosing a style asks for confirmation with the minimal copy, and does not restyle yet', () => {
    const t = renderTidyUp();
    open();
    fireEvent.click(screen.getByText('Sentence case'));

    expect(screen.getByText('Restyle tags to Sentence case?')).toBeInTheDocument();
    expect(screen.getByText('This will update all existing tags to this style.')).toBeInTheDocument();
    expect(within(confirmation()!).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(confirmation()!).getByRole('button', { name: 'Restyle' })).toBeInTheDocument();
    expect(screen.queryByText(/notes?\b.*tags?|tags? in/)).toBeNull();
    expect(t.onRestyle).not.toHaveBeenCalled();
  });

  it('confirming restyles in the chosen style; Cancel does nothing', async () => {
    const t = renderTidyUp();

    open();
    fireEvent.click(screen.getByText('Sentence case'));
    fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Cancel' }));
    expect(t.onRestyle).not.toHaveBeenCalled();

    open();
    fireEvent.click(screen.getByText('Title Case'));
    fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Restyle' }));

    await waitFor(() => expect(t.onRestyle).toHaveBeenCalledTimes(1));
    expect(t.onRestyle).toHaveBeenCalledWith('title');
    expect(confirmation()).toBeNull();
  });

  it('is never dispatched through onShortcut / NavigationRouter', () => {
    const t = renderTidyUp();
    open();
    fireEvent.click(screen.getByText('Title Case'));

    expect(t.onShortcut).not.toHaveBeenCalled();
  });
});
