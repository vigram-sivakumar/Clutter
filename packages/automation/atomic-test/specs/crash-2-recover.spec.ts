import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from '../isolation';
import { HOME, openFirstNote, recoveryFiles, temporaryFiles } from './helpers';

// Part 2 of 3: the relaunch offers the unsaved work; Restore puts it back as an unsaved edit and the normal save writes it.
const ROOT = `${HOME}/Documents/CrashVault`;
const NOTE = `${ROOT}/Welcome.md`;

describe('crash, part 2: the relaunch offers the unsaved work', () => {
  it('shows the recovery review, restores the text, saves it, and clears the snapshot', async () => {
    await browser.pause(3000);
    const profile = await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    expect(profile.registry?.activePath).toBe(ROOT);
    // What part 1 saw just before it killed the app (it cannot report to wdio itself).
    const killed = JSON.parse(fs.readFileSync(`${HOME}/crash-1.json`, 'utf8')) as { snapshots: number; savedYet: boolean; noteAtKill: string };
    expect(killed.snapshots).toBeGreaterThan(0); // the unsaved work was already in a recovery snapshot
    expect(killed.savedYet).toBe(false); // and the kill beat the autosave: this really was unsaved work
    expect(killed.noteAtKill).toContain('Before the crash');
    expect(killed.noteAtKill).not.toContain('typed before the kill');
    expect(fs.readFileSync(NOTE, 'utf8')).not.toContain('typed before the kill'); // the note is exactly as it was
    expect(temporaryFiles(ROOT)).toEqual([]); // and no half-written temporary file

    const restore = await $('button=Restore');
    await restore.waitForExist({ timeout: 30000 });
    expect((await browser.execute(() => document.body.innerText)) as string).toContain('Discard');
    await restore.click();

    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('typed before the kill'), {
      timeout: 30000,
      timeoutMsg: 'the restored text was never saved',
    });
    await browser.waitUntil(() => recoveryFiles().length === 0, { timeout: 30000, timeoutMsg: 'the recovery snapshot was not cleared after the save' });
    expect(fs.readFileSync(NOTE, 'utf8')).toContain('Before the crash');
    expect(temporaryFiles(ROOT)).toEqual([]);
    await openFirstNote(testIds.sidebar.tab);
  });
});
