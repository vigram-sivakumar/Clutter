import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from '../isolation';

// Part 2 of 2: a fresh launch with the same profile. The Space must open by itself, and the native writer must still
// have access to it (the grant is restored, not assumed), including for its hidden files.
const HOME = process.env.CLUTTER_FAKE_HOME as string;
const ROOT = `${HOME}/Documents/RestartVault`;
const NOTE = `${ROOT}/Welcome.md`;

describe('restart, part 2: the Space reopens and atomic saves still work', () => {
  after(async () => {
    await browser.execute(() => localStorage.removeItem('clutter.spaces.v1'));
  });

  it('opens the registered Space and saves a second edit', async () => {
    await browser.pause(3000);
    const profile = await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    expect(profile.registry?.activePath).toBe(ROOT);

    await (await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`)).waitForExist({ timeout: 30000 });
    await (await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`)).click();
    await (await $('[data-testid^="sidebar.noteItem."]')).click();
    await (await $('.cm-content')).waitForExist({ timeout: 15000 });
    expect((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string).toContain('first launch');
    expect((await browser.execute(() => document.body.innerText)) as string).not.toContain('Couldn’t save the space settings');

    const before = fs.statSync(NOTE);
    await browser.execute(() => {
      const content = document.querySelector('.cm-content') as HTMLElement;
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, ' second launch');
    });
    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('second launch'), { timeout: 20000 });

    const after = fs.statSync(NOTE);
    expect(after.ino).not.toBe(before.ino); // still replaced whole
    expect(fs.readFileSync(NOTE, 'utf8')).toContain('first launch second launch');
    expect(fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.'))).toEqual([]);
  });
});
