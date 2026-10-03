import { describe, expect, it } from 'vitest';

import type { Folder, Page, VaultResource } from '../../vault/models';
import { AssetCatalogBuilder } from './AssetCatalogBuilder';

const ROOT = '/vault';

const resource = (path: string, kind: VaultResource['kind'] = 'image'): VaultResource => ({
  id: `res:${path}`,
  kind,
  name: path.split('/').pop()!,
  path: `${ROOT}/${path}`,
  parentId: null,
});

function page(
  id: string,
  options: { markdown?: string; embeds?: string[]; cover?: string | null; coverHidden?: boolean } = {}
): Page {
  return {
    id,
    name: `${id}.md`,
    path: `${ROOT}/${id}.md`,
    parentId: null,
    metadata: { cover: options.cover ?? null, coverHidden: options.coverHidden ?? false },
    source: { markdown: options.markdown ?? '' },
    analysis: { embeds: (options.embeds ?? []).map((target) => ({ target })) },
  } as unknown as Page;
}

const folder = (id: string, cover: string | null): Folder =>
  ({ id, name: id, path: `${ROOT}/${id}`, parentId: null, metadata: { cover, coverHidden: false } }) as unknown as Folder;

const build = (input: { resources?: VaultResource[]; pages?: Page[]; folders?: Folder[] }) =>
  new AssetCatalogBuilder().build({ root: ROOT, resources: [], pages: [], folders: [], ...input });

describe('AssetCatalogBuilder', () => {
  it('lists every local resource as a local asset, referenced or not', () => {
    const catalog = build({ resources: [resource('assets/photo.png'), resource('docs/spec.pdf', 'pdf')] });

    expect(catalog.map((asset) => [asset.source, asset.kind, asset.name, asset.mimeType, asset.references])).toEqual([
      ['local', 'image', 'photo.png', 'image/png', []],
      ['local', 'pdf', 'spec.pdf', 'application/pdf', []],
    ]);
  });

  it('resolves a Markdown image to the local asset — and is one asset however many notes use it', () => {
    const hero = resource('assets/hero.jpg');
    const catalog = build({
      resources: [hero],
      pages: [
        page('a', { markdown: '![Hero](assets/hero.jpg)' }),
        page('b', { markdown: 'again ![](assets/hero.jpg) and ![](./assets/hero.jpg)' }),
        page('c', { embeds: ['assets/hero.jpg'] }),
      ],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.source).toBe('local');
    expect(catalog[0]!.references).toEqual([
      { usage: 'embed', referrer: { kind: 'page', id: 'a' } },
      { usage: 'embed', referrer: { kind: 'page', id: 'b' } },
      { usage: 'embed', referrer: { kind: 'page', id: 'c' } },
    ]);
  });

  it('adds a cover as a usage of the same asset, not a second asset', () => {
    const catalog = build({
      resources: [resource('assets/hero.jpg')],
      pages: [page('a', { markdown: '![](assets/hero.jpg)', cover: 'assets/hero.jpg' })],
      folders: [folder('f', 'assets/hero.jpg')],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.references).toEqual([
      { usage: 'embed', referrer: { kind: 'page', id: 'a' } },
      { usage: 'cover', referrer: { kind: 'page', id: 'a' } },
      { usage: 'cover', referrer: { kind: 'folder', id: 'f' } },
    ]);
  });

  it('lists a remote image once per URL, however many notes reference it, with the URL as its source', () => {
    const url = 'https://example.com/img/mountain.jpg?w=800';
    const catalog = build({
      pages: [page('a', { markdown: `![Mountain](${url})` }), page('b', { markdown: `![](${url})` })],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      id: `remote:${url}`,
      source: 'remote',
      kind: 'image',
      name: 'mountain.jpg',
      mimeType: 'image/jpeg',
      url,
    });
    expect(catalog[0]!.references.map((reference) => reference.referrer.id)).toEqual(['a', 'b']);
  });

  it('a remote cover is a remote asset with a cover usage; a remote URL that is also embedded is the same asset', () => {
    const url = 'https://example.com/cover.png';
    const catalog = build({
      pages: [page('a', { cover: url }), page('b', { markdown: `![](${url})` })],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.references.map((reference) => reference.usage)).toEqual(['cover', 'embed']);
  });

  it('names an extensionless remote URL by its host and leaves the MIME type unknown', () => {
    const [asset] = build({ pages: [page('a', { markdown: '![](https://images.example.com/)' })] });

    expect(asset).toMatchObject({ name: 'images.example.com', source: 'remote' });
    expect(asset!.mimeType).toBeUndefined();
  });

  it('ignores a hidden cover, a note embed, an unresolved local reference and an image inside code', () => {
    const catalog = build({
      resources: [resource('assets/a.png')],
      pages: [
        page('a', {
          markdown: '![](missing.png)\n\n```\n![](assets/a.png)\n```',
          embeds: ['Some Note'],
          cover: 'assets/a.png',
          coverHidden: true,
        }),
      ],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.references).toEqual([]);
  });

  it('only lists local assets from the resources it is given (an archived file the caller left out never appears)', () => {
    const catalog = build({
      resources: [],
      pages: [page('a', { markdown: '![](assets/archived.png)' })],
    });

    expect(catalog).toEqual([]);
  });

  it('resolves a percent-encoded local reference', () => {
    const catalog = build({
      resources: [resource('assets/my photo.png')],
      pages: [page('a', { markdown: '![](assets/my%20photo.png)' })],
    });

    expect(catalog[0]!.references).toHaveLength(1);
  });

  it('parses a page\'s Markdown once while the page object is unchanged', () => {
    const builder = new AssetCatalogBuilder();
    const unchanged = page('a', { markdown: '![](https://example.com/x.png)' });
    let reads = 0;
    const counted = {
      ...unchanged,
      source: {
        get markdown() {
          reads += 1;
          return '![](https://example.com/x.png)';
        },
      },
    } as unknown as Page;

    builder.build({ root: ROOT, resources: [], pages: [counted], folders: [] });
    builder.build({ root: ROOT, resources: [], pages: [counted], folders: [] });

    expect(reads).toBe(1);
  });
});
