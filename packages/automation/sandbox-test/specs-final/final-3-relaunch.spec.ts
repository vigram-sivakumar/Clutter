import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { SPACE, bodyText, call, onDisk, openNoteNamed, tempFiles, typeAtEnd } from './common';

// Launch 3: after a quit and relaunch. Nothing is registered by the spec: the app must reopen the Space by itself.
const NOTE = `${SPACE}/Welcome.md`;

describe('F3: relaunch', () => {
  it('has Documents access again with no prompt and reopens the last Space by itself', async () => {
    await browser.pause(4000);
    expect((await call('documents_access')).ok).toBe('granted');
    const registry = JSON.parse(((await browser.execute(() => localStorage.getItem('clutter.spaces.v1'))) as string) ?? '{}');
    expect(registry.activePath).toBe(SPACE);
    await openNoteNamed(testIds.sidebar.tab, 'Welcome');
    expect(((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string)).toContain('EXTERNAL-LINE');
    expect(await bodyText()).not.toContain('can only save safely');
  });

  it('saves again after the relaunch, atomically, with no leftovers', async () => {
    const before = fs.statSync(NOTE).ino;
    await typeAtEnd(' after-relaunch');
    await browser.waitUntil(() => onDisk(NOTE).includes('after-relaunch'), { timeout: 20000 });
    expect(fs.statSync(NOTE).ino).not.toBe(before);
    expect(tempFiles(SPACE)).toEqual([]);
  });

  it('protects the Space\'s folder again in this run, and the old plugin commands are still refused', async () => {
    for (const recursive of [false, true]) {
      expect((await call('delete_path', { path: SPACE, recursive })).err ?? '').toMatch(/is a Space|holds one/);
    }
    expect(fs.existsSync(NOTE)).toBe(true);
    expect((await call('plugin:fs|remove', { path: NOTE, options: {} })).err ?? '').toContain('not allowed');
    expect(fs.existsSync(NOTE)).toBe(true);
  });

  // Found by F2 in the packaged app: Tauri's real `Scope::is_allowed` follows a final symlink, so an entry that is a link
  // to somewhere outside the Space is refused whole (fail closed), where the Rust unit tests' stand-in scope judged it
  // by its own name. These steps pin what the packaged app actually does.
  it('a link that points outside the Space is refused by delete_path (fail closed) and stays; one that points inside is unlinked without touching its target', async () => {
    expect(fs.lstatSync(`${SPACE}/Ops/exit-dir`).isSymbolicLink()).toBe(true); // left by F2, now dangling
    const outward = await call('delete_path', { path: `${SPACE}/Ops/exit-dir` });
    console.log('FINAL outward link delete', JSON.stringify(outward.err ?? outward.ok));
    expect(outward.err ?? '').toContain('forbidden path');
    expect(fs.lstatSync(`${SPACE}/Ops/exit-dir`).isSymbolicLink()).toBe(true);

    fs.symlinkSync(`${SPACE}/Ops/moved.md`, `${SPACE}/Ops/inner-link`);
    const inward = await call('delete_path', { path: `${SPACE}/Ops/inner-link` });
    console.log('FINAL inward link delete', JSON.stringify(inward.err ?? inward.ok));
    expect(inward.err).toBeUndefined();
    expect(fs.existsSync(`${SPACE}/Ops/inner-link`)).toBe(false);
    expect(onDisk(`${SPACE}/Ops/moved.md`)).toBe('SOURCE');
  });
});
