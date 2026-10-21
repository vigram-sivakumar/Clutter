import { describe, expect, it, vi } from 'vitest';

import type { Folder, Page, VaultResource } from '../../vault/models';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { EmbedExtractor } from '../../vault/ingest/extractors/EmbedExtractor';
import { AssetMoveRefusedError } from '../../vault/persistence/AssetMovePolicy';
import { planMovedAssetReferences, type MovedAssetReferenceDeps } from './rewriteMovedAssetReferences';

const ROOT = '/vault';

const resource = (relative: string, id = relative): VaultResource => ({
  id,
  kind: 'image',
  name: relative.split('/').pop()!,
  path: `${ROOT}/${relative}`,
  parentId: null,
});

function note(id: string, body: string, options: { cover?: string | null } = {}): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path: `${ROOT}/${id}.md`,
      directoryPath: ROOT,
      frontmatter: { id, ...(options.cover !== undefined && options.cover !== null && { cover: options.cover }) },
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

const folder = (id: string, cover: string | null = null): Folder =>
  ({ id, name: id, path: `${ROOT}/${id}`, parentId: null, metadata: { cover } }) as unknown as Folder;

interface World {
  pages?: Page[];
  folders?: Folder[];
  resources: VaultResource[];
  open?: Record<string, string>;
  avatar?: string;
  archivedPages?: string[];
  archivedFolders?: string[];
  changedOnDisk?: string[];
}

function setup(world: World) {
  const writes = {
    body: [] as { id: string; after: string }[],
    pageCover: [] as { id: string; cover: string }[],
    folderCover: [] as { id: string; cover: string }[],
    avatar: [] as string[],
  };
  const pages = world.pages ?? [];
  const deps: { -readonly [K in keyof MovedAssetReferenceDeps]: MovedAssetReferenceDeps[K] } = {
    root: ROOT,
    resources: () => world.resources,
    pages: () => pages,
    folders: () => world.folders ?? [],
    isPageArchived: (page) => (world.archivedPages ?? []).includes(page.id),
    isFolderArchived: (candidate) => (world.archivedFolders ?? []).includes(candidate.id),
    openNoteMarkdown: () => new Map(Object.entries(world.open ?? {})),
    isUnchangedOnDisk: async (pageId) => !(world.changedOnDisk ?? []).includes(pageId),
    avatarSource: () => world.avatar,
    writeBody: vi.fn(async (pageId: string, transform: (markdown: string) => string) => {
      const page = pages.find((candidate) => candidate.id === pageId);
      const current = world.open?.[pageId] ?? page?.source.markdown ?? '';
      writes.body.push({ id: pageId, after: transform(current) });
    }),
    writePageCover: vi.fn(async (id: string, cover: string) => void writes.pageCover.push({ id, cover })),
    writeFolderCover: vi.fn(async (id: string, cover: string) => void writes.folderCover.push({ id, cover })),
    writeAvatar: vi.fn(async (reference: string) => void writes.avatar.push(reference)),
  };

  return { deps, writes };
}

const logo = resource('Assets/logo.png', 'logo');
const spec = resource('Assets/spec.png', 'spec');
const stay = resource('Assets/stay.png', 'stay');
const step = (from: VaultResource, to: string) => ({ resource: from, newPath: `${ROOT}/${to}` });
const plan = (world: World, steps = [step(logo, 'Docs/logo.png')]) => {
  const { deps, writes } = setup(world);

  return { deps, writes, planned: planMovedAssetReferences(deps, steps, '“logo.png”') };
};
const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AssetMoveRefusedError) return error;
    throw error;
  }
  throw new Error('expected the move to be refused');
};

describe('planMovedAssetReferences: nothing points at the files', () => {
  it('finds nothing, plans nothing, and writes nothing', async () => {
    const { planned, writes } = plan({
      resources: [logo, stay],
      pages: [note('a', 'No images here'), note('b', 'Only ![[Assets/stay.png]]')],
    });

    const result = await planned;
    expect(result.referenceCount).toBe(0);
    expect(await result.commit()).toMatchObject({ complete: true, updated: 0, failed: [] });
    expect(writes).toEqual({ body: [], pageCover: [], folderCover: [], avatar: [] });
  });
});

