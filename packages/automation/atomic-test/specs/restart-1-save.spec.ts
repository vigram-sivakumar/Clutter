import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from '../isolation';

// Part 1 of 2 (the next spec file is a fresh launch of the app with the same profile): open a Space, save an edit,
// and leave the Space registered so the next launch reopens it.
const HOME = process.env.CLUTTER_FAKE_HOME as string;
const ROOT = `${HOME}/Documents/RestartVault`;
const NOTE = `${ROOT}/Welcome.md`;

describe('restart, part 1: a Space opened and saved to', () => {
  it('saves an edit through the atomic writer and leaves the Space registered', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    fs.mkdirSync(`${ROOT}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nBefore restart\n');
    await browser.execute((root: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: [root], activePath: root })), ROOT);
    await browser.refresh();

    await (await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`)).waitForExist({ timeout: 30000 });
    await (await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`)).click();
    await (await $('[data-testid^="sidebar.noteItem."]')).click();
    await (await $('.cm-content')).waitForExist({ timeout: 15000 });
    await browser.execute(() => {
      const content = document.querySelector('.cm-content') as HTMLElement;
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, ' first launch');
    });
    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('first launch'), { timeout: 20000 });
    expect(fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.'))).toEqual([]);
  });
});
