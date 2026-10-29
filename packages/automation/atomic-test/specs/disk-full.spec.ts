import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from '../isolation';

const HOME = process.env.CLUTTER_FAKE_HOME as string;
const ROOT = `${HOME}/Documents/FullVault`;
const NOTE = `${ROOT}/Welcome.md`;
const ORIGINAL = '---\nid: note-welcome\nfavorite: false\nstatus: active\n---\nOriginal body\n';

function recoveryFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.includes(`${path.sep}recovery${path.sep}`) || /recovery/i.test(full)) found.push(full);
    }
  };
  walk(`${HOME}/Library/Application Support/com.clutter.atomictest`);
  return found;
}

describe('a disk that fills during an autosave, in the real app', () => {
  const image = `${HOME}/full.dmg`;

  after(async () => {
    await browser.execute(() => localStorage.removeItem('clutter.spaces.v1'));
    try {
      execFileSync('hdiutil', ['detach', ROOT, '-force']);
    } catch {
      /* already detached */
    }
  });

  it('keeps the original note, keeps the work recoverable, and saves it once there is room', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });

    // A 2 MB APFS volume mounted as the Space itself.
    fs.mkdirSync(ROOT, { recursive: true });
    execFileSync('hdiutil', ['create', '-size', '2m', '-fs', 'APFS', '-volname', 'FullVault', image]);
    execFileSync('hdiutil', ['attach', image, '-mountpoint', ROOT, '-nobrowse']);
    fs.mkdirSync(`${ROOT}/.clutter`);
    fs.writeFileSync(NOTE, ORIGINAL);

    await browser.execute((root: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: [root], activePath: root })), ROOT);
    await browser.refresh();
    const notesTab = await $(`[data-testid="${testIds.sidebar.tab('notes')}"]`);
    await notesTab.waitForExist({ timeout: 30000 });
    await notesTab.click();
    const item = await $('[data-testid^="sidebar.noteItem."]');
    await item.waitForExist({ timeout: 30000 });
    await item.click();
    await (await $('.cm-content')).waitForExist({ timeout: 15000 });

    // Fill the volume completely (Clutter's own settings writes have already happened).
    const fillers: string[] = [];
    const chunk = Buffer.alloc(32 * 1024, 7);
    for (let index = 0; index < 400; index += 1) {
      const file = `${ROOT}/filler-${index}`;
      try {
        fs.writeFileSync(file, chunk);
        fillers.push(file);
      } catch {
        fs.rmSync(file, { force: true });
        break;
      }
    }
    for (let index = 0; index < 40; index += 1) {
      try {
        fs.writeFileSync(`${ROOT}/pad-${index}`, Buffer.alloc(512, 1));
        fillers.push(`${ROOT}/pad-${index}`);
      } catch {
        fs.rmSync(`${ROOT}/pad-${index}`, { force: true });
        break;
      }
    }

    await browser.execute(() => {
      const content = document.querySelector('.cm-content') as HTMLElement;
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, ' typed while the disk was full');
    });

    // The save cannot be written: wait until the app has had time to try (the autosave debounce is 2 s).
    await browser.pause(6000);
    const whileFull = {
      file: fs.readFileSync(NOTE, 'utf8'),
      leftovers: fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.')),
      page: (await browser.execute(() => document.body.innerText)) as string,
      recovery: recoveryFiles().length,
      editor: (await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string,
    };
    console.log('FULL-WHILE ' + JSON.stringify({ ...whileFull, page: whileFull.page.slice(0, 500) }));

    expect(whileFull.file).toBe(ORIGINAL); // the original note is intact
    expect(whileFull.leftovers).toEqual([]); // no half-written temporary file
    expect(whileFull.editor).toContain('typed while the disk was full'); // the editor keeps the work
    expect(whileFull.recovery).toBeGreaterThan(0); // and it is protected outside the vault

    // Room appears: the bounded automatic retry (or the next trigger) saves it.
    for (const file of fillers) fs.rmSync(file, { force: true });
    await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('typed while the disk was full'), {
      timeout: 60000,
      interval: 1000,
      timeoutMsg: 'the note was never saved after space was freed',
    });
    const saved = fs.readFileSync(NOTE, 'utf8');
    console.log('FULL-AFTER ' + JSON.stringify({ saved, leftovers: fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.')) }));
    expect(saved).toContain('id: note-welcome');
    expect(saved).toContain('Original body');
    expect(fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.'))).toEqual([]);
  });
});
