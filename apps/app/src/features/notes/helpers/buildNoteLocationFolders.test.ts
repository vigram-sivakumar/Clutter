import { describe, expect, it, vi } from 'vitest';

import { buildNoteLocationFolders } from './buildNoteLocationFolders';
import { Application } from '@core/application/Application';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { Vault } from '@core/vault/models/Vault';
import type { Folder } from '@core/vault/models/Folder';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '@core/vault/providers/SelfWriteRegistry';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

const ROOT = '/vault';
const metadata = {
  defaultTemplateId: null,
  icon: null as string | null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};
const folder = (id: string, name: string, parent: Folder | null = null, icon: string | null = null): Folder => ({
  id,
  name,
  path: `${parent?.path ?? ROOT}/${name}`,
  parentId: parent?.id ?? null,
  metadata: { ...metadata, icon },
});

function setup(folders: Folder[]) {
  const vault = new Vault(ROOT, [], folders, [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder(), new Map(), []);
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  return { vault, selector: application.membershipSelector };
}

const summary = (options: ReturnType<typeof buildNoteLocationFolders>) =>
  options.map((option) => (option.parentPath ? `${option.parentPath} / ${option.title}` : option.title));

describe('buildNoteLocationFolders', () => {
  it('lists every ordinary folder, nested ones after their parent, in the sidebar order', () => {
    const zebra = folder('z', 'Zebra');
    const apple = folder('a', 'Apple');
    const inner = folder('i', 'Inner', apple);
    const { selector } = setup([zebra, apple, inner]);

    expect(summary(buildNoteLocationFolders(selector))).toEqual(['Apple', 'Apple / Inner', 'Zebra']);
  });

  it('tells same-named folders apart by their ancestors', () => {
    const work = folder('w', 'Work');
    const home = folder('h', 'Home');
    const { selector } = setup([work, home, folder('w-n', 'Notes', work), folder('h-n', 'Notes', home)]);

    const notes = buildNoteLocationFolders(selector).filter((option) => option.title === 'Notes');

    expect(notes.map((option) => [option.id, option.parentPath])).toEqual([
      ['h-n', 'Home'],
      ['w-n', 'Work'],
    ]);
  });

  it("carries a folder's own emoji", () => {
    const { selector } = setup([folder('a', 'Apple', null, '🍎')]);
    expect(buildNoteLocationFolders(selector)[0]?.emoji).toBe('🍎');
  });

  it('leaves out Inbox, Templates, Daily Notes, Archive, Assets, hidden folders and what is inside them', () => {
    const templates = folder('t', 'Templates');
    const hidden = folder('hid', '.Hidden');
    const assets = folder('as', 'Assets');
    const { selector } = setup([
      folder('ok', 'Projects'),
      folder('inbox', 'Inbox'),
      templates,
      folder('t-in', 'Weekly', templates),
      folder('daily', 'Daily Notes'),
      folder('archive', 'Archive'),
      assets,
      folder('as-in', 'Images', assets),
      hidden,
      folder('hid-in', 'Child', hidden),
    ]);

    expect(summary(buildNoteLocationFolders(selector))).toEqual(['Projects']);
  });

  it('is empty, not an error, for a Space with no folders', () => {
    expect(buildNoteLocationFolders(setup([]).selector)).toEqual([]);
  });

  it('is current when folders are created, renamed, moved and deleted', () => {
    const projects = folder('p', 'Projects');
    const { vault, selector } = setup([projects]);
    expect(summary(buildNoteLocationFolders(selector))).toEqual(['Projects']);

    vault.addFolder(folder('n', 'New'));
    expect(summary(buildNoteLocationFolders(selector))).toEqual(['New', 'Projects']);

    vault.moveFolder('n', `${ROOT}/Projects/New`, 'p');
    expect(summary(buildNoteLocationFolders(selector))).toEqual(['Projects', 'Projects / New']);

    vault.moveFolder('n', `${ROOT}/Renamed`, null);
    expect(summary(buildNoteLocationFolders(selector))).toEqual(['Projects', 'Renamed']);

    vault.removeFolder('n');
    expect(summary(buildNoteLocationFolders(selector))).toEqual(['Projects']);
  });
});
