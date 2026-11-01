import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { APP_DATA, REAL_DOCS, openFirstNote, recoveryContaining, tempFiles } from './common';

// Launch 5, part 2: the relaunch offers the unsaved work; Restore puts it back and the normal atomic save writes it.
const SPACE = `${REAL_DOCS}/ClutterSbxFinalCrashB`;
const NOTE = `${SPACE}/Welcome.md`;

describe('F4b: recovery after the crash', () => {
  it('shows the recovery review, restores the text, saves it atomically, and clears the snapshot', async () => {
    await browser.pause(4000);
    const killed = JSON.parse(fs.readFileSync(`${APP_DATA}/final-crash-1.json`, 'utf8')) as { snapshots: number; savedYet: boolean; noteAtKill: string; under: string[] };
    console.log('FINAL crash-1', JSON.stringify(killed));
    expect(killed.snapshots).toBeGreaterThan(0);
    expect(killed.savedYet).toBe(false);
    expect(fs.readFileSync(NOTE, 'utf8')).not.toContain('typed before the kill');
    expect(tempFiles(SPACE)).toEqual([]);

    const restore = await $('button=Restore');
    await restore.waitForExist({ timeout: 30000, timeoutMsg: 'the recovery review never appeared' });
    expect((await browser.execute(() => document.body.innerText)) as string).toContain('Discard');
    await restore.click();
    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('typed before the kill'), { timeout: 30000, timeoutMsg: 'the restored text was never saved' });
    await browser.waitUntil(() => recoveryContaining('typed before the kill').length === 0, { timeout: 30000, timeoutMsg: 'the recovery snapshot was not cleared after the save' });
    expect(fs.readFileSync(NOTE, 'utf8')).toContain('Before the crash');
    expect(tempFiles(SPACE)).toEqual([]);
    await openFirstNote(testIds.sidebar.tab);
  });
});
