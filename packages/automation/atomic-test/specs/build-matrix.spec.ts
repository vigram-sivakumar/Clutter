import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from '../isolation';
import { HOME, openFirstNote, registerSpace, temporaryFiles, typeAtEnd } from './helpers';

// One cell of the build matrix (frontend atomic switch x Rust atomic feature). The runner sets CLUTTER_MATRIX_EXPECT:
//   old           the plugin writer saves in place (same inode); atomic commands are absent or unused
//   atomic        saves replace the file whole (new inode)
//   misconfigured the frontend asks for atomic saves but the native writer is absent: opening the Space fails loudly
//                 and nothing is written, never a silent fallback to the plugin writer
const EXPECT = process.env.CLUTTER_MATRIX_EXPECT as 'old' | 'atomic' | 'misconfigured';
const NATIVE = process.env.CLUTTER_MATRIX_NATIVE as 'present' | 'absent'; // whether the commands exist in this binary
const ROOT = `${HOME}/Documents/MatrixVault`;
const NOTE = `${ROOT}/Welcome.md`;
const ORIGINAL = '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nOriginal body\n';

describe(`build matrix cell: expect ${EXPECT}, native commands ${NATIVE}`, () => {
  after(async () => {
    await browser.execute(() => localStorage.removeItem('clutter.spaces.v1'));
  });

  it('behaves as that cell must', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    fs.mkdirSync(`${ROOT}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, ORIGINAL);
    const before = fs.statSync(NOTE);
    await registerSpace(ROOT);

    // Is the native writer there? Asked directly, from the main window, with a request that can touch nothing.
    const probe = (await browser.executeAsync((root: string, done: (r: unknown) => void) => {
      (window as any).__TAURI_INTERNALS__
        .invoke('atomic_inspect_write', { request: { vaultRoot: root, path: `${root}/.probe`, attempted: '', previous: null, tempPaths: [] } })
        .then(() => done('answered'), (e: unknown) => done(typeof e === 'string' ? e : JSON.stringify(e)));
    }, ROOT)) as string;
    const nativeAnswered = !/not found/i.test(probe);
    expect(nativeAnswered).toBe(NATIVE === 'present');

    if (EXPECT === 'misconfigured') {
      await browser.pause(8000);
      const text = (await browser.execute(() => document.body.innerText)) as string;
      console.log('MATRIX-MISCONFIGURED ' + JSON.stringify(text.slice(0, 400)));
      expect(text).toMatch(/Atomic saves are switched on|native writer is not available/i);
      expect(fs.readFileSync(NOTE, 'utf8')).toBe(ORIGINAL);
      expect(fs.statSync(NOTE).ino).toBe(before.ino);
      expect(await $$('.cm-content').length).toBe(0); // no editor was opened on a Space that cannot be saved safely
      return;
    }

    await openFirstNote(testIds.sidebar.tab);
    await typeAtEnd(' matrix edit');
    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('matrix edit'), { timeout: 20000, timeoutMsg: 'the edit never reached the file' });
    const after = fs.statSync(NOTE);
    console.log('MATRIX-RESULT ' + JSON.stringify({ expect: EXPECT, native: NATIVE, inodeChanged: before.ino !== after.ino, birthKept: before.birthtimeMs === after.birthtimeMs }));

    expect(fs.readFileSync(NOTE, 'utf8')).toContain('Original body');
    expect(fs.readFileSync(NOTE, 'utf8')).toContain('id: note-welcome');
    expect(temporaryFiles(ROOT)).toEqual([]);
    if (EXPECT === 'atomic') expect(after.ino).not.toBe(before.ino); // replaced whole
    else expect(after.ino).toBe(before.ino); // the plugin writes in place
  });
});
