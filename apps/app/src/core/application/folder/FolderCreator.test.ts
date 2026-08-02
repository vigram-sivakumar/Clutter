import { describe, expect, it } from 'vitest';
import { FolderCreator } from './FolderCreator';
import type { IdGenerator } from '../../shared/identity/IdGenerator';

function makeIdGenerator(id: string): IdGenerator {
  return { generate: () => id };
}

describe('FolderCreator', () => {
  it('mints the id from the injected IdGenerator', () => {
    const creator = new FolderCreator(makeIdGenerator('folder-abc'));

    expect(creator.generateId()).toBe('folder-abc');
  });

  it('builds .folder.md content carrying only the persisted id', () => {
    const creator = new FolderCreator(makeIdGenerator('folder-abc'));

    const content = creator.buildContent('folder-abc');

    expect(content).toBe('---\nid: folder-abc\n---\n');
  });

  it('does not touch the filesystem or Vault — pure content generation', () => {
    const creator = new FolderCreator(makeIdGenerator('folder-xyz'));

    const id = creator.generateId();
    const content = creator.buildContent(id);

    expect(id).toBe('folder-xyz');
    expect(content).toContain('id: folder-xyz');
  });
});
