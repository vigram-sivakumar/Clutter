import { describe, expect, it, vi } from 'vitest';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { importAsset } from '@core/vault/asset/importAsset';
import { importAssetSources, uploadFailureMessage } from './uploadAssets';

describe('uploadFailureMessage', () => {
  it('is null when every picked file was added, or nothing was picked', () => {
    expect(uploadFailureMessage({ total: 3, failed: [] })).toBeNull();
    expect(uploadFailureMessage({ total: 0, failed: [] })).toBeNull();
  });

  it('names the file when the only one failed, on either kind of path', () => {
    expect(uploadFailureMessage({ total: 1, failed: ['/Users/me/photo.png'] })).toBe('Couldn’t add photo.png');
    expect(uploadFailureMessage({ total: 1, failed: ['C:\\Users\\me\\photo.png'] })).toBe('Couldn’t add photo.png');
  });

  it('reports a partial failure as such, and a total one as such', () => {
    expect(uploadFailureMessage({ total: 5, failed: ['/a.png', '/b.png'] })).toBe('Couldn’t add 2 of 5 files');
    expect(uploadFailureMessage({ total: 2, failed: ['/a.png', '/b.png'] })).toBe('Couldn’t add 2 files');
  });
});


describe('shared picker/drop import batch', () => {
  it('imports supported paths sequentially in their original order', async () => {
    const calls: string[] = [];
    const result = await importAssetSources(['/Finder/a.png', '/Finder/b.pdf', '/Finder/c.svg'], async (source) => {
      calls.push(source as string);
      return `Assets/${(source as string).split('/').pop()}`;
    });
    expect(calls).toEqual(['/Finder/a.png', '/Finder/b.pdf', '/Finder/c.svg']);
    expect(result.total).toBe(3);
    expect(result.failed).toEqual([]);
  });
  it('skips unsupported files and continues after an import failure', async () => {
    const importer = vi.fn(async (source: string | File) => {
      if (source === '/denied.pdf') throw new Error('permission denied');
      return 'Assets/good.png';
    });
    const result = await importAssetSources(['/unsupported.zip', '/denied.pdf', '/good.png'], importer);
    expect(importer.mock.calls.map(([source]) => source)).toEqual(['/denied.pdf', '/good.png']);
    expect(result.total - result.failed.length).toBe(1);
    expect(result.failed).toEqual(['/unsupported.zip', '/denied.pdf']);
    expect(uploadFailureMessage(result)).toBe('Couldn’t add 2 of 3 files');
  });
});


it('uses the existing collision-safe importer for repeated filenames in one Finder drop', async () => {
  const fileSystem = new InMemoryVaultFileSystem();
  fileSystem.seedFile('/Finder/one/photo.png', 'one');
  fileSystem.seedFile('/Finder/two/photo.png', 'two');
  fileSystem.seedFile('/vault/Assets/photo.png', 'original');
  const references: string[] = [];
  const result = await importAssetSources(['/Finder/one/photo.png', '/Finder/two/photo.png'], async (path) => { references.push(await importAsset(fileSystem, '/vault', path as string)); });
  expect(result.failed).toEqual([]);
  expect(references).toEqual(['Assets/photo 2.png', 'Assets/photo 3.png']);
  expect(fileSystem.getFileSync('/vault/Assets/photo.png')).toBe('original');
  expect(fileSystem.getFileSync('/vault/Assets/photo 2.png')).toBe('one');
  expect(fileSystem.getFileSync('/vault/Assets/photo 3.png')).toBe('two');
});
