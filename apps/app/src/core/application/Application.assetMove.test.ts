import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import type { Folder } from '../vault/models/Folder';
import type { Page } from '../vault/models/Page';
import type { VaultResource } from '../vault/models/VaultResource';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../vault/ingest/FrontmatterSerializer';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { PageBuilder } from '../vault/ingest/PageBuilder';
import { EmbedExtractor } from '../vault/ingest/extractors/EmbedExtractor';
import { AssetMoveRefusedError, type AssetMoveFeedback } from '../vault/persistence/AssetMovePolicy';
import { DocumentTransaction } from '../engine/DocumentTransaction';
import { buildAssetItemMenu } from '../../app/layouts/page/body/buildCollectionItemMenu';
import { buildResourceMenuOptions } from '../../app/layouts/page/topbar/buildResourceMenuOptions';
import { buildMoveDestinationItems } from '../../features/notes/helpers/buildMoveDestinationItems';
import { ROOT_DESTINATION_ID } from '../../components/picker-list/PickerList.types';

const ROOT = '/vault';
const folderMetadata = {
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null as string | null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const folder = (id: string, name: string, parent: Folder | null = null, cover: string | null = null): Folder => ({
  id,
  name,
  path: `${parent?.path ?? ROOT}/${name}`,
  parentId: parent?.id ?? null,
  metadata: { ...folderMetadata, cover },
});

function note(id: string, body: string, options: { cover?: string; parent?: Folder } = {}): Page {
  const directory = options.parent?.path ?? ROOT;

  return new PageBuilder(ROOT).build({
    parentId: options.parent?.id ?? null,
    page: {
      path: `${directory}/${id}.md`,
      directoryPath: directory,
      frontmatter: { id, ...(options.cover && { cover: options.cover }) },
      frontmatterAnalysis: { aliases: [] },
      content: body,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: new EmbedExtractor().extract(body),
      },
    },
  } as never);
}

const image = (name: string, parent: Folder, id = name): VaultResource => ({
  id,
  kind: 'image',
  name,
  path: `${parent.path}/${name}`,
  parentId: parent.id,
});

const assets = folder('assets', 'Assets');
const sub = folder('sub', 'Sub', assets);
const docs = folder('docs', 'Docs');

interface Options {
  pages?: Page[];
  folders?: Folder[];
  resources?: VaultResource[];
  allow?: boolean;
  avatar?: string;
}

