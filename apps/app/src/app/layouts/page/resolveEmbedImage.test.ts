import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { createEmbedImageResolver } from './resolveEmbedImage';

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

describe('createEmbedImageResolver — image resources', () => {
  it('resolves a root-level image resource, calling resolveResourceImageUrl with its absolute path', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolveResourceImageUrl = vi.fn(() => 'app://vault/hero.png');
    const resolve = createEmbedImageResolver(vault, resolveResourceImageUrl);

    const result = resolve('hero.png', null);

    expect(resolveResourceImageUrl).toHaveBeenCalledWith(`${ROOT}/hero.png`);
    expect(result).toEqual({
      status: 'image',
      url: 'app://vault/hero.png',
      copyUrl: 'hero.png',
      alt: 'hero',
    });
  });

  it('resolves a nested image resource', () => {
    const resource = makeResource('r1', `${ROOT}/Projects/A/hero.png`, 'image', 'folder-a');
    const vault = makeVault([resource]);
    const resolve = createEmbedImageResolver(vault, () => 'app://vault/Projects/A/hero.png');

    const result = resolve('Projects/A/hero.png', null);

    expect(result).toEqual({
      status: 'image',
      url: 'app://vault/Projects/A/hero.png',
      copyUrl: 'Projects/A/hero.png',
      alt: 'hero',
    });
  });

  it('uses the local alias as alt text when present, falling back to the resource name otherwise', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createEmbedImageResolver(vault, () => 'app://vault/hero.png');

    expect(resolve('hero.png', 'My Caption')).toMatchObject({ alt: 'My Caption' });
    expect(resolve('hero.png', null)).toMatchObject({ alt: 'hero' });
  });

  it('copyUrl is always the vault-relative path as embedded, never the resolved app:// URL', () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'image', 'folder-assets');
    const vault = makeVault([resource]);
    const resolve = createEmbedImageResolver(vault, () => 'app://some/absolute/resolved/path.png');

    const result = resolve('Assets/hero.png', null);

    expect(result).toMatchObject({ copyUrl: 'Assets/hero.png' });
    expect(result).not.toMatchObject({ copyUrl: 'app://some/absolute/resolved/path.png' });
  });
});

describe('createEmbedImageResolver — non-image resources', () => {
  it('reports non-image for a resolved pdf resource, without calling resolveResourceImageUrl', () => {
    const resource = makeResource('r1', `${ROOT}/spec.pdf`, 'pdf');
    const vault = makeVault([resource]);
    const resolveResourceImageUrl = vi.fn();
    const resolve = createEmbedImageResolver(vault, resolveResourceImageUrl);

    const result = resolve('spec.pdf', null);

    expect(result).toEqual({ status: 'non-image' });
    expect(resolveResourceImageUrl).not.toHaveBeenCalled();
  });
});

describe('createEmbedImageResolver — unresolved', () => {
  it('reports unresolved for a target that never existed', () => {
    const vault = makeVault([]);
    const resolve = createEmbedImageResolver(vault, () => '');

    expect(resolve('missing.png', null)).toEqual({ status: 'unresolved', alt: 'missing' });
  });

  it('uses the local alias as the unresolved alt text when present', () => {
    const vault = makeVault([]);
    const resolve = createEmbedImageResolver(vault, () => '');

    expect(resolve('missing.png', 'Caption')).toEqual({ status: 'unresolved', alt: 'Caption' });
  });

  it('a duplicate filename in a different, unqualified folder does not arbitrarily resolve — same rule resolveResourceEmbed already establishes', () => {
    const a = makeResource('r1', `${ROOT}/Projects/A/hero.png`, 'image', 'folder-a');
    const b = makeResource('r2', `${ROOT}/Projects/B/hero.png`, 'image', 'folder-b');
    const vault = makeVault([a, b]);
    const resolve = createEmbedImageResolver(vault, () => 'app://resolved.png');

    expect(resolve('hero.png', null)).toEqual({ status: 'unresolved', alt: 'hero' });
  });

  it(
    'regression: an unresolved target under a nested folder shows only the extension-free bare filename as its alt text, ' +
      "never the folder-qualified path — mirrors resolveWikiLink.ts's identical rule for an unresolved WikiLink",
    () => {
      const vault = makeVault([]);
      const resolve = createEmbedImageResolver(vault, () => '');

      expect(resolve('Projects/Images/missing.png', null)).toEqual({
        status: 'unresolved',
        alt: 'missing',
      });
    }
  );
});

describe('createEmbedImageResolver — lifecycle (rename/move/delete/restore)', () => {
  it('rename: an embed pointing at the old path becomes unresolved once the resource is renamed in Vault', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createEmbedImageResolver(vault, () => 'app://vault/hero.png');

    expect(resolve('hero.png', null).status).toBe('image');

    vault.updateResourcePath('r1', `${ROOT}/hero-final.png`, null);

    expect(resolve('hero.png', null)).toEqual({ status: 'unresolved', alt: 'hero' });
  });

  it('move: an embed pointing at the old path becomes unresolved once the resource moves to a different folder', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createEmbedImageResolver(vault, () => 'app://vault/hero.png');

    vault.updateResourcePath('r1', `${ROOT}/Projects/hero.png`, 'folder-projects');

    expect(resolve('hero.png', null).status).toBe('unresolved');
  });

  it('delete: an embed pointing at a deleted resource becomes unresolved', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`);
    const vault = makeVault([resource]);
    const resolve = createEmbedImageResolver(vault, () => 'app://vault/hero.png');

    vault.removeResource('r1');

    expect(resolve('hero.png', null).status).toBe('unresolved');
  });

  it('restore: an embed resolves again once a resource is (re)added at its exact original path', () => {
    const vault = makeVault([]);
    const resolve = createEmbedImageResolver(vault, () => 'app://vault/hero.png');

    expect(resolve('hero.png', null).status).toBe('unresolved');

    vault.addResource(makeResource('r1', `${ROOT}/hero.png`));

    expect(resolve('hero.png', null).status).toBe('image');
  });
});
