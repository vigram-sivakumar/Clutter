import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from '../isolation';

const HOME = process.env.CLUTTER_FAKE_HOME as string;
const ROOT = `${HOME}/Documents/AtomicVault`;
const NOTE = `${ROOT}/Welcome.md`;

describe('an edit autosaves through the atomic writer in the real app', () => {
  it('writes complete Markdown with the frontmatter intact, by replacement, leaving no temporary file', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });

    fs.mkdirSync(`${ROOT}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, '---\nid: note-welcome\n---\nOriginal body\n');
    const before = fs.statSync(NOTE);

    // The isolated profile has no Spaces: register the disposable one and reload so the app opens it.
    await browser.execute((root: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: [root], activePath: root })), ROOT);
    await browser.refresh();

    const notesTab = await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`);
    await notesTab.waitForExist({ timeout: 30000 });
    await notesTab.click();
    const pageText = (await browser.execute(() => document.body.innerText)) as string;
    expect(pageText).not.toContain('Couldn’t save the space settings');

    const item = await $('[data-testid^="sidebar.noteItem."]');
    await item.waitForExist({ timeout: 30000 });
    await item.click();

    const body = await $('.cm-content');
    await body.waitForExist({ timeout: 15000 });
    const line = await $('.cm-line');
    await line.click();
    await browser.execute(() => (document.querySelector('.cm-content') as HTMLElement).focus());
    // WebDriver key events do not reach this embedded WebKit's contenteditable; an input command does, and goes
    // through the same beforeinput/input path as typing.
    await browser.execute(() => {
      const content = document.querySelector('.cm-content') as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, ' typed by the test');
    });
    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('typed by the test'), {
      timeout: 20000,
      timeoutMsg: 'the edit never reached the file',
    });

    const text = fs.readFileSync(NOTE, 'utf8');
    const after = fs.statSync(NOTE);
    console.log('AUTOSAVE-RESULT ' + JSON.stringify({ text, inodeChanged: before.ino !== after.ino, birthKept: before.birthtimeMs === after.birthtimeMs, leftovers: fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.')) }));

    expect(text).toContain('id: note-welcome');
    expect(text).toContain('Original body');
    expect(fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.'))).toEqual([]);
    expect(after.ino).not.toBe(before.ino); // replaced whole, not rewritten in place
    expect(after.birthtimeMs).toBe(before.birthtimeMs);
  });
});
