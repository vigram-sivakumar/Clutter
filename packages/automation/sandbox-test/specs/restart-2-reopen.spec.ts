import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { assertIsolatedProfile } from './sandboxIsolation';

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
    try {
      await browser.waitUntil(() => fs.readFileSync(NOTE, 'utf8').includes('second launch'), { timeout: 20000 });
    } catch (error) {
      console.log('DIAG body:', JSON.stringify(((await browser.execute(() => document.body.innerText)) as string).slice(0, 1500)));
      console.log('DIAG note:', JSON.stringify(fs.readFileSync(NOTE, 'utf8')));
      const call = (cmd: string, args: unknown) =>
        browser.executeAsync((c: string, a: unknown, done: (r: unknown) => void) => {
          (window as any).__TAURI_INTERNALS__.invoke(c, a).then((v: unknown) => done({ ok: v }), (e: unknown) => done({ err: e }));
        }, cmd, args);
      console.log('DIAG atomic:', JSON.stringify(await call('atomic_write_file', { request: { vaultRoot: ROOT, path: `${ROOT}/diag.md`, contents: 'x', intent: { kind: 'upsert' } } })));
      console.log('DIAG replace:', JSON.stringify(await call('atomic_write_file', { request: { vaultRoot: ROOT, path: NOTE, contents: fs.readFileSync(NOTE, 'utf8') + ' z', intent: { kind: 'replace' } } })));
      console.log('DIAG xattr:', JSON.stringify(require('node:child_process').execSync(`xattr -l "${NOTE}"; ls -leO "${NOTE}"`).toString()));
      console.log('DIAG fs write:', JSON.stringify(await call('plugin:fs|exists', { path: ROOT })));
      console.log('DIAG ensure:', JSON.stringify(await call('ensure_space_access', { path: ROOT })));
      throw error;
    }

    const after = fs.statSync(NOTE);
    expect(after.ino).not.toBe(before.ino); // still replaced whole
    expect(fs.readFileSync(NOTE, 'utf8')).toContain('first launch second launch');
    expect(fs.readdirSync(ROOT).filter((name) => name.startsWith('.clutter-tmp.'))).toEqual([]);
  });
});
