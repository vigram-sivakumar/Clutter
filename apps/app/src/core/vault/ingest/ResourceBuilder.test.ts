import { describe, expect, it } from 'vitest';
import { ResourceBuilder } from './ResourceBuilder';
import type { ScannedResourceFile } from './VaultScanResult';

function makeScannedResourceFile(
  overrides: Partial<ScannedResourceFile> = {}
): ScannedResourceFile {
  return {
    path: '/vault/Cover.png',
    directoryPath: '/vault',
    kind: 'image',
    ...overrides,
  };
}

describe('ResourceBuilder', () => {
  const builder = new ResourceBuilder();

  it('builds an image resource with the scanned kind preserved', () => {
    const file = makeScannedResourceFile({ path: '/vault/Cover.png', kind: 'image' });

    const resource = builder.build({ parentId: null, file });

    expect(resource.kind).toBe('image');
  });

  it('builds a pdf resource with the scanned kind preserved', () => {
    const file = makeScannedResourceFile({ path: '/vault/Report.pdf', kind: 'pdf' });

    const resource = builder.build({ parentId: null, file });

    expect(resource.kind).toBe('pdf');
  });

  it('derives identity from the file path, since resources have no frontmatter', () => {
    const file = makeScannedResourceFile({ path: '/vault/Assets/Cover.png' });

    const resource = builder.build({ parentId: null, file });

    expect(resource.id).toBe('/vault/Assets/Cover.png');
  });

  it('derives the resource name from the path', () => {
    const file = makeScannedResourceFile({ path: '/vault/Assets/My Cover.png' });

    const resource = builder.build({ parentId: null, file });

    expect(resource.name).toBe('My Cover.png');
  });

  it('preserves the exact scanned path', () => {
    const file = makeScannedResourceFile({ path: '/vault/Assets/Report.pdf' });

    const resource = builder.build({ parentId: null, file });

    expect(resource.path).toBe('/vault/Assets/Report.pdf');
  });

  it('assigns the given parentId verbatim', () => {
    const file = makeScannedResourceFile();

    const resource = builder.build({ parentId: 'parent-folder', file });

    expect(resource.parentId).toBe('parent-folder');
  });
});
