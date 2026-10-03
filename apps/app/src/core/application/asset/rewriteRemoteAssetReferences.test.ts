import { describe, expect, it } from 'vitest';

import type { Folder, Page, VaultResource } from '../../vault/models';
import { AssetCatalogBuilder } from '../membership/AssetCatalogBuilder';
import {
  rewriteRemoteAssetReferences,
  type FolderReferenceWriter,
  type PageReferenceWriter,
} from './rewriteRemoteAssetReferences';

const URL_ = 'https://example.com/remote.jpg';
const LOCAL = 'Assets/remote-1a2b3c4d.jpg';
const ROOT = '/vault';

interface FakePage {
  id: string;
  archived?: boolean;
  cover?: string | null;
  coverHidden?: boolean;
  markdown?: string;
}

const page = ({ id, cover = null, coverHidden = false, markdown = '' }: FakePage): Page =>
  ({
    id,
    type: 'note',
    name: id,
    path: `${ROOT}/${id}.md`,
    parentId: null,
    metadata: { cover, coverHidden },
    source: { markdown },
    analysis: { embeds: [] },
  }) as unknown as Page;

const folder = (id: string, cover: string | null, coverHidden = false): Folder =>
  ({ id, name: id, path: `${ROOT}/${id}`, parentId: null, metadata: { cover, coverHidden } }) as unknown as Folder;

/** Writers backed by mutable "stores", standing in for PageOperations/FolderOperations. */
function harness(pages: Page[], folders: Folder[], opts: { failBodyFor?: string[]; archived?: string[] } = {}) {
  const markdown = new Map(pages.map((p) => [p.id, p.source.markdown]));
  const covers = new Map<string, string | null>([
    ...pages.map((p) => [p.id, p.metadata.cover] as const),
    ...folders.map((f) => [f.id, f.metadata.cover] as const),
  ]);
  const pageWriter: PageReferenceWriter = {
    async updateMetadata(id, patch) {
      covers.set(id, patch.cover);
      // The real Vault swaps in an updated Page; mirror that so a re-run sees the new cover.
      (pages.find((p) => p.id === id)!.metadata as { cover: string | null }).cover = patch.cover;
    },
    async mutateBody(id, transform) {
      if (opts.failBodyFor?.includes(id)) {
        throw new Error('write failed');
      }
      markdown.set(id, transform(markdown.get(id)!));
    },
  };
  const folderWriter: FolderReferenceWriter = {
    async updateMetadata(id, patch) {
      covers.set(id, patch.cover);
      (folders.find((f) => f.id === id)!.metadata as { cover: string | null }).cover = patch.cover;
    },
  };
  const run = () =>
    rewriteRemoteAssetReferences({
      url: URL_,
      reference: LOCAL,
      pages,
      folders,
      currentMarkdown: (p) => markdown.get(p.id) ?? p.source.markdown,
      isPageArchived: (p) => opts.archived?.includes(p.id) ?? false,
      isFolderArchived: (f) => opts.archived?.includes(f.id) ?? false,
      pageWriter,
      folderWriter,
    });
  return { run, markdown, covers };
}

