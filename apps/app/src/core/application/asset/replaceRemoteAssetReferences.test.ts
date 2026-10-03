import { describe, expect, it, vi } from 'vitest';

import type { Asset } from '../../vault/models';
import { replaceRemoteAssetReferences } from './replaceRemoteAssetReferences';

const url = 'https://example.com/a.png';

function remoteAsset(references: Asset['references']): Asset {
  return { id: `remote:${url}`, kind: 'image', name: 'a.png', source: 'remote', url, references };
}

function writers() {
  return {
    pages: { updateMetadata: vi.fn().mockResolvedValue(undefined), mutateBody: vi.fn().mockResolvedValue(undefined) },
    folders: { updateMetadata: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('replaceRemoteAssetReferences', () => {
  it('rewrites page covers, folder covers and page embeds', async () => {
    const { pages, folders } = writers();
    const asset = remoteAsset([
      { usage: 'cover', referrer: { kind: 'page', id: 'p1' } },
      { usage: 'embed', referrer: { kind: 'page', id: 'p1' } },
      { usage: 'cover', referrer: { kind: 'folder', id: 'f1' } },
    ]);

    await replaceRemoteAssetReferences(asset, 'Assets/a.png', pages, folders);

    expect(pages.updateMetadata).toHaveBeenCalledWith('p1', { cover: 'Assets/a.png' });
    expect(folders.updateMetadata).toHaveBeenCalledWith('f1', { cover: 'Assets/a.png' });
    const transform = pages.mutateBody.mock.calls[0]![1] as (markdown: string) => string;
    expect(transform(`![x](${url})`)).toBe('![x](Assets/a.png)');
  });

  it('keeps going after a failure and reports it at the end', async () => {
    const { pages, folders } = writers();
    pages.mutateBody.mockRejectedValueOnce(new Error('Cannot edit archived page'));
    const asset = remoteAsset([
      { usage: 'embed', referrer: { kind: 'page', id: 'p1' } },
      { usage: 'cover', referrer: { kind: 'folder', id: 'f1' } },
    ]);

    await expect(replaceRemoteAssetReferences(asset, 'Assets/a.png', pages, folders)).rejects.toThrow(
      /1 use\(s\).*archived/
    );
    expect(folders.updateMetadata).toHaveBeenCalledWith('f1', { cover: 'Assets/a.png' });
  });

  it('does nothing for a local asset', async () => {
    const { pages, folders } = writers();
    const local = { ...remoteAsset([]), source: 'local' } as unknown as Asset;

    await replaceRemoteAssetReferences(local, 'Assets/a.png', pages, folders);

    expect(pages.updateMetadata).not.toHaveBeenCalled();
  });
});
