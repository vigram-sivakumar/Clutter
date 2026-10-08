import { describe, expect, it, vi } from 'vitest';
import { toCollectionPageModel } from './toCollectionPageModel';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { getVaultDisplayName } from '@core/presentation/getVaultDisplayName';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { MoveService } from '@core/vault/persistence/MoveService';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { Workspace } from '@core/workspace/Workspace';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const defaultPageMetadata: Page['metadata'] = {
  icon: null,
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
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

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Root',
    path: ROOT,
    parentId: null,
    metadata: defaultFolderMetadata,
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    type: 'note',
    name: 'Untitled',
    path: `${ROOT}/Untitled.md`,
    parentId: 'folder-1',
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

function makeFolderOperations(
  vault: Vault,
  workspace: Workspace,
  coordinator: PagePersistenceCoordinator
): FolderOperations {
  return new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator(),
    () => {}
  );
}

function setup(folders: Folder[], pages: Page[]) {
  // Mirrors VaultBuilder: tags are derived from pages, not hand-supplied,
  // so a fixture page with #tag occurrences in its analysis is reflected
  // in vault.tags()/getTagByName() exactly like a real scan would.
  const tags = new TagBuilder().build(pages);
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    tags,
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const query = new VaultQuery(vault);
  const workspace = new Workspace();
  const fileSystem = new InMemoryVaultFileSystem();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    makeFolderOperations(vault, workspace, coordinator),
    new DailyNoteService(),
    () => {}
  );
  const effectivePageState = new EffectivePageState(
    vault,
    query,
    pageOperations,
    workspace
  );
  const membershipSelector = new MembershipSelector(
    vault,
    query,
    effectivePageState
  );

  return {
    vault,
    query,
    workspace,
    pageOperations,
    effectivePageState,
    membershipSelector,
  };
}

describe('toCollectionPageModel — browse surface (Category A)', () => {
  it('uses the folder name verbatim for a subfolder entry', () => {
    const active = makeFolder({ id: 'folder-1', name: 'Root' });
    const child = makeFolder({
      id: 'folder-2',
      name: 'Subfolder',
      parentId: 'folder-1',
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([active, child], []);

    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }
    );

    expect(model.folders).toEqual([
      expect.objectContaining({ id: 'folder-2', values: expect.objectContaining({ name: 'Subfolder' }) }),
    ]);
  });

  it('uses the real filename for a deliberately-named note', () => {
    const active = makeFolder({ id: 'folder-1' });
    const page = makePage({ name: 'Meeting Notes' });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([active], [page]);

    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }
    );

    expect(model.notes).toEqual([
      expect.objectContaining({ id: 'page-1', values: expect.objectContaining({ name: 'Meeting Notes' }) }),
    ]);
  });

  it('carries the note body and the cover focal point as payload, and none on a folder entry', () => {
    const active = makeFolder({ id: 'folder-1' });
    const sub = makeFolder({ id: 'folder-2', name: 'Sub', path: `${ROOT}/Sub`, parentId: 'folder-1' });
    const page = makePage({
      name: 'Covered',
      source: { markdown: '# Body only\n\ntext' },
      metadata: {
        ...defaultPageMetadata,
        cover: 'Assets/hero.png',
        coverLayout: 'side',
        coverPositionAbove: 20,
        coverPositionSide: 80,
      },
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([active, sub], [page]);

    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.notes[0]).toMatchObject({
      markdown: '# Body only\n\ntext',
      // The *above* focal position, even though this note's own layout is 'side'.
      coverPositionAbove: 20,
    });
    // The cover itself is a property VALUE: raw, shown.
    expect(model.notes[0]!.values.cover).toBe('Assets/hero.png');
    expect(model.folders[0]).toMatchObject({
      markdown: undefined,
      coverPositionAbove: undefined,
    });
    expect(model.folders[0]!.values.cover).toBeUndefined();
  });

  it('does not show the raw auto-generated filename for an unnamed note — falls to the placeholder, not body content', () => {
    const active = makeFolder({ id: 'folder-1' });
    const page = makePage({
      name: 'Untitled 2',
      source: { markdown: 'Real content here' },
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([active], [page]);

    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }
    );

    expect(model.notes).toEqual([
      expect.objectContaining({ id: 'page-1', values: expect.objectContaining({ name: 'New Note' }) }),
    ]);
  });
});