describe('rewriteRemoteAssetReferences — the reference matrix', () => {
  it('rewrites a page cover', async () => {
    const h = harness([page({ id: 'p', cover: URL_ })], []);
    expect(await h.run()).toMatchObject({ rewritten: 1 });
    expect(h.covers.get('p')).toBe(LOCAL);
  });

  it('rewrites a folder cover', async () => {
    const h = harness([], [folder('f', URL_)]);
    expect(await h.run()).toMatchObject({ rewritten: 1 });
    expect(h.covers.get('f')).toBe(LOCAL);
  });

  it('rewrites a Markdown image', async () => {
    const h = harness([page({ id: 'p', markdown: `![alt](${URL_})` })], []);
    await h.run();
    expect(h.markdown.get('p')).toBe(`![alt](${LOCAL})`);
  });

  it('does not touch a plain link, inline code, a fenced block or a wiki embed', async () => {
    const markdown = [
      `[text](${URL_})`,
      '`![image](' + URL_ + ')`',
      '```',
      `![fenced](${URL_})`,
      '```',
      `![[${URL_}]]`,
    ].join('\n');
    const h = harness([page({ id: 'p', markdown })], []);

    const summary = await h.run();

    expect(summary).toEqual({ rewritten: 0, failed: [], skippedArchived: 0, skippedHidden: 0 });
    expect(h.markdown.get('p')).toBe(markdown);
  });

  it('does not touch an archived note, and reports each of its uses', async () => {
    const h = harness([page({ id: 'p', cover: URL_, markdown: `![a](${URL_})` })], [folder('f', URL_)], {
      archived: ['p', 'f'],
    });

    const summary = await h.run();

    expect(summary).toMatchObject({ rewritten: 0, skippedArchived: 3 });
    expect(h.covers.get('p')).toBe(URL_);
    expect(h.covers.get('f')).toBe(URL_);
    expect(h.markdown.get('p')).toBe(`![a](${URL_})`);
  });

  it('does not touch a hidden cover (page or folder), and reports it', async () => {
    const h = harness([page({ id: 'p', cover: URL_, coverHidden: true })], [folder('f', URL_, true)]);

    const summary = await h.run();

    expect(summary).toMatchObject({ rewritten: 0, skippedHidden: 2 });
    expect(h.covers.get('p')).toBe(URL_);
    expect(h.covers.get('f')).toBe(URL_);
  });

  it('still rewrites the body image of a note whose cover is hidden', async () => {
    const h = harness([page({ id: 'p', cover: URL_, coverHidden: true, markdown: `![a](${URL_})` })], []);

    const summary = await h.run();

    expect(summary).toMatchObject({ rewritten: 1, skippedHidden: 1 });
    expect(h.markdown.get('p')).toBe(`![a](${LOCAL})`);
  });
});

describe('rewriteRemoteAssetReferences — markdown forms', () => {
  it.each([
    [`![alt](${URL_})`, `![alt](${LOCAL})`],
    [`![alt text](<${URL_}>)`, `![alt text](<${LOCAL}>)`],
    [`![alt](${URL_} "title")`, `![alt](${LOCAL} "title")`],
    [`![a](${URL_})\n\n![b](${URL_})`, `![a](${LOCAL})\n\n![b](${LOCAL})`],
  ])('%s', async (before, after) => {
    const h = harness([page({ id: 'p', markdown: before })], []);
    await h.run();
    expect(h.markdown.get('p')).toBe(after);
  });

  it('only matches the exact URL: the same URL with a query string is a different image', async () => {
    const markdown = `![a](${URL_}?foo=bar)`;
    const h = harness([page({ id: 'p', markdown })], []);

    expect(await h.run()).toMatchObject({ rewritten: 0 });
    expect(h.markdown.get('p')).toBe(markdown);
  });

  it('a URL that itself carries a query rewrites when that exact URL is the one saved', async () => {
    const withQuery = 'https://example.com/remote.jpg?foo=bar';
    const markdown = `![a](${withQuery})`;
    const pages = [page({ id: 'p', markdown })];
    const h = harness(pages, []);
    const summary = await rewriteRemoteAssetReferences({
      url: withQuery,
      reference: LOCAL,
      pages,
      folders: [],
      currentMarkdown: (p) => h.markdown.get(p.id)!,
      isPageArchived: () => false,
      isFolderArchived: () => false,
      pageWriter: { updateMetadata: async () => undefined, mutateBody: async (id, t) => void h.markdown.set(id, t(h.markdown.get(id)!)) },
      folderWriter: { updateMetadata: async () => undefined },
    });

    expect(summary.rewritten).toBe(1);
    expect(h.markdown.get('p')).toBe(`![a](${LOCAL})`);
  });
});

