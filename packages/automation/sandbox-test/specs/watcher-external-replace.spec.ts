import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from './sandboxIsolation';
import { HOME, openFirstNote, registerSpace, temporaryFiles, typeAtEnd } from './helpers';

// Another application saves atomically (writes a temporary file, renames it over the note) while the note is open.
// The app must converge on the new content without treating the rename as a deletion or a move, and its own next
// save must still work on top of it.
const ROOT = `${HOME}/Documents/WatcherVault`;
const NOTE = `${ROOT}/Welcome.md`;

describe('an external atomic replace of the open note', () => {
  after(async () => {
    await browser.execute(() => localStorage.removeItem('clutter.spaces.v1'));
  });

  it('is picked up, the note stays (no false delete or duplicate), and Clutter saves on top of it', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    fs.mkdirSync(`${ROOT}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nOriginal body\n');
    await registerSpace(ROOT);
    await openFirstNote(testIds.sidebar.tab);
    expect((await $$('[data-testid^="sidebar.noteItem."]')).length).toBe(1);

    // The other application's save: a hidden temporary file, then a rename over the note.
    const temporary = `${ROOT}/.external-save.tmp`;
    fs.writeFileSync(temporary, '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nReplaced by another app\n');
    fs.renameSync(temporary, NOTE);

    await browser.waitUntil(async () => ((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string).includes('Replaced by another app'), {
      timeout: 20000,
      timeoutMsg: 'the editor never picked up the external replacement',
    });
    // Give any false delete/move events time to arrive, then check the note is still exactly one and still open.
    await browser.pause(3000);
    expect((await $$('[data-testid^="sidebar.noteItem."]')).length).toBe(1);
    expect(fs.existsSync(NOTE)).toBe(true);

    await typeAtEnd(' then Clutter');
    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('then Clutter'), { timeout: 20000 });
    const saved = fs.readFileSync(NOTE, 'utf8');
    expect(saved).toContain('Replaced by another app');
    expect(saved).toContain('id: note-welcome');
    expect(temporaryFiles(ROOT)).toEqual([]);
    expect((await $$('[data-testid^="sidebar.noteItem."]')).length).toBe(1);
  });
});
