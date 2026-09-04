import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { createEmbedPdfResolver } from './resolveEmbedPdf';

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
  kind: VaultResource['kind'] = 'pdf',
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

describe('createEmbedPdfResolver — pdf resources', () => {
  it('resolves a root-level pdf resource, calling resolveResourceUrl with its absolute path', () => {
    const resource = makeResource('r1', `${ROOT}/document.pdf`);
    const vault = makeVault([resource]);
    const resolveResourceUrl = vi.fn(() => 'app://vault/document.pdf');
    const resolve = createEmbedPdfResolver(vault, resolveResourceUrl);

    const result = resolve('document.pdf', null);

    expect(resolveResourceUrl).toHaveBeenCalledWith(`${ROOT}/document.pdf`);
    expect(result).toEqual({
      status: 'pdf',
      url: 'app://vault/document.pdf',
      title: 'document',
      path: 'document.pdf',
      resourceId: 'r1',
    });
  });

  it('resolves a nested pdf resource', () => {
    const resource = makeResource('r1', `${ROOT}/Documents/Leadership workshop.pdf`, 'pdf', 'folder-a');
    const vault = makeVault([resource]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://vault/Documents/Leadership%20workshop.pdf');

    const result = resolve('Documents/Leadership workshop.pdf', null);

    expect(result).toEqual({
      status: 'pdf',
      url: 'app://vault/Documents/Leadership%20workshop.pdf',
      title: 'Leadership workshop',
      path: 'Documents/Leadership workshop.pdf',
      resourceId: 'r1',
    });
  });

  it('uses the local alias as the title when present, falling back to the resource name otherwise', () => {
    const resource = makeResource('r1', `${ROOT}/document.pdf`);
    const vault = makeVault([resource]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://vault/document.pdf');

    expect(resolve('document.pdf', 'My Report')).toMatchObject({ title: 'My Report' });
    expect(resolve('document.pdf', null)).toMatchObject({ title: 'document' });
  });

  it('path is always the vault-relative target as embedded, never the resolved app:// URL', () => {
    const resource = makeResource('r1', `${ROOT}/Assets/document.pdf`, 'pdf', 'folder-assets');
    const vault = makeVault([resource]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://some/absolute/resolved/path.pdf');

    const result = resolve('Assets/document.pdf', null);

    expect(result).toMatchObject({ path: 'Assets/document.pdf' });
    expect(result).not.toMatchObject({ path: 'app://some/absolute/resolved/path.pdf' });
  });
});

describe('createEmbedPdfResolver — non-pdf resources', () => {
  it('reports non-pdf for a resolved image resource, without calling resolveResourceUrl', () => {
    const resource = makeResource('r1', `${ROOT}/hero.png`, 'image');
    const vault = makeVault([resource]);
    const resolveResourceUrl = vi.fn();
    const resolve = createEmbedPdfResolver(vault, resolveResourceUrl);

    const result = resolve('hero.png', null);

    expect(result).toEqual({ status: 'non-pdf' });
    expect(resolveResourceUrl).not.toHaveBeenCalled();
  });
});

describe('createEmbedPdfResolver — unresolved', () => {
  it('reports unresolved for a target that never existed', () => {
    const vault = makeVault([]);
    const resolve = createEmbedPdfResolver(vault, () => '');

    expect(resolve('missing.pdf', null)).toEqual({ status: 'unresolved', title: 'missing' });
  });

  it('uses the local alias as the unresolved title when present', () => {
    const vault = makeVault([]);
    const resolve = createEmbedPdfResolver(vault, () => '');

    expect(resolve('missing.pdf', 'Caption')).toEqual({ status: 'unresolved', title: 'Caption' });
  });

  it('a duplicate filename in a different, unqualified folder does not arbitrarily resolve — same rule resolveResourceEmbed already establishes', () => {
    const a = makeResource('r1', `${ROOT}/Projects/A/document.pdf`, 'pdf', 'folder-a');
    const b = makeResource('r2', `${ROOT}/Projects/B/document.pdf`, 'pdf', 'folder-b');
    const vault = makeVault([a, b]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://resolved.pdf');

    expect(resolve('document.pdf', null)).toEqual({ status: 'unresolved', title: 'document' });
  });
});

describe('createEmbedPdfResolver — lifecycle (rename/move/delete/restore)', () => {
  it('rename: an embed pointing at the old path becomes unresolved once the resource is renamed in Vault', () => {
    const resource = makeResource('r1', `${ROOT}/document.pdf`);
    const vault = makeVault([resource]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://vault/document.pdf');

    expect(resolve('document.pdf', null).status).toBe('pdf');

    vault.updateResourcePath('r1', `${ROOT}/document-final.pdf`, null);

    expect(resolve('document.pdf', null)).toEqual({ status: 'unresolved', title: 'document' });
  });

  it('move: an embed pointing at the old path becomes unresolved once the resource moves to a different folder', () => {
    const resource = makeResource('r1', `${ROOT}/document.pdf`);
    const vault = makeVault([resource]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://vault/document.pdf');

    vault.updateResourcePath('r1', `${ROOT}/Projects/document.pdf`, 'folder-projects');

    expect(resolve('document.pdf', null).status).toBe('unresolved');
  });

  it('delete: an embed pointing at a deleted resource becomes unresolved', () => {
    const resource = makeResource('r1', `${ROOT}/document.pdf`);
    const vault = makeVault([resource]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://vault/document.pdf');

    vault.removeResource('r1');

    expect(resolve('document.pdf', null).status).toBe('unresolved');
  });

  it('restore: an embed resolves again once a resource is (re)added at its exact original path', () => {
    const vault = makeVault([]);
    const resolve = createEmbedPdfResolver(vault, () => 'app://vault/document.pdf');

    expect(resolve('document.pdf', null).status).toBe('unresolved');

    vault.addResource(makeResource('r1', `${ROOT}/document.pdf`));

    expect(resolve('document.pdf', null).status).toBe('pdf');
  });
});
