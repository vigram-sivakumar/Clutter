import fs from 'node:fs';
import { REAL_DOCS, call } from './common';

// Disposable Spaces only: a folder created in the real Documents by the app's own native command, renamed by the same command
// the settings dialog calls. Nothing else in Documents is named.
const A = `${REAL_DOCS}/ClutterSbxRenameA`;
const A2 = `${REAL_DOCS}/ClutterSbxRenameA2`;
const A3 = `${REAL_DOCS}/ClutterSbxRenameA3`;
const TAKEN = `${REAL_DOCS}/ClutterSbxRenameTaken`;

describe('rename a Space inside Documents, in the packaged sandboxed app', () => {
  before(() => {
    for (const p of [A, A2, A3, TAKEN]) if (fs.existsSync(p)) throw new Error(`refusing to run: ${p} already exists`);
  });

  it('has Documents access and creates two disposable Spaces', async () => {
    await browser.pause(3000);
    await call('restore_space_access');
    expect((await call('documents_access')).ok).toBe('granted');
    expect((await call('create_space_folder', { name: 'ClutterSbxRenameA' })).ok).toBe(A);
    expect((await call('create_space_folder', { name: 'ClutterSbxRenameTaken' })).ok).toBe(TAKEN);
    fs.mkdirSync(`${A}/.clutter`);
    fs.writeFileSync(`${A}/note.md`, 'KEEP');
  });

  it('renames it in place', async () => {
    const result = await call('rename_space_folder', { path: A, newName: 'ClutterSbxRenameA2' });
    console.log('RENAME result', JSON.stringify(result));
    expect(result.ok).toBe(A2);
    expect(fs.existsSync(A)).toBe(false);
    expect(fs.readFileSync(`${A2}/note.md`, 'utf8')).toBe('KEEP');
  });

  it('the renamed Space keeps its grant: a second rename (which the command authorizes by scope) also works', async () => {
    const result = await call('rename_space_folder', { path: A2, newName: 'ClutterSbxRenameA3' });
    console.log('RENAME second', JSON.stringify(result));
    expect(result.ok).toBe(A3);
    expect(fs.readFileSync(`${A3}/note.md`, 'utf8')).toBe('KEEP');
    expect((await call('rename_space_folder', { path: A3, newName: 'ClutterSbxRenameA2' })).ok).toBe(A2);
  });

  it('refuses a taken name and leaves both folders as they were', async () => {
    const result = await call('rename_space_folder', { path: A2, newName: 'ClutterSbxRenameTaken' });
    console.log('RENAME taken', JSON.stringify(result));
    expect(result.err).toBeDefined();
    expect(fs.readFileSync(`${A2}/note.md`, 'utf8')).toBe('KEEP');
    expect(fs.readdirSync(TAKEN).sort()).toEqual(['.clutter'].filter((n) => fs.readdirSync(TAKEN).includes(n)));
  });

  after(() => {
    // Only the three folders this spec created.
    for (const p of [A, A2, A3, TAKEN]) {
      if (p.startsWith(`${REAL_DOCS}/ClutterSbxRename`)) fs.rmSync(p, { recursive: true, force: true });
    }
  });
});
