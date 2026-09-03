import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { createImageResourceResolver } from './resolveImageResource';

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

describe('createImageResourceResolver', () => {
  it('resolves a vault-relative path (a Resource embed\'s own copyUrl) to its VaultResource id', () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'image', 'folder-assets');
    const vault = makeVault([resource]);
    const resolve = createImageResourceResolver(vault);

    expect(resolve('Assets/hero.png')).toEqual({ resourceId: 'r1' });
  });

  it('resolves a root-level path', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createImageResourceResolver(vault);

    expect(resolve('hero.png')).toEqual({ resourceId: 'r1' });
  });

  it('returns undefined for an external URL — the common case for a standard Markdown image', () => {
    const vault = makeVault([]);
    const resolve = createImageResourceResolver(vault);

    expect(resolve('https://example.com/image.png')).toBeUndefined();
  });

  it('returns undefined for a path that matches no resource', () => {
    const vault = makeVault([]);
    const resolve = createImageResourceResolver(vault);

    expect(resolve('Assets/missing.png')).toBeUndefined();
  });

  it('never resolves from a display name/alt text — only ever from the path', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createImageResourceResolver(vault);

    expect(resolve('hero')).toBeUndefined();
    expect(resolve('Hero image')).toBeUndefined();
  });

  it('reflects a rename — a stale path stops resolving once the resource moves to a new one', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createImageResourceResolver(vault);

    expect(resolve('hero.png')).toEqual({ resourceId: 'r1' });

    vault.updateResourcePath('r1', `${ROOT}/hero-final.png`, null);

    expect(resolve('hero.png')).toBeUndefined();
    expect(resolve('hero-final.png')).toEqual({ resourceId: 'r1' });
  });
});