describe('toCollectionPageModel — draft-only pages appear immediately (ARCHITECTURE_RULES.md rule 13)', () => {
  it('a freshly opened draft targeting the active folder appears in notes before any save', async () => {
    const active = makeFolder({ id: 'folder-1' });
    const {
      vault,
      query,
      pageOperations,
      effectivePageState,
      membershipSelector,
      workspace,
    } = setup([active], []);

    const draftId = await pageOperations.openDraft({
      folderId: 'folder-1',
      title: 'My Draft',
    });

    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }
    );

    expect(model.notes).toEqual([
      expect.objectContaining({ id: draftId, values: expect.objectContaining({ name: 'My Draft' }), type: 'note' }),
    ]);
  });

  it('clicking a draft entry invokes onOpenDraftNote, not onOpenNote', async () => {
    const active = makeFolder({ id: 'folder-1' });
    const {
      vault,
      query,
      pageOperations,
      effectivePageState,
      membershipSelector,
      workspace,
    } = setup([active], []);

    await pageOperations.openDraft({ folderId: 'folder-1', title: 'My Draft' });

    const onOpenNote = vi.fn();
    const onOpenDraftNote = vi.fn();
    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote,
        onOpenDraftNote,
      }
    );

    const note = model.notes[0];

    if (!note) {
      throw new Error('expected exactly one note in the model');
    }

    note.onClick();

    expect(onOpenDraftNote).toHaveBeenCalledWith(note.id);
    expect(onOpenNote).not.toHaveBeenCalled();
  });
});

describe('toCollectionPageModel — a reserved folder viewed directly uses its canonical system-location label', () => {
  it("shows the canonical 'Archive' label, not the raw folder name, when Archive is the active folder", () => {
    const archive = makeFolder({
      id: 'archive-folder',
      name: 'Archive',
      path: `${ROOT}/Archive`,
      parentId: null,
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([archive], []);

    const model = toCollectionPageModel(
      archive,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }
    );

    expect(model.title).toBe(getSystemLocationPresentation('archive').label);
  });

  it("leaves an ordinary folder's title as its raw name, unaffected", () => {
    const active = makeFolder({ id: 'folder-1', name: 'Projects' });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([active], []);

    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }
    );

    expect(model.title).toBe('Projects');
  });

  it("blanks an untitled folder's header title instead of showing the generated name, mirroring toResourcePageModel's Note handling", () => {
    const active = makeFolder({ id: 'folder-1', name: 'Untitled 2' });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([active], []);

    const model = toCollectionPageModel(
      active,
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      {
        onOpenFolder: vi.fn(),
        onOpenNote: vi.fn(),
        onOpenDraftNote: vi.fn(),
      }
    );

    expect(model.title).toBe('');
  });
});

