import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { createImageSrcResolver } from './resolveImageSrc';

const ROOT = '/vault';

function makeVault(resources: VaultResource[]): Vault {
  return new Vault(
    ROOT,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
}

function makeResource(
  id: string,
  path: string,
  kind: VaultResource['kind'] = 'image',
  parentId: string | null = null
): VaultResource {
  return {
    id,
    kind,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
  };
}

describe('createImageSrcResolver — local Vault image resources', () => {
  it('resolves a root-level local path, calling resolveResourceImageUrl with its absolute path', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolveResourceImageUrl = vi.fn(() => 'app://vault/hero.png');
    const resolve = createImageSrcResolver(vault, resolveResourceImageUrl);

    const result = resolve('hero.png');

    expect(resolveResourceImageUrl).toHaveBeenCalledWith(`${ROOT}/hero.png`);
    expect(result).toEqual({
      status: 'resolved',
      url: 'app://vault/hero.png',
      copyUrl: 'hero.png',
    });
  });

  it('resolves a nested local path, e.g. ![Alt name](Assets/image.jpg)', () => {
    const resource = makeResource('r1', `${ROOT}/Assets/image.jpg`, 'image', 'folder-assets');
    const vault = makeVault([resource]);
    const resolve = createImageSrcResolver(vault, () => 'app://vault/Assets/image.jpg');

    const result = resolve('Assets/image.jpg');

    expect(result).toEqual({
      status: 'resolved',
      url: 'app://vault/Assets/image.jpg',
      copyUrl: 'Assets/image.jpg',
    });
  });

  it('copyUrl is always the vault-relative path exactly as written in the Markdown, never the resolved app:// URL', () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'image', 'folder-assets');
    const vault = makeVault([resource]);
    const resolve = createImageSrcResolver(vault, () => 'app://some/absolute/resolved/path.png');

    const result = resolve('Assets/hero.png');

    expect(result).toMatchObject({ copyUrl: 'Assets/hero.png' });
    expect(result).not.toMatchObject({ copyUrl: 'app://some/absolute/resolved/path.png' });
  });
});

describe('createImageSrcResolver — unresolved (external URLs, missing paths, non-image resources)', () => {
  it('reports unresolved for an external https:// URL — never attempts to rewrite it', () => {
    const vault = makeVault([]);
    const resolveResourceImageUrl = vi.fn();
    const resolve = createImageSrcResolver(vault, resolveResourceImageUrl);

    expect(resolve('https://example.com/image.jpg')).toEqual({ status: 'unresolved' });
    expect(resolveResourceImageUrl).not.toHaveBeenCalled();
  });

  it('reports unresolved for an external http:// URL', () => {
    const vault = makeVault([]);
    const resolve = createImageSrcResolver(vault, () => '');

    expect(resolve('http://example.com/image.jpg')).toEqual({ status: 'unresolved' });
  });

  it('reports unresolved for a local path that does not exist in the Vault', () => {
    const vault = makeVault([]);
    const resolve = createImageSrcResolver(vault, () => '');

    expect(resolve('Assets/missing.png')).toEqual({ status: 'unresolved' });
  });

  it('reports unresolved for a local path resolving to a non-image resource, without calling resolveResourceImageUrl', () => {
    const resource = makeResource('r1', `${ROOT}/spec.pdf`, 'pdf');
    const vault = makeVault([resource]);
    const resolveResourceImageUrl = vi.fn();
    const resolve = createImageSrcResolver(vault, resolveResourceImageUrl);

    expect(resolve('spec.pdf')).toEqual({ status: 'unresolved' });
    expect(resolveResourceImageUrl).not.toHaveBeenCalled();
  });

  it('a duplicate filename in a different, unqualified folder does not arbitrarily resolve — same rule resolveResourceEmbed already establishes', () => {
    const a = makeResource('r1', `${ROOT}/Projects/A/hero.png`, 'image', 'folder-a');
    const b = makeResource('r2', `${ROOT}/Projects/B/hero.png`, 'image', 'folder-b');
    const vault = makeVault([a, b]);
    const resolve = createImageSrcResolver(vault, () => 'app://resolved.png');

    expect(resolve('hero.png')).toEqual({ status: 'unresolved' });
  });
});

describe('createImageSrcResolver — lifecycle (rename/move/delete/restore)', () => {
  it('rename: a standard image pointing at the old path becomes unresolved once the resource is renamed in Vault', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createImageSrcResolver(vault, () => 'app://vault/hero.png');

    expect(resolve('hero.png').status).toBe('resolved');

    vault.updateResourcePath('r1', `${ROOT}/hero-final.png`, null);

    expect(resolve('hero.png')).toEqual({ status: 'unresolved' });
  });

  it('restore: a standard image resolves again once a resource is (re)added at its exact original path', () => {
    const vault = makeVault([]);
    const resolve = createImageSrcResolver(vault, () => 'app://vault/hero.png');

    expect(resolve('hero.png').status).toBe('unresolved');

    vault.addResource(makeResource('r1', `${ROOT}/hero.png`));

    expect(resolve('hero.png').status).toBe('resolved');
  });
});