/** One Space: the Assets hierarchy, an ordinary folder `Docs`, notes that use the assets, and the Space's own setting. */
async function openSpace(options: Options = {}) {
  const pages = options.pages ?? [];
  const resources = options.resources ?? [];
  const folders = [assets, sub, docs, ...(options.folders ?? [])];
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();

  for (const page of pages) {
    fileSystem.seedFile(page.path, serializer.serializeDocument(page, page.source.markdown));
  }
  for (const resource of resources) {
    fileSystem.seedFile(resource.path, `bytes:${resource.name}`);
  }
  for (const created of folders) {
    await fileSystem.createDirectory(created.path);
  }

  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  Reflect.set(application, 'rootPath', ROOT);
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  if (options.allow) await application.setAllowMovingAssetsToFolders(true);
  if (options.avatar) await application.spaceProfileStore.setAvatar({ type: 'image', src: options.avatar });

  const feedback: AssetMoveFeedback[] = [];
  application.subscribeAssetMoveFeedback((event) => feedback.push(event));
  const text = (path: string) => fileSystem.readFile(path);

  return { application, vault, fileSystem, feedback, text };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the setting', () => {
  it('is off by default, and then assets still move within Assets and nowhere else', async () => {
    const logo = image('logo.png', assets);
    const { application, vault, fileSystem } = await openSpace({ resources: [logo] });
    expect(application.allowMovingAssetsToFolders).toBe(false);

    await application.resourceOperations.moveResource('logo.png', 'sub');
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/Sub/logo.png`);
    expect(await fileSystem.exists(`${ROOT}/Assets/Sub/logo.png`)).toBe(true);

    await expect(application.resourceOperations.moveResource('logo.png', 'docs')).rejects.toThrow(
      'this item can only be moved within assets'
    );
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/Sub/logo.png`);
    expect(await fileSystem.exists(`${ROOT}/Docs/logo.png`)).toBe(false);
  });

  it('keeps an asset folder in Assets while it is off', async () => {
    const { application, vault } = await openSpace({ resources: [image('logo.png', sub)] });

    await expect(application.folderOperations.move('sub', 'docs')).rejects.toThrow('can only be moved within assets');
    expect(vault.getFolder('sub')!.path).toBe(`${ROOT}/Assets/Sub`);
  });

  it('is saved in this Space’s own profile, and does not exist in another', async () => {
    const on = await openSpace({ allow: true });
    const off = await openSpace();

    expect(on.application.allowMovingAssetsToFolders).toBe(true);
    expect(off.application.allowMovingAssetsToFolders).toBe(false);
    await on.application.setAllowMovingAssetsToFolders(false);
    expect(on.application.allowMovingAssetsToFolders).toBe(false);
  });

  it('is isolated between Spaces: allowed in one, still refused in the other, with the same assets', async () => {
    const allowed = await openSpace({ resources: [image('logo.png', assets)], allow: true });
    const refused = await openSpace({ resources: [image('logo.png', assets)] });

    await allowed.application.resourceOperations.moveResource('logo.png', 'docs');
    await expect(refused.application.resourceOperations.moveResource('logo.png', 'docs')).rejects.toThrow();

    expect(allowed.vault.getResource('logo.png')!.path).toBe(`${ROOT}/Docs/logo.png`);
    expect(refused.vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/logo.png`);
  });
});

describe('with the setting on: an asset nothing uses', () => {
  it('moves into an ordinary folder, on disk and in the Vault', async () => {
    const { application, vault, fileSystem } = await openSpace({ resources: [image('logo.png', assets)], allow: true });

    const summary = await application.resourceOperations.moveResource('logo.png', 'docs');

    expect(vault.getResource('logo.png')).toMatchObject({ path: `${ROOT}/Docs/logo.png`, parentId: 'docs' });
    expect(await fileSystem.exists(`${ROOT}/Assets/logo.png`)).toBe(false);
    expect(await fileSystem.readFile(`${ROOT}/Docs/logo.png`)).toBe('bytes:logo.png');
    expect(summary).toMatchObject({ complete: true, updated: 0, moves: [{ from: 'Assets/logo.png', to: 'Docs/logo.png' }] });
  });

  it('can still move within Assets, with no reference work at all', async () => {
    const { application } = await openSpace({ resources: [image('logo.png', assets)], allow: true });

    expect(await application.resourceOperations.moveResource('logo.png', 'sub')).toBeUndefined();
  });

  it('refuses the vault root for a file: only a folder may be moved there', async () => {
    const { application, vault } = await openSpace({ resources: [image('logo.png', assets)], allow: true });

    await expect(application.resourceOperations.moveResource('logo.png', null)).rejects.toThrow(
      'only folders can be moved there'
    );
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/logo.png`);
  });

  it('an asset folder may go to the vault root, and brings its files', async () => {
    const { application, vault, fileSystem } = await openSpace({ resources: [image('logo.png', sub)], allow: true });

    await application.folderOperations.move('sub', null);

    expect(vault.getFolder('sub')!.path).toBe(`${ROOT}/Sub`);
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Sub/logo.png`);
    expect(await fileSystem.exists(`${ROOT}/Sub/logo.png`)).toBe(true);
  });

  it('refuses an archived folder as the destination', async () => {
    // Archived means inside Archive/ (ADR-026).
    const archive = folder('archive', 'Archive');
    const archived = { ...folder('old', 'Old', archive), metadata: { ...folderMetadata, status: 'archived' as const } };
    const { application, vault } = await openSpace({
      resources: [image('logo.png', assets)],
      folders: [archive, archived],
      allow: true,
    });

    await expect(application.resourceOperations.moveResource('logo.png', 'old')).rejects.toThrow('archived folder');
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/logo.png`);
  });

  it('refuses an asset folder moved into itself or a descendant', async () => {
    const { application, vault } = await openSpace({ resources: [image('logo.png', sub)], allow: true });

    await expect(application.folderOperations.move('assets', 'sub')).rejects.toThrow();
    expect(vault.getFolder('assets')!.path).toBe(`${ROOT}/Assets`);
  });

  it('gives a name that is already taken a suffix, as every move does, and the references follow the file as it is now called', async () => {
    const existing = image('logo.png', docs, 'existing');
    const logo = image('logo.png', assets, 'logo');
    const { application, vault, text } = await openSpace({
      resources: [logo, existing],
      pages: [note('a', 'Uses ![[Assets/logo.png]]')],
      allow: true,
    });

    await application.resourceOperations.moveResource('logo', 'docs');

    const moved = vault.getResource('logo')!;
    expect(moved.path).not.toBe(`${ROOT}/Docs/logo.png`);
    expect(moved.path).toMatch(/\/Docs\/logo \d+\.png$/);
    expect(vault.getResource('existing')!.path).toBe(`${ROOT}/Docs/logo.png`); // never overwritten
    expect(await text(`${ROOT}/a.md`)).toContain(`![[${moved.path.replace(`${ROOT}/`, '')}]]`);
  });
});