describe('toCollectionPageModel — filtered views (ADR-022), reusing the same membership the sidebar uses', () => {
  it("'workspace' shows exactly the root folders and root notes, titled from the vault's own folder name (ADR-022 Amendment 2)", () => {
    const root = makeFolder({ id: 'folder-1', name: 'Root', parentId: null });
    const nested = makeFolder({
      id: 'folder-2',
      name: 'Nested',
      parentId: 'folder-1',
    });
    const rootPage = makePage({
      id: 'page-1',
      name: 'Root Note',
      parentId: null,
    });
    const nestedPage = makePage({
      id: 'page-2',
      name: 'Nested Note',
      parentId: 'folder-1',
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([root, nested], [rootPage, nestedPage]);

    const model = toCollectionPageModel(
      { view: { kind: 'workspace' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe(getVaultDisplayName(ROOT));
    expect(model.folders).toEqual([
      expect.objectContaining({ id: 'folder-1' }),
    ]);
    expect(model.notes).toEqual([expect.objectContaining({ id: 'page-1' })]);
  });

  it("'workspace' excludes a root-level Daily Note draft (ADR-023, Phase 6 parity fix) — the Workspace page must match FolderTree's root exactly", async () => {
    const {
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      pageOperations,
    } = setup([], []);

    // Mirrors a fresh-vault boot: no Daily Notes month folder exists yet,
    // so the draft's folderId is null — previously indistinguishable, in
    // this collection page, from a root-level Note.
    await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-20.md`,
      {
        type: 'daily-note',
      }
    );

    const model = toCollectionPageModel(
      { view: { kind: 'workspace' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.notes).toEqual([]);
  });

  it("'favorites' shows exactly the favorited folders and pages, regardless of where they live in the tree", () => {
    const favoritedFolder = makeFolder({
      id: 'folder-1',
      name: 'Favorited',
      parentId: null,
      metadata: { ...defaultFolderMetadata, favorite: true },
    });
    const plainFolder = makeFolder({
      id: 'folder-2',
      name: 'Plain',
      parentId: null,
    });
    const favoritedPage = makePage({
      id: 'page-1',
      name: 'Favorited Note',
      parentId: 'folder-2',
      metadata: { ...defaultPageMetadata, favorite: true },
    });
    const plainPage = makePage({
      id: 'page-2',
      name: 'Plain Note',
      parentId: 'folder-2',
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([favoritedFolder, plainFolder], [favoritedPage, plainPage]);

    const model = toCollectionPageModel(
      { view: { kind: 'favorites' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe(getSystemLocationPresentation('favorites').label);
    expect(model.folders).toEqual([
      expect.objectContaining({ id: 'folder-1' }),
    ]);
    expect(model.notes).toEqual([expect.objectContaining({ id: 'page-1' })]);
  });

  it("clicking a 'workspace' folder entry invokes onOpenFolder, same as an ordinary folder view", () => {
    const root = makeFolder({ id: 'folder-1', name: 'Root', parentId: null });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([root], []);
    const onOpenFolder = vi.fn();

    const model = toCollectionPageModel(
      { view: { kind: 'workspace' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder, onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    model.folders[0]?.onClick();

    expect(onOpenFolder).toHaveBeenCalledWith('folder-1');
  });
});

describe("toCollectionPageModel — a 'tag' filtered view, reusing toFilteredCollectionPageModel rather than a parallel mapper", () => {
  it('shows exactly the pages referencing the tag, with no folders — title/icon come from the Tag entity, not the folder/note lookup', () => {
    const tagged = makePage({
      id: 'page-1',
      name: 'Tagged',
      parentId: null,
      analysis: {
        ...defaultAnalysis,
        tags: [{ name: 'Project', sourcePageId: 'page-1' }],
      },
    });
    const untagged = makePage({
      id: 'page-2',
      name: 'Untagged',
      parentId: null,
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([], [tagged, untagged]);

    const model = toCollectionPageModel(
      { view: { kind: 'tag', tagName: 'Project' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe('Project');
    expect(model.folders).toEqual([]);
    expect(model.notes).toEqual([expect.objectContaining({ id: 'page-1' })]);
  });

  it('lists every note that counts toward the tag — an inline #tag, a frontmatter-only tag, or both — exactly Tag.usageCount', () => {
    const inline = makePage({
      id: 'inline',
      name: 'Inline',
      parentId: null,
      analysis: { ...defaultAnalysis, tags: [{ name: 'project', sourcePageId: 'inline' }] },
    });
    const frontmatterOnly = makePage({
      id: 'frontmatter',
      name: 'Frontmatter',
      parentId: null,
      metadata: { ...defaultPageMetadata, tags: ['Project'] },
    });
    const both = makePage({
      id: 'both',
      name: 'Both',
      parentId: null,
      metadata: { ...defaultPageMetadata, tags: ['project'] },
      analysis: { ...defaultAnalysis, tags: [{ name: 'project', sourcePageId: 'both' }] },
    });
    const untagged = makePage({ id: 'untagged', name: 'Untagged', parentId: null });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup(
      [],
      [inline, frontmatterOnly, both, untagged]
    );

    const model = toCollectionPageModel(
      { view: { kind: 'tag', tagName: 'project' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    const ids = model.notes.map((note) => note.id).sort();
    expect(ids).toEqual(['both', 'frontmatter', 'inline']);
    // The collection and the tag's own count are the same set.
    expect(model.notes).toHaveLength(vault.getTagByName('project')!.usageCount);
  });

  it('falls back to the raw tag name as title when the tag has no matching Tag entity (e.g. it was just removed from Markdown)', () => {
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([], []);

    const model = toCollectionPageModel(
      { view: { kind: 'tag', tagName: 'ghost' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote: vi.fn(), onOpenDraftNote: vi.fn() }
    );

    expect(model.title).toBe('ghost');
    expect(model.notes).toEqual([]);
  });

  it('clicking a note entry invokes onOpenNote with the clicked tag name, so the caller can resolve/reveal its occurrences', () => {
    const tagged = makePage({
      id: 'page-1',
      name: 'Tagged',
      parentId: null,
      analysis: {
        ...defaultAnalysis,
        tags: [{ name: 'project', sourcePageId: 'page-1' }],
      },
    });
    const { vault, query, effectivePageState, membershipSelector, workspace } =
      setup([], [tagged]);
    const onOpenNote = vi.fn();

    const model = toCollectionPageModel(
      { view: { kind: 'tag', tagName: 'project' } },
      vault,
      query,
      effectivePageState,
      membershipSelector,
      workspace,
      { onOpenFolder: vi.fn(), onOpenNote, onOpenDraftNote: vi.fn() }
    );

    model.notes[0]?.onClick();

    // Unlike every other collection source (folder, Workspace, Favorites —
    // see those branches' own click tests), a Tag collection entry's
    // onClick passes the clicked tag's name as onOpenNote's second
    // argument, so the caller (PageHost.tsx's openNoteFromCollection) can
    // resolve every occurrence of that tag in the opened note and request
    // a reveal — see CollectionPageActions.onOpenNote's own doc comment.
    expect(onOpenNote).toHaveBeenCalledWith('page-1', 'project');
  });
});

describe('toCollectionPageModel — the entry\'s collection property values (the domain adapter)', () => {
  const build = (page: Page) => {
    const active = makeFolder({ id: 'folder-1' });
    const sub = makeFolder({ id: 'folder-2', name: 'Sub', path: `${ROOT}/Sub`, parentId: 'folder-1' });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup([active, sub], [page]);

    return toCollectionPageModel(active, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });
  };

  it('a note carries its description, cover and Created / Last edited / Archived as RAW values (ISO instants, never display text)', () => {
    const model = build(
      makePage({
        name: 'Plan',
        metadata: {
          ...defaultPageMetadata,
          description: 'About the plan',
          cover: 'Assets/hero.png',
          createdAt: '2026-01-01T10:00:00.000Z',
          updatedAt: '2026-02-02T11:00:00.000Z',
          archivedAt: '2026-03-03T12:00:00.000Z',
        },
      })
    );

    expect(model.notes[0]!.values).toEqual({
      name: 'Plan',
      type: 'Note',
      description: 'About the plan',
      cover: 'Assets/hero.png',
      created: '2026-01-01T10:00:00.000Z',
      updated: '2026-02-02T11:00:00.000Z',
      archived: '2026-03-03T12:00:00.000Z',
    });
  });

  it('a value the note does not have is absent, not blank', () => {
    const model = build(makePage({ name: 'Plain', metadata: defaultPageMetadata }));

    expect(Object.keys(model.notes[0]!.values)).toEqual(['name', 'type']);
  });

  it('a HIDDEN cover is no cover value — it is shown nowhere and does not count when sorting by Cover image', () => {
    const model = build(
      makePage({ name: 'Hidden', metadata: { ...defaultPageMetadata, cover: 'Assets/hero.png', coverHidden: true } })
    );

    expect(model.notes[0]!.values.cover).toBeUndefined();
  });

  it('a folder carries only its name and type: it has no dates, and nothing in the collection shows a folder\'s description or cover', () => {
    const model = build(makePage({ name: 'Anything', metadata: defaultPageMetadata }));

    expect(model.folders[0]!.values).toEqual({ name: 'Sub', type: 'Folder' });
  });

  it('the entry no longer carries the old per-property fields beside `values`', () => {
    const entry = build(makePage({ name: 'Plan', metadata: { ...defaultPageMetadata, description: 'x', createdAt: '2026-01-01T00:00:00.000Z' } })).notes[0]!;

    for (const retired of ['title', 'created', 'createdAt', 'updated', 'updatedAt', 'archived', 'archivedAt', 'description', 'cover', 'coverHidden']) {
      expect(entry, retired).not.toHaveProperty(retired);
    }
  });
});

describe('toCollectionPageModel — the Archive\'s folder rows count their archived contents', () => {
  it('shows an archived folder\'s real subfolder and note counts, not 0 · 0', () => {
    const archive = makeFolder({ id: 'archive-folder', name: 'Archive', path: `${ROOT}/Archive`, parentId: null });
    const archivedFolder = makeFolder({
      id: 'old',
      name: 'Old',
      path: `${ROOT}/Archive/Old`,
      parentId: 'archive-folder',
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    });
    const sub = makeFolder({ id: 'sub', name: 'Sub', path: `${ROOT}/Archive/Old/Sub`, parentId: 'old' });
    const noteInside = makePage({ id: 'n1', path: `${ROOT}/Archive/Old/N1.md`, parentId: 'old' });
    const noteInside2 = makePage({ id: 'n2', path: `${ROOT}/Archive/Old/N2.md`, parentId: 'old' });
    const { vault, query, effectivePageState, membershipSelector, workspace } = setup(
      [archive, archivedFolder, sub],
      [noteInside, noteInside2]
    );

    const model = toCollectionPageModel(archive, vault, query, effectivePageState, membershipSelector, workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

    const row = model.folders.find((entry) => entry.id === 'old')!;
    expect(row.subfolderCount).toBe(1);
    expect(row.noteCount).toBe(2);
  });
});

describe('toCollectionPageModel — an archived folder shows its real, archived contents', () => {
  const build = (status: 'archived' | 'active') => {
    const archive = makeFolder({ id: 'archive-folder', name: 'Archive', path: `${ROOT}/Archive`, parentId: null });
    // Location decides: 'active' is the same folder after a restore, outside Archive/.
    const base = status === 'archived' ? `${ROOT}/Archive` : ROOT;
    const old = makeFolder({
      id: 'old',
      name: 'Old',
      path: `${base}/Old`,
      parentId: status === 'archived' ? 'archive-folder' : null,
      metadata: { ...defaultFolderMetadata, status },
    });
    const sub = makeFolder({ id: 'sub', name: 'Sub', path: `${base}/Old/Sub`, parentId: 'old' });
    const deep = makePage({ id: 'deep', path: `${base}/Old/Sub/Deep.md`, parentId: 'sub' });
    const noteA = makePage({ id: 'a', path: `${base}/Old/A.md`, parentId: 'old' });
    const noteB = makePage({ id: 'b', path: `${base}/Old/B.md`, parentId: 'old' });
    const context = setup([archive, old, sub], [noteA, noteB, deep]);

    return { ...context, old, sub };
  };
  const modelOf = (context: ReturnType<typeof build>, folder: Folder) =>
    toCollectionPageModel(folder, context.vault, context.query, context.effectivePageState, context.membershipSelector, context.workspace, {
      onOpenFolder: vi.fn(),
      onOpenNote: vi.fn(),
      onOpenDraftNote: vi.fn(),
    });

  it('opening an archived folder lists its child folders and notes, with their own counts', () => {
    const context = build('archived');
    const model = modelOf(context, context.old);

    expect(model.notes.map((entry) => entry.id).sort()).toEqual(['a', 'b']);
    expect(model.folders.map((entry) => entry.id)).toEqual(['sub']);
    // The nested folder is archived too (inside one), and shows what it holds.
    expect(model.folders[0]!.noteCount).toBe(1);
    expect(model.folders[0]!.subfolderCount).toBe(0);
  });

  it('a child of an archived folder opens the same way, one level down', () => {
    const context = build('archived');
    const model = modelOf(context, context.sub);

    expect(model.notes.map((entry) => entry.id)).toEqual(['deep']);
  });

  it('the Archive\'s row for the folder counts its children', () => {
    const context = build('archived');
    const archive = context.vault.getFolder('archive-folder')!;
    const row = modelOf(context, archive).folders.find((entry) => entry.id === 'old')!;

    expect(row.subfolderCount).toBe(1);
    expect(row.noteCount).toBe(2);
  });

  it('once restored, the same folder lists the same children through the ordinary active views', () => {
    const context = build('active');
    const model = modelOf(context, context.old);

    expect(context.membershipSelector.isEffectivelyArchived('old')).toBe(false);
    expect(model.notes.map((entry) => entry.id).sort()).toEqual(['a', 'b']);
    expect(model.folders.map((entry) => entry.id)).toEqual(['sub']);
    expect(model.folders[0]!.noteCount).toBe(1);
  });
});
