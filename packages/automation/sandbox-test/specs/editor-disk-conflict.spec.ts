import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from './sandboxIsolation';
import { HOME, openFirstNote, registerSpace, temporaryFiles, typeAtEnd } from './helpers';

// Another application edits the open note while the editor holds unsaved typing. The editor must not overwrite it,
// however many times it tries to save, and Save as new note must resolve the conflict without touching the file.
const ROOT = `${HOME}/Documents/ConflictVault`;
const NOTE = `${ROOT}/Welcome.md`;
const EXTERNAL = '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nWritten by another application\n';

describe('an edit made elsewhere is never overwritten by the editor', () => {
  after(async () => {
    await browser.execute(() => localStorage.removeItem('clutter.spaces.v1'));
  });

  it('keeps the external version through repeated autosaves, then resolves with Save as new note', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    fs.mkdirSync(`${ROOT}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nOriginal body\n');
    await registerSpace(ROOT);
    await openFirstNote(testIds.sidebar.tab);

    // Unsaved typing, then another application writes the file before the autosave runs.
    await typeAtEnd(' my unsaved words');
    fs.writeFileSync(NOTE, EXTERNAL);

    const notice = await $('[data-testid="save-failure-notice"]');
    await notice.waitForExist({ timeout: 30000, timeoutMsg: 'no save-failure notice appeared' });
    expect(await notice.getAttribute('data-kind')).toBe('changed-on-disk');
    expect(await notice.getText()).toContain('This note changed on disk');
    expect((await notice.$$('button')).length).toBe(1); // no Retry: only Save as new note
    expect(fs.readFileSync(NOTE, 'utf8')).toBe(EXTERNAL);

    // More typing and more autosaves: the file stays the external version, byte for byte.
    await typeAtEnd(' and more words');
    await browser.pause(6000);
    expect(fs.readFileSync(NOTE, 'utf8')).toBe(EXTERNAL);
    expect(temporaryFiles(ROOT)).toEqual([]);
    expect((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string).toContain('and more words');

    // Resolve: the unsaved text becomes a new note; the original follows the disk.
    await (await notice.$('button')).click();
    await browser.waitUntil(
      () => fs.readdirSync(ROOT).some((name) => name.endsWith('.md') && name !== 'Welcome.md'),
      { timeout: 30000, timeoutMsg: 'the new note was never written' }
    );
    const copyName = fs.readdirSync(ROOT).find((name) => name.endsWith('.md') && name !== 'Welcome.md')!;
    const copy = fs.readFileSync(`${ROOT}/${copyName}`, 'utf8');
    expect(copy).toContain('my unsaved words and more words');
    expect(fs.readFileSync(NOTE, 'utf8')).toBe(EXTERNAL); // never modified
    await browser.waitUntil(async () => !(await $('[data-testid="save-failure-notice"]').isExisting()), { timeout: 15000 });
    expect((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string).toContain('Written by another application');
  });
});