describe('with the setting on: an asset that is used', () => {
  const used = () => image('logo.png', assets);

  it('updates a ![[wikilink]], a Markdown image, a note cover, a folder cover and the Space avatar — and nothing else', async () => {
    const unrelated = note('plain', 'Nothing to see ![[Assets/other.png]]');
    const { application, vault, text, feedback } = await openSpace({
      resources: [used(), image('other.png', assets)],
      pages: [
        note('embed', 'Hello ![[Assets/logo.png|The logo]] there'),
        note('markdown', 'See ![alt](Assets/logo.png "Title") now'),
        note('cover', 'Body only', { cover: 'Assets/logo.png' }),
        unrelated,
      ],
      folders: [folder('proj', 'Proj', null, 'Assets/logo.png')],
      avatar: 'Assets/logo.png',
      allow: true,
    });
    const before = await text(unrelated.path);

    const summary = await application.resourceOperations.moveResource('logo.png', 'docs');

    expect(summary).toMatchObject({ complete: true, failed: [], updated: 5 });
    expect(await text(`${ROOT}/embed.md`)).toContain('Hello ![[Docs/logo.png|The logo]] there');
    expect(await text(`${ROOT}/markdown.md`)).toContain('See ![alt](Docs/logo.png "Title") now');
    expect(vault.getPage('cover')!.metadata.cover).toBe('Docs/logo.png');
    expect(await text(`${ROOT}/cover.md`)).toContain('Docs/logo.png');
    expect(vault.getFolder('proj')!.metadata.cover).toBe('Docs/logo.png');
    expect(application.spaceProfileStore.profile?.avatar).toEqual({ type: 'image', src: 'Docs/logo.png' });
    expect(await text(unrelated.path)).toBe(before); // byte for byte
    expect(feedback).toEqual([]);
  });

  it('updates an archived note too', async () => {
    const { application, vault, text } = await openSpace({
      resources: [used()],
      pages: [note('old', 'Was ![[Assets/logo.png]]')],
      allow: true,
    });
    await application.pageOperations.archive('old');

    await application.resourceOperations.moveResource('logo.png', 'docs');

    expect(vault.getPage('old')!.metadata.status).toBe('archived');
    expect(await text(vault.getPage('old')!.path)).toContain('![[Docs/logo.png]]');
  });

  it('updates the text an open editor holds but has not saved, and keeps it open', async () => {
    const { application, vault } = await openSpace({
      resources: [used()],
      pages: [note('a', 'Saved text, no image yet')],
      allow: true,
    });
    const session = application.documentRegistry.open('a', 'Saved text, no image yet');
    session.commit(new DocumentTransaction('Typing ![[Assets/logo.png]] right now'));

    const summary = await application.resourceOperations.moveResource('logo.png', 'docs');

    expect(summary?.complete).toBe(true);
    expect(application.documentRegistry.get('a')!.currentRevision.markdown).toBe('Typing ![[Docs/logo.png]] right now');
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Docs/logo.png`);
  });

  it('a folder move takes every asset along and updates the references to each', async () => {
    const one = image('one.png', sub);
    const two = image('two.png', sub);
    const { application, vault, text } = await openSpace({
      resources: [one, two, image('kept.png', assets)],
      pages: [note('a', '![[Assets/Sub/one.png]] and ![x](Assets/Sub/two.png)'), note('b', '![[Assets/Sub/two.png]] ![[Assets/kept.png]]')],
      avatar: 'Assets/Sub/one.png',
      allow: true,
    });

    const summary = await application.folderOperations.move('sub', 'docs');

    expect(vault.getFolder('sub')!.path).toBe(`${ROOT}/Docs/Sub`);
    expect(summary).toMatchObject({ complete: true, updated: 3 });
    expect(summary!.moves).toHaveLength(2);
    expect(await text(`${ROOT}/a.md`)).toContain('![[Docs/Sub/one.png]] and ![x](Docs/Sub/two.png)');
    expect(await text(`${ROOT}/b.md`)).toContain('![[Docs/Sub/two.png]] ![[Assets/kept.png]]');
    expect(application.spaceProfileStore.profile?.avatar).toEqual({ type: 'image', src: 'Docs/Sub/one.png' });
  });

  it.each([
    ['./ prefixed', 'Uses ![[./Assets/logo.png]]'],
    ['percent-encoded', 'Uses ![](Assets%2Flogo.png)'],
  ])('refuses a %s reference before anything moves, and explains why', async (_label, body) => {
    const { application, vault, fileSystem, feedback, text } = await openSpace({
      resources: [used()],
      pages: [note('a', body)],
      allow: true,
    });
    const before = await text(`${ROOT}/a.md`);

    await expect(application.resourceOperations.moveResource('logo.png', 'docs')).rejects.toBeInstanceOf(AssetMoveRefusedError);

    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/logo.png`);
    expect(await fileSystem.exists(`${ROOT}/Assets/logo.png`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Docs/logo.png`)).toBe(false);
    expect(await text(`${ROOT}/a.md`)).toBe(before);
    expect(feedback).toEqual([{ kind: 'refused', message: expect.stringContaining('Nothing was moved') }]);
  });

  it('refuses when a note that uses it was changed outside Clutter, and never overwrites it', async () => {
    const { application, vault, fileSystem, text } = await openSpace({
      resources: [used()],
      pages: [note('a', 'Uses ![[Assets/logo.png]]')],
      allow: true,
    });
    await fileSystem.writeFile(`${ROOT}/a.md`, '---\nid: a\n---\nEdited elsewhere ![[Assets/logo.png]] and more');

    await expect(application.resourceOperations.moveResource('logo.png', 'docs')).rejects.toMatchObject({ reason: 'changed-on-disk' });

    expect(await text(`${ROOT}/a.md`)).toBe('---\nid: a\n---\nEdited elsewhere ![[Assets/logo.png]] and more');
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/logo.png`);
  });

  it('refuses a folder move if any one of its files is referenced in a way that cannot be updated', async () => {
    const { application, vault } = await openSpace({
      resources: [image('one.png', sub), image('two.png', sub)],
      pages: [note('a', '![[Assets/Sub/one.png]]'), note('b', '![[./Assets/Sub/two.png]]')],
      allow: true,
    });

    await expect(application.folderOperations.move('sub', 'docs')).rejects.toBeInstanceOf(AssetMoveRefusedError);

    expect(vault.getFolder('sub')!.path).toBe(`${ROOT}/Assets/Sub`);
    expect(vault.getResource('one.png')!.path).toBe(`${ROOT}/Assets/Sub/one.png`);
  });

  it('a scan that fails refuses the move before anything changes', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { application, vault, fileSystem } = await openSpace({ resources: [used()], pages: [note('a', 'x')], allow: true });
    vi.spyOn(vault, 'pages').mockImplementation(() => {
      throw new Error('vault unavailable');
    });

    await expect(application.resourceOperations.moveResource('logo.png', 'docs')).rejects.toMatchObject({ reason: 'scan-failed' });

    expect(await fileSystem.exists(`${ROOT}/Assets/logo.png`)).toBe(true);
  });

  it('a filesystem failure during the move changes nothing: the file, the Vault and every reference stay as they were', async () => {
    const { application, vault, fileSystem, text } = await openSpace({
      resources: [used()],
      pages: [note('a', 'Uses ![[Assets/logo.png]]')],
      allow: true,
    });
    vi.spyOn(fileSystem, 'moveFile').mockRejectedValue(new Error('Permission denied (os error 13)'));
    const before = await text(`${ROOT}/a.md`);

    await expect(application.resourceOperations.moveResource('logo.png', 'docs')).rejects.toThrow('Permission denied');

    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/logo.png`);
    expect(await text(`${ROOT}/a.md`)).toBe(before);
  });

  it('when a reference cannot be updated after the move, the move stands, the failure is reported, and the rest is updated', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { application, vault, text, feedback } = await openSpace({
      resources: [used()],
      pages: [note('a', 'Uses ![[Assets/logo.png]]'), note('b', 'Also ![[Assets/logo.png]]')],
      avatar: 'Assets/logo.png',
      allow: true,
    });
    const real = application.pageOperations.mutateBody.bind(application.pageOperations);
    vi.spyOn(application.pageOperations, 'mutateBody').mockImplementation(async (id, transform, options) => {
      if (id === 'a') throw new Error('This note is busy');
      return real(id, transform, options);
    });

    const summary = await application.resourceOperations.moveResource('logo.png', 'docs');

    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Docs/logo.png`); // not moved back
    expect(summary).toMatchObject({ complete: false, updated: 2 });
    expect(summary!.failed).toEqual([
      { kind: 'note', id: 'a', path: `${ROOT}/a.md`, usage: 'text', message: 'This note is busy' },
    ]);
    expect(summary!.moves).toEqual([{ from: 'Assets/logo.png', to: 'Docs/logo.png' }]);
    expect(await text(`${ROOT}/a.md`)).toContain('![[Assets/logo.png]]'); // left as it was: nothing overwritten
    expect(await text(`${ROOT}/b.md`)).toContain('![[Docs/logo.png]]');
    expect(application.spaceProfileStore.profile?.avatar).toEqual({ type: 'image', src: 'Docs/logo.png' });
    expect(feedback).toEqual([{ kind: 'incomplete', summary }]);
  });
});