describe('planMovedAssetReferences + commit: what is rewritten', () => {
  it('points a ![[wikilink embed]] at the new path, keeping its alias and heading, and nothing else in the note', async () => {
    const body = 'Intro\n\n![[Assets/logo.png|The logo]]\n\nOutro ![[Assets/stay.png]]';
    const { planned, writes } = plan({ resources: [logo, stay], pages: [note('a', body)] });

    const result = await (await planned).commit();

    expect(writes.body).toEqual([
      { id: 'a', after: 'Intro\n\n![[Docs/logo.png|The logo]]\n\nOutro ![[Assets/stay.png]]' },
    ]);
    expect(result).toMatchObject({ complete: true, updated: 1, moves: [{ from: 'Assets/logo.png', to: 'Docs/logo.png' }] });
  });

  it('points a Markdown image at the new path, keeping its alt text and title', async () => {
    const { planned, writes } = plan({
      resources: [logo],
      pages: [note('a', 'See ![the logo](Assets/logo.png "Our logo") and ![other](https://example.com/x.png)')],
    });

    await (await planned).commit();

    expect(writes.body[0]!.after).toBe('See ![the logo](Docs/logo.png "Our logo") and ![other](https://example.com/x.png)');
  });

  it('points a note cover at the new path (a hidden cover is still a cover), and leaves its text alone when it has no reference', async () => {
    const { planned, writes } = plan({ resources: [logo], pages: [note('a', 'No embeds', { cover: 'Assets/logo.png' })] });

    const result = await (await planned).commit();

    expect(writes.pageCover).toEqual([{ id: 'a', cover: 'Docs/logo.png' }]);
    expect(writes.body).toEqual([]);
    expect(result.updated).toBe(1);
  });

  it('points a folder cover at the new path', async () => {
    const { planned, writes } = plan({ resources: [logo], folders: [folder('Projects', 'Assets/logo.png'), folder('Other', 'Assets/stay.png')] });

    const result = await (await planned).commit();

    expect(writes.folderCover).toEqual([{ id: 'Projects', cover: 'Docs/logo.png' }]);
    expect(result.updated).toBe(1);
  });

  it('points the Space avatar at the new path', async () => {
    const { planned, writes } = plan({ resources: [logo], avatar: 'Assets/logo.png' });

    const result = await (await planned).commit();

    expect(writes.avatar).toEqual(['Docs/logo.png']);
    expect(result.updated).toBe(1);
  });

  it('reaches an archived note (it can be restored), a text embed and a cover in the same note counting once', async () => {
    const { planned, writes } = plan({
      resources: [logo],
      pages: [note('old', 'Was ![[Assets/logo.png]]', { cover: 'Assets/logo.png' })],
      archivedPages: ['old'],
    });

    const result = await (await planned).commit();

    expect(writes.body).toEqual([{ id: 'old', after: 'Was ![[Docs/logo.png]]' }]);
    expect(writes.pageCover).toEqual([{ id: 'old', cover: 'Docs/logo.png' }]);
    expect(result.updated).toBe(1);
  });

  it('rewrites an open note’s unsaved text, which is where its reference may be, and not just the saved text', async () => {
    const { planned, writes } = plan({
      resources: [logo],
      pages: [note('a', 'Saved text, no image')],
      open: { a: 'Typing ![[Assets/logo.png]] right now' },
    });

    const result = await (await planned).commit();

    expect(writes.body).toEqual([{ id: 'a', after: 'Typing ![[Docs/logo.png]] right now' }]);
    expect(result.updated).toBe(1);
  });

  it('does not touch a note that mentions none of the moved files, nor code that merely looks like a reference', async () => {
    const { planned, writes } = plan({
      resources: [logo],
      pages: [note('a', 'Plain note'), note('b', 'Example: `![[Assets/logo.png]]` in code\n\n```\n![[Assets/logo.png]]\n```')],
    });

    const result = await planned;

    expect(result.referenceCount).toBe(0);
    await result.commit();
    expect(writes.body).toEqual([]);
  });

  it('a folder move: every file in it is mapped, and every reference to any of them is updated', async () => {
    const { planned, writes } = plan(
      {
        resources: [logo, spec, stay],
        pages: [note('a', '![[Assets/logo.png]] and ![spec](Assets/spec.png)'), note('b', 'Only ![[Assets/spec.png]]')],
        folders: [folder('Project', 'Assets/logo.png')],
        avatar: 'Assets/spec.png',
      },
      [step(logo, 'Moved/logo.png'), step(spec, 'Moved/spec.png')]
    );

    const result = await (await planned).commit();

    expect(writes.body).toEqual([
      { id: 'a', after: '![[Moved/logo.png]] and ![spec](Moved/spec.png)' },
      { id: 'b', after: 'Only ![[Moved/spec.png]]' },
    ]);
    expect(writes.folderCover).toEqual([{ id: 'Project', cover: 'Moved/logo.png' }]);
    expect(writes.avatar).toEqual(['Moved/spec.png']);
    expect(result).toMatchObject({ complete: true, updated: 4 });
    expect(result.moves).toHaveLength(2);
  });

  it('is idempotent: running the updates again finds nothing left to point', async () => {
    const world: World = { resources: [logo], pages: [note('a', 'Has ![[Assets/logo.png]]')] };
    const { planned, writes } = plan(world);
    const result = await planned;

    await result.commit();
    const again = await result.commit();

    // The second run rewrites the same, already-rewritten text: the write is a no-op transform of the text it is given.
    expect(writes.body.every((entry) => entry.after === 'Has ![[Docs/logo.png]]')).toBe(true);
    expect(again.complete).toBe(true);
  });
});

