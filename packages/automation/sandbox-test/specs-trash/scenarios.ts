/**
 * The Trash scenarios (ADR-072), run once per Space kind against a relaunched sandboxed app, so every Space in
 * this suite is a Space the app restored from a saved bookmark, not one it just created.
 *
 *   1. an archived note, deleted permanently through the UI: gone from the Space, present in the real Trash
 *   2. an archived folder tree (nested folders, notes, untracked files): the whole tree is one Trash item
 *   3. failure: an unwritable parent directory reports an error and changes nothing; restoring access then succeeds
 *   4. (in every test) where the Trash item landed is recorded, by exact path, never by listing the Trash
 */
import fs from 'node:fs';
import path from 'node:path';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import {
  type SpaceKind,
  SPACE_PATHS,
  bodyText,
  call,
  cleanTrash,
  clickByText,
  expectInTrash,
  expectNotInTrash,
  loadFixture,
  manifestOf,
  openArchivedItem,
  openSidebarRow,
  pickPageMenuAction,
  readRegistry,
  waitClickByText,
} from './common';

const ARCHIVE = 'Move to archive';
const DELETE = 'Delete permanently';

/** The confirmation dialog's primary button. */
const confirmDialog = async (label: string) => {
  await waitClickByText('button', label);
};

/**
 * The trashed tree holds every file it held before. Untracked files are byte-identical; Clutter's own notes keep their
 * id and body (archiving stamps their front matter, so they are not byte-identical); the only files that may be
 * added are folder metadata (`.folder.md`) written by the archive step.
 */
function expectSameTree(trashed: string, expected: Record<string, string>): void {
  const actual = manifestOf(trashed);
  for (const [rel, before] of Object.entries(expected)) {
    expect(Object.keys(actual)).toContain(rel);
    if (!rel.endsWith('.md')) expect(actual[rel]).toBe(before);
    else for (const line of before.split('\n').filter((l) => l !== '---' && l !== '')) expect(actual[rel]).toContain(line.replace(/^id: /, ''));
  }
  for (const rel of Object.keys(actual)) if (!(rel in expected)) expect(path.basename(rel)).toBe('.folder.md');
}

const fail = (what: string) => `Couldn’t delete this ${what}`;