describe('the Move picker in every place an asset can be moved from', () => {
  /** The three places: an asset file's menu, an asset folder's menu, and an asset's entry in the Assets view. */
  const fileMenu = (application: Application) =>
    buildMoveDestinationItems(application.membershipSelector, undefined, 'assets').map((item) => item.id);
  const folderMenu = (application: Application, folderId: string) => {
    const resource = application.vault.getFolder(folderId)!;
    const options = buildResourceMenuOptions(application, resource, {} as never);

    return (options.moveDestinations ?? []).map((item) => item.id);
  };
  const assetsViewMenu = (application: Application, resource: VaultResource) => {
    const menu = buildAssetItemMenu(application, {} as never, { source: 'local', kind: 'image', resource } as never);

    return (menu?.moveDestinations ?? []).map((item) => item.id);
  };

  it('with the setting off, each offers only Assets and the folders inside it — as before', async () => {
    const logo = image('logo.png', assets);
    const { application } = await openSpace({ resources: [logo] });

    expect(fileMenu(application)).toEqual(['assets', 'sub']);
    expect(folderMenu(application, 'sub')).toEqual(['assets']);
    expect(assetsViewMenu(application, logo)).toEqual(['assets', 'sub']);
  });

  it('with it on, each also offers the ordinary folders after Assets; the vault root only for a folder', async () => {
    const logo = image('logo.png', assets);
    const { application } = await openSpace({ resources: [logo], folders: [folder('proj', 'Proj')], allow: true });

    // An asset file: Assets first, then the ordinary folders — never the vault root.
    expect(fileMenu(application)).toEqual(['assets', 'sub', 'docs', 'proj']);
    expect(assetsViewMenu(application, logo)).toEqual(['assets', 'sub', 'docs', 'proj']);
    // An asset folder: the same, with the vault root before them (only a folder may go there), and itself left out.
    expect(folderMenu(application, 'sub')).toEqual(['assets', ROOT_DESTINATION_ID, 'docs', 'proj']);
  });

  it('follows the preference at once: the very next menu built reflects the change, both ways', async () => {
    const logo = image('logo.png', assets);
    const { application } = await openSpace({ resources: [logo] });
    expect(fileMenu(application)).toEqual(['assets', 'sub']);

    await application.setAllowMovingAssetsToFolders(true);
    expect(fileMenu(application)).toEqual(['assets', 'sub', 'docs']);
    expect(assetsViewMenu(application, logo)).toEqual(['assets', 'sub', 'docs']);

    await application.setAllowMovingAssetsToFolders(false);
    expect(fileMenu(application)).toEqual(['assets', 'sub']);
  });

  it('what a picker offers is what the Gate accepts, and the Gate does not rely on the picker', async () => {
    const logo = image('logo.png', assets);
    const { application, vault } = await openSpace({ resources: [logo] });
    const offered = fileMenu(application);

    // Off: Docs is not offered, and asking for it anyway is refused by the Gate itself.
    expect(offered).not.toContain('docs');
    await expect(application.resourceOperations.moveResource('logo.png', 'docs')).rejects.toThrow();
    expect(vault.getResource('logo.png')!.path).toBe(`${ROOT}/Assets/logo.png`);
  });
});