describe('planMovedAssetReferences: refused before anything moves', () => {
  it.each([
    ['a `./` prefix', 'Has ![[./Assets/logo.png]]'],
    ['percent-encoding', 'Has ![img](Assets%2Flogo.png)'],
  ])('refuses a reference spelled with %s: it finds the file but cannot be rewritten with confidence', async (_label, body) => {
    const { planned } = plan({ resources: [logo], pages: [note('a', body)] });

    const error = await refusal(planned);

    expect(error.reason).toBe('unsupported-spelling');
    expect(error.message).toMatch(/can’t be moved out of Assets/);
    expect(error.message).toMatch(/Nothing was moved/);
  });

  it('refuses a cover or an avatar spelled another way, too', async () => {
    expect((await refusal(plan({ resources: [logo], pages: [note('a', 'x', { cover: './Assets/logo.png' })] }).planned)).reason).toBe(
      'unsupported-spelling'
    );
    expect((await refusal(plan({ resources: [logo], folders: [folder('P', './Assets/logo.png')] }).planned)).reason).toBe(
      'unsupported-spelling'
    );
    expect((await refusal(plan({ resources: [logo], avatar: 'Assets/%6Cogo.png' }).planned)).reason).toBe('unsupported-spelling');
  });

  it('does not guess at what is not a reference to the file: an unresolved name, an alias, a web address, raw HTML', async () => {
    const { planned } = plan({
      resources: [logo],
      pages: [
        note(
          'a',
          '![[logo.png]] ![[Nowhere/logo.png]] ![remote](https://example.com/Assets/logo.png) <img src="Assets/logo.png"> [link](Assets/logo.png)'
        ),
      ],
    });

    expect((await planned).referenceCount).toBe(0);
  });

  it('refuses a note that was changed outside Clutter, rather than overwrite it', async () => {
    const { planned, writes } = plan({
      resources: [logo],
      pages: [note('a', '![[Assets/logo.png]]'), note('b', 'unrelated')],
      changedOnDisk: ['a'],
    });

    const error = await refusal(planned);

    expect(error.reason).toBe('changed-on-disk');
    expect(error.detail).toBe(`${ROOT}/a.md`);
    expect(writes.body).toEqual([]);
  });

  it('does not mind that an unrelated note changed outside Clutter', async () => {
    const { planned } = plan({
      resources: [logo],
      pages: [note('a', '![[Assets/logo.png]]'), note('b', 'unrelated')],
      changedOnDisk: ['b'],
    });

    expect((await planned).referenceCount).toBe(1);
  });

  it('refuses when a note that has never been saved uses the file (there is no saved text to update)', async () => {
    const { planned } = plan({ resources: [logo], pages: [], open: { draft: 'New note ![[Assets/logo.png]]' } });

    expect((await refusal(planned)).reason).toBe('unsaved-draft');
  });

  it('refuses when an archived folder (which cannot be edited) uses the file as its cover', async () => {
    const { planned } = plan({ resources: [logo], folders: [folder('Old', 'Assets/logo.png')], archivedFolders: ['Old'] });

    expect((await refusal(planned)).reason).toBe('archived-folder');
  });

  it.each([
    ['a space in a Markdown image path', 'Has ![x](Assets/logo.png)', 'Docs/my logo.png'],
    ['a bracket in a wikilink path', 'Has ![[Assets/logo.png]]', 'Docs/lo]go.png'],
    ['a pipe in a wikilink path', 'Has ![[Assets/logo.png]]', 'Docs/lo|go.png'],
  ])('refuses a destination the reference could not hold: %s', async (_label, body, destination) => {
    const { planned } = plan({ resources: [logo], pages: [note('a', body)] }, [step(logo, destination)]);

    expect((await refusal(planned)).reason).toBe('unrepresentable-path');
  });

  it('refuses when the check itself fails, so nothing is moved on a guess', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps } = setup({ resources: [logo], pages: [note('a', 'x')] });
    deps.isUnchangedOnDisk = async () => {
      throw new Error('disk gone');
    };
    const withReference = setup({ resources: [logo], pages: [note('a', '![[Assets/logo.png]]')] }).deps;
    withReference.isUnchangedOnDisk = deps.isUnchangedOnDisk;

    expect((await refusal(planMovedAssetReferences(withReference, [step(logo, 'Docs/logo.png')], '“logo.png”'))).reason).toBe('scan-failed');

    const brokenScan = setup({ resources: [logo] }).deps;
    brokenScan.pages = () => {
      throw new Error('vault unavailable');
    };
    expect((await refusal(planMovedAssetReferences(brokenScan, [step(logo, 'Docs/logo.png')], '“logo.png”'))).reason).toBe('scan-failed');
  });

  it('names the file in the explanation, and the place when there is one', async () => {
    const { planned } = plan({ resources: [logo], pages: [note('a', 'Has ![[./Assets/logo.png]]')] });

    const error = await refusal(planned);

    expect(error.message).toContain('“logo.png”');
    expect(error.message).toContain('a.md');
  });
});

