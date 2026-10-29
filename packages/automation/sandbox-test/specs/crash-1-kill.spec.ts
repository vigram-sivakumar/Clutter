import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from './sandboxIsolation';
import { HOME, openFirstNote, recoveryFiles, registerSpace, typeAtEnd } from './helpers';

// Part 1 of 3: edit, wait until the recovery snapshot exists but the autosave has not yet run, then kill -9 the app.
const ROOT = `${HOME}/Documents/CrashVault`;
const NOTE = `${ROOT}/Welcome.md`;
const ORIGINAL = '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nBefore the crash\n';

describe('crash, part 1: the app is killed with unsaved work', () => {
  it('leaves the note exactly as it was and the work in a recovery snapshot', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    fs.mkdirSync(`${ROOT}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, ORIGINAL);
    await registerSpace(ROOT);
    await openFirstNote(testIds.sidebar.tab);

    await typeAtEnd(' typed before the kill');
    const deadline = Date.now() + 10000;
    while (recoveryFiles().length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    const snapshots = recoveryFiles().length;
    const savedYet = fs.readFileSync(NOTE, 'utf8') !== ORIGINAL;

    // The killed session cannot report a result to wdio, so the facts go in a file that part 2 asserts on.
    fs.writeFileSync(`${HOME}/crash-1.json`, JSON.stringify({ snapshots, savedYet, noteAtKill: fs.readFileSync(NOTE, 'utf8') }));

    // Exactly the isolated binary, by exact process name.
    for (const pid of execFileSync('pgrep', ['-f', 'Clutter Sandbox Test.app/Contents/MacOS/app']).toString().split('\n').filter(Boolean)) {
      process.kill(Number(pid), 'SIGKILL');
    }
  });
});