describe('rewriteRemoteAssetReferences — the combined case', () => {
  const pages = () => [
    page({ id: 'A', cover: URL_, markdown: `![a](${URL_})` }),
    page({ id: 'B', markdown: `text ![b](${URL_})` }),
  ];

  it('points every use at the same single local reference', async () => {
    const h = harness(pages(), [folder('C', URL_)]);

    const summary = await h.run();

    expect(summary).toEqual({ rewritten: 4, failed: [], skippedArchived: 0, skippedHidden: 0 });
    expect(h.covers.get('A')).toBe(LOCAL);
    expect(h.markdown.get('A')).toBe(`![a](${LOCAL})`);
    expect(h.markdown.get('B')).toBe(`text ![b](${LOCAL})`);
    expect(h.covers.get('C')).toBe(LOCAL);
  });

  it('is idempotent: running it again finds nothing left to do', async () => {
    const h = harness(pages(), [folder('C', URL_)]);
    await h.run();

    expect(await h.run()).toEqual({ rewritten: 0, failed: [], skippedArchived: 0, skippedHidden: 0 });
  });

  it('partial failure: 9 of 10 notes update, the failure is reported, and the rest are not abandoned', async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `n${index}`);
    const h = harness(
      ids.map((id) => page({ id, markdown: `![x](${URL_})` })),
      [],
      { failBodyFor: ['n4'] }
    );

    const summary = await h.run();

    expect(summary.rewritten).toBe(9);
    expect(summary.failed).toEqual([{ kind: 'page', id: 'n4', usage: 'embed', message: 'write failed' }]);
    expect(h.markdown.get('n9')).toBe(`![x](${LOCAL})`);
    expect(h.markdown.get('n4')).toBe(`![x](${URL_})`);
  });

  it('uses an open editor\'s unsaved text, not just the saved text, to find uses', async () => {
    const saved = page({ id: 'p', markdown: 'nothing here yet' });
    const writes: string[] = [];
    const summary = await rewriteRemoteAssetReferences({
      url: URL_,
      reference: LOCAL,
      pages: [saved],
      folders: [],
      currentMarkdown: () => `typed just now ![x](${URL_})`,
      isPageArchived: () => false,
      isFolderArchived: () => false,
      pageWriter: {
        updateMetadata: async () => undefined,
        mutateBody: async (_id, transform) => void writes.push(transform(`typed just now ![x](${URL_})`)),
      },
      folderWriter: { updateMetadata: async () => undefined },
    });

    expect(summary.rewritten).toBe(1);
    expect(writes).toEqual([`typed just now ![x](${LOCAL})`]);
  });
});

describe('Assets catalog after Save to vault', () => {
  const resource: VaultResource = {
    id: 'res-1',
    kind: 'image',
    name: 'remote-1a2b3c4d.jpg',
    path: `${ROOT}/${LOCAL}`,
    parentId: null,
  };

  it('the remote asset disappears, the local one carries every use, and nothing is duplicated', async () => {
    const before = [page({ id: 'A', cover: URL_, markdown: `![a](${URL_})` }), page({ id: 'B', markdown: `![b](${URL_})` })];
    const folders = [folder('C', URL_)];
    const builder = new AssetCatalogBuilder();
    const input = (pages: Page[], flds: Folder[]) => ({ root: ROOT, resources: [resource], pages, folders: flds });

    const beforeCatalog = builder.build(input(before, folders));
    expect(beforeCatalog.filter((a) => a.source === 'remote')).toHaveLength(1);
    expect(beforeCatalog.find((a) => a.id === 'res-1')!.references).toHaveLength(0);

    // Apply the rewrite to fresh page/folder objects, as the Vault would hold them afterwards.
    const after = [page({ id: 'A', cover: LOCAL, markdown: `![a](${LOCAL})` }), page({ id: 'B', markdown: `![b](${LOCAL})` })];
    const afterCatalog = builder.build(input(after, [folder('C', LOCAL)]));

    expect(afterCatalog.filter((a) => a.source === 'remote')).toHaveLength(0);
    expect(afterCatalog.filter((a) => a.source === 'local')).toHaveLength(1);
    const local = afterCatalog.find((a) => a.id === 'res-1')!;
    expect(local.references.map((r) => `${r.usage}:${r.referrer.kind}:${r.referrer.id}`).sort()).toEqual(
      ['cover:folder:C', 'cover:page:A', 'embed:page:A', 'embed:page:B'].sort()
    );
  });
});
