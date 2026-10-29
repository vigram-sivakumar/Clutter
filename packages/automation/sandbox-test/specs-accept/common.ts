import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const CONTAINER = process.env.CLUTTER_FAKE_HOME as string;
export const REAL_HOME = '/Users/sivakuv3';
export const REAL_DOCS = `${REAL_HOME}/Documents`;
export const NAME = 'ClutterSbxAccept';
export const SPACE = `${REAL_DOCS}/${NAME}`;
export const EXISTING = '/Users/Shared/zz-sbx-existing-space';
export const OUTSIDE = '/private/tmp/zz-sbx-outside-space';
export const ASSETS = '/private/tmp/zz-sbx-assets';
export const STORE = `${CONTAINER}/Library/Application Support/com.clutter.sandboxtest/space-access.json`;

export const call = (cmd: string, args: unknown = {}) =>
  browser.executeAsync((c: string, a: unknown, done: (r: unknown) => void) => {
    (window as any).__TAURI_INTERNALS__.invoke(c, a).then((v: unknown) => done({ ok: v }), (e: unknown) => done({ err: typeof e === 'string' ? e : JSON.stringify(e) }));
  }, cmd, args) as Promise<{ ok?: any; err?: string }>;

/** The system panel runs in another process: send it a key a few seconds after it opens. keys: 36 Return, 53 Escape, 125 Down. */
export function pressAfter(_seconds: number, ...keys: number[]): void {
  // Guarded: presses only while the sandbox test app's system file panel is up and the app is frontmost.
  spawn('/private/tmp/claude-502/safekey.sh', ['40', ...keys.map(String)], { detached: true, stdio: 'ignore' }).unref();
}

export function registerSpaces(paths: string[], active: string): Promise<void> {
  return browser.execute((value: string[], current: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: value, activePath: current })), paths, active) as Promise<void>;
}

export async function openNoteAndEdit(testId: (tab: string) => string, text: string): Promise<void> {
  const tab = await $(`[data-testid="${testId('notes')}"]`);
  await tab.waitForExist({ timeout: 30000 });
  await tab.click();
  await (await $('[data-testid^="sidebar.noteItem."]')).click();
  await (await $('.cm-content')).waitForExist({ timeout: 15000 });
  await typeAtEnd(text);
}

export async function typeAtEnd(text: string): Promise<void> {
  await browser.execute((value: string) => {
    const content = document.querySelector('.cm-content') as HTMLElement;
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('insertText', false, value);
  }, text);
}

export const onDisk = (file: string): string => fs.readFileSync(file, 'utf8');
export const tempFiles = (dir: string): string[] => fs.readdirSync(dir).filter((name) => name.startsWith('.clutter-tmp.'));
export const bodyText = (): Promise<string> => browser.execute(() => document.body.innerText) as Promise<string>;

export function corruptBookmarkFor(folder: string): void {
  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  if (!(folder in store.entries)) throw new Error(`no saved access for ${folder}: ${Object.keys(store.entries).join(', ')}`);
  store.entries[folder] = 'deadbeef';
  fs.writeFileSync(STORE, JSON.stringify(store));
}

export function writeTinyAssets(): void {
  fs.mkdirSync(`${ASSETS}/img`, { recursive: true });
  fs.mkdirSync(`${ASSETS}/pdf`, { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(`${ASSETS}/img/pic.png`, png);
  fs.writeFileSync(`${ASSETS}/pdf/doc.pdf`, '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
}
export { path };