describe('commit: when an update fails after the move', () => {
  it('never reports success: it says which places still point at the old path, and carries on with the rest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deps, writes } = setup({
      resources: [logo],
      pages: [note('a', '![[Assets/logo.png]]'), note('b', '![[Assets/logo.png]]')],
      folders: [folder('P', 'Assets/logo.png')],
      avatar: 'Assets/logo.png',
    });
    deps.writeBody = vi.fn(async (pageId: string) => {
      if (pageId === 'a') throw new Error('This note is busy');
      writes.body.push({ id: pageId, after: 'rewritten' });
    });
    deps.writeAvatar = vi.fn(async () => {
      throw new Error('Profile not writable');
    });

    const result = await (await planMovedAssetReferences(deps, [step(logo, 'Docs/logo.png')], '“logo.png”')).commit();

    expect(result.complete).toBe(false);
    expect(result.updated).toBe(2); // note b and the folder cover
    expect(result.failed).toEqual([
      { kind: 'note', id: 'a', path: `${ROOT}/a.md`, usage: 'text', message: 'This note is busy' },
      { kind: 'avatar', id: '', path: '', usage: 'avatar', message: 'Profile not writable' },
    ]);
    // What is needed to recover: where each file went, so the failed places can be pointed at it.
    expect(result.moves).toEqual([{ from: 'Assets/logo.png', to: 'Docs/logo.png' }]);
    expect(writes.body.map((entry) => entry.id)).toEqual(['b']);
    expect(writes.folderCover).toHaveLength(1);
  });
});
