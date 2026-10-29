import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from '../isolation';
import { HOME, temporaryFiles, typeAtEnd } from './helpers';

// What a user gets when the Space lives on a volume the atomic writer does not support (ADR-063: APFS only). The
// writer refuses; nothing is written and nothing falls back to another writer. Real disk images, real app.
const ORIGINAL = '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nOriginal body\n';

for (const [format, label] of [['ExFAT', 'exfat'], ['MS-DOS', 'fat32'], ['HFS+J', 'hfsplus']] as const) {
  describe(`a Space on a ${format} volume`, () => {
    const root = `${HOME}/Documents/Vol-${label}`;
    const image = `${HOME}/${label}.dmg`;

    after(async () => {
      await browser.execute(() => localStorage.removeItem('clutter.spaces.v1'));
      try {
        execFileSync('hdiutil', ['detach', root, '-force']);
      } catch {
        /* already detached */
      }
    });

    it('opens, but refuses to save, says so, and writes nothing', async () => {
      await browser.pause(3000);
      await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
      fs.mkdirSync(root, { recursive: true });
      execFileSync('hdiutil', ['create', '-size', '16m', '-fs', format, '-volname', `V${label}`.slice(0, 11).toUpperCase(), image]);
      execFileSync('hdiutil', ['attach', image, '-mountpoint', root, '-nobrowse']);
      fs.mkdirSync(`${root}/.clutter`);
      fs.writeFileSync(`${root}/Welcome.md`, ORIGINAL);

      await browser.execute((value: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: [value], activePath: value })), root);
      await browser.refresh();
      const notes = await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`);
      await notes.waitForExist({ timeout: 30000 });
      await notes.click();
      const item = await $('[data-testid^="sidebar.noteItem."]');
      await item.waitForExist({ timeout: 30000 });
      await item.click();
      await (await $('.cm-content')).waitForExist({ timeout: 15000 });
      const opened = (await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string;
      expect(opened).toContain('Original body');

      await typeAtEnd(' edited');
      const seen = async () => ((await browser.execute(() => document.body.innerText)) as string);
      await browser.pause(15000); // past the autosave debounce and its automatic retries
      const text = await seen();
      console.log(`VOLUME ${format}:`, JSON.stringify(text.split('\n').filter((line) => /save|Save|space settings|location|safely/i.test(line))));
      expect(fs.readFileSync(`${root}/Welcome.md`, 'utf8')).toBe(ORIGINAL); // untouched
      expect(temporaryFiles(root)).toEqual([]);
      expect(text).toContain('Can’t save safely to this location');
      // One cause, one explanation: the Space's automatic settings write failed for the same reason, and is not announced
      // as a separate "couldn’t save the space settings" (docs/writing-principles.md, "Choose the surface").
      expect(text).not.toContain('Couldn’t save the space settings');
      expect(text.split('Can’t save safely to this location').length - 1).toBe(1);
    });
  });
}