export function defineTrashScenarios(kind: SpaceKind): void {
  const space = SPACE_PATHS[kind];
  const fx = () => loadFixture(kind);
  const noteRow = (id: string) => testIds.sidebar.noteItem(id);

  describe(`Trash: ${kind} Space restored from its saved access`, () => {
    it('opens the Space from the saved access with no prompt', async () => {
      await browser.pause(3000);
      const registry = await readRegistry();
      expect(registry?.activePath).toBe(space);
      // The seeded note shows in the sidebar: the Space really opened through the restored bookmark.
      await openSidebarRow(testIds.sidebar.tab, noteRow(fx().noteA.id));
      await (await $('.cm-content')).waitForExist({ timeout: 15000 });
      if (kind === 'docs') expect((await call('documents_access')).ok).toBe('granted');
    });

    it('moves an archived note to the Trash with its contents intact', async () => {
      const { noteA } = fx();
      expect(fs.existsSync(`${space}/${noteA.file}`)).toBe(true);

      await openSidebarRow(testIds.sidebar.tab, noteRow(noteA.id));
      await (await $('.cm-content')).waitForExist({ timeout: 15000 });
      await pickPageMenuAction(ARCHIVE);
      await browser.waitUntil(() => fs.existsSync(`${space}/Archive/${noteA.file}`), { timeout: 20000, timeoutMsg: 'the note was not archived' });
      expect(fs.existsSync(`${space}/${noteA.file}`)).toBe(false);

      await openArchivedItem(noteA.file.replace(/\.md$/, ''));
      await pickPageMenuAction(DELETE);
      await confirmDialog('Delete');
      await browser.waitUntil(() => !fs.existsSync(`${space}/Archive/${noteA.file}`), { timeout: 20000, timeoutMsg: 'the note is still in the Space' });
      expect(fs.existsSync(`${space}/${noteA.file}`)).toBe(false);

      const trashed = await expectInTrash(noteA.file, `${kind}:note`);
      expect(fs.readFileSync(trashed.path, 'utf8')).toContain(noteA.body);
      expect(fs.readFileSync(trashed.path, 'utf8')).toContain(noteA.id);
      cleanTrash(trashed.path);
    });

    it('moves an archived folder tree to the Trash as one item and drops its Vault entries', async () => {
      const { folder } = fx();
      const source = `${space}/${folder.name}`;
      const expected = manifestOf(source);
      expect(Object.keys(expected).sort()).toEqual(Object.keys(folder.files).sort());

      await browser.waitUntil(() => clickByText('.folder__title', folder.name), { timeout: 20000, timeoutMsg: `no sidebar folder ${folder.name}` });
      await pickPageMenuAction(ARCHIVE);
      // Archiving a folder asks first.
      await confirmDialog(ARCHIVE);
      await browser.waitUntil(() => fs.existsSync(`${space}/Archive/${folder.name}`), { timeout: 20000, timeoutMsg: 'the folder was not archived' });
      expect(fs.existsSync(source)).toBe(false);

      await openArchivedItem(folder.name);
      await pickPageMenuAction(DELETE);
      await confirmDialog('Delete');
      await browser.waitUntil(() => !fs.existsSync(`${space}/Archive/${folder.name}`), { timeout: 30000, timeoutMsg: 'the folder is still in the Space' });

      // One Trash item, named after the folder, holding the whole tree, untracked files included.
      const trashed = await expectInTrash(folder.name, `${kind}:folder`);
      expect(fs.statSync(trashed.path).isDirectory()).toBe(true);
      expectSameTree(trashed.path, expected);
      // Nothing inside it was moved on its own (inner names are unique to this run).
      for (const rel of Object.keys(folder.files)) {
        const leaf = path.basename(rel);
        if (leaf !== '.folder.md') expectNotInTrash(leaf);
      }

      // The Vault entries are gone: no sidebar row for the folder or its notes, and the folder is not in the Archive.
      const rows = (await browser.execute(() => [...document.querySelectorAll('[data-testid^="sidebar.noteItem."]')].map((e) => e.getAttribute('data-testid')))) as string[];
      for (const id of folder.noteIds) expect(rows).not.toContain(noteRow(id));
      expect(await clickByText('.folder__title', folder.name)).toBe(false);
      expect(await bodyText()).not.toContain(folder.name);
      cleanTrash(trashed.path);
    });

    it('reports an error and changes nothing when the parent directory is unwritable, then succeeds once it is writable', async () => {
      const { noteC } = fx();
      const archiveDir = `${space}/Archive`;
      await openSidebarRow(testIds.sidebar.tab, noteRow(noteC.id));
      await (await $('.cm-content')).waitForExist({ timeout: 15000 });
      await pickPageMenuAction(ARCHIVE);
      const archived = `${archiveDir}/${noteC.file}`;
      await browser.waitUntil(() => fs.existsSync(archived), { timeout: 20000, timeoutMsg: 'the note was not archived' });

      const before = fs.readFileSync(archived, 'utf8');
      fs.chmodSync(archiveDir, 0o555);
      const title = noteC.file.replace(/\.md$/, '');
      try {
        await openArchivedItem(title);
        await pickPageMenuAction(DELETE);
        await confirmDialog('Delete');
        await browser.waitUntil(async () => (await bodyText()).includes(fail('note')), { timeout: 20000, timeoutMsg: 'no error was reported' });

        // Nothing moved, nothing trashed, and the note is still an archived Vault entry (its page still offers Delete).
        expect(fs.readFileSync(archived, 'utf8')).toBe(before);
        expectNotInTrash(noteC.file);
        await openArchivedItem(title);
      } finally {
        fs.chmodSync(archiveDir, 0o755);
      }

      await pickPageMenuAction(DELETE);
      await confirmDialog('Delete');
      await browser.waitUntil(() => !fs.existsSync(archived), { timeout: 20000, timeoutMsg: 'the note is still in the Space after access was restored' });
      const trashed = await expectInTrash(noteC.file, `${kind}:failure-retry`);
      expect(fs.readFileSync(trashed.path, 'utf8')).toBe(before);
      cleanTrash(trashed.path);
    });
  });
}
