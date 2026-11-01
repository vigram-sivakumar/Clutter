import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { APP_DATA, REAL_DOCS, call, openFirstNote, recoveryContaining, registerSpaces, testAppPids, typeAtEnd } from './common';

// Launch 4, part 1: unsaved typing in a real-Documents Space, a recovery snapshot written by the native command, then
// kill -9 of the test app (by the PIDs of its own bundle path) before the autosave runs.
const NAME = 'ClutterSbxFinalCrashB';
const TYPED = ' typed before the kill';
const SPACE = `${REAL_DOCS}/${NAME}`;
const NOTE = `${SPACE}/Welcome.md`;
const ORIGINAL = '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nBefore the crash\n';

describe('F4a: crash with unsaved work', () => {
  it('leaves the note as it was and the work in a recovery snapshot', async () => {
    if (fs.existsSync(SPACE)) throw new Error(`refusing to run: ${SPACE} already exists`);
    await browser.pause(3000);
    expect((await call('documents_access')).ok).toBe('granted');
    expect((await call('create_space_folder', { name: NAME })).ok).toBe(SPACE);
    fs.mkdirSync(`${SPACE}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, ORIGINAL);
    await registerSpaces([SPACE], SPACE);
    await browser.refresh();
    await browser.pause(3000);
    await openFirstNote(testIds.sidebar.tab);

    await typeAtEnd(TYPED);
    // Not before the snapshot of THIS typing exists (earlier sessions' records are ignored), and not after the autosave.
    const deadline = Date.now() + 15000;
    while (recoveryContaining('typed before the kill').length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    const snapshots = recoveryContaining('typed before the kill');
    const savedYet = fs.readFileSync(NOTE, 'utf8') !== ORIGINAL;
    fs.writeFileSync(`${APP_DATA}/final-crash-1.json`, JSON.stringify({ snapshots: snapshots.length, savedYet, noteAtKill: fs.readFileSync(NOTE, 'utf8'), under: snapshots.map((s) => s.replace(APP_DATA, '')) }));

    for (const pid of testAppPids()) process.kill(pid, 'SIGKILL');
  });
});
