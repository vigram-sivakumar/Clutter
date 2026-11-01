/** Shared steps for the unattended final acceptance specs: no file panel, no keyboard input, only WebDriver in the test app. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export const CONTAINER = process.env.CLUTTER_FAKE_HOME as string;
export const REAL_HOME = '/Users/sivakuv3';
export const REAL_DOCS = `${REAL_HOME}/Documents`;
export const NAME = 'ClutterSbxFinal';
export const SPACE = `${REAL_DOCS}/${NAME}`;
export const OUT = '/private/tmp/zz-sbx-final-outside';
export const FIXTURE = `${CONTAINER}/Documents/zz-final-fixture`;
/** The test identity this run drives: the October one by default, or the fresh one (`com.clutter.sandboxfresh`). Never a real Clutter identity. */
export const SBX_ID = process.env.CLUTTER_SBX_ID ?? 'com.clutter.sandboxtest';
export const APP_DATA = `${CONTAINER}/Library/Application Support/${SBX_ID}`;

if (!['com.clutter.sandboxtest', 'com.clutter.sandboxfresh'].includes(SBX_ID) || !CONTAINER || !CONTAINER.endsWith(`/Library/Containers/${SBX_ID}/Data`)) {
  throw new Error(`Refusing to run: CLUTTER_FAKE_HOME must be the container of a sandbox test identity, got ${JSON.stringify(CONTAINER)} for ${SBX_ID}`);
}

type Answer = { ok?: any; err?: string };

/** Calls a command from inside the webview exactly as page script would. */
export const call = (cmd: string, args: unknown = {}): Promise<Answer> =>
  browser.executeAsync(
    (c: string, a: unknown, done: (r: unknown) => void) => {
      (window as any).__TAURI_INTERNALS__.invoke(c, a).then(
        (v: unknown) => done({ ok: v }),
        (e: unknown) => done({ err: typeof e === 'string' ? e : JSON.stringify(e) })
      );
    },
    cmd,
    args
  ) as Promise<Answer>;

/** A command that takes the path in a header and raw bytes as the body (the fs plugin's write_file / write_text_file, write_file_no_clobber). */
export const callWithBody = (cmd: string, path: string, text: string): Promise<Answer> =>
  browser.executeAsync(
    (c: string, p: string, t: string, done: (r: unknown) => void) => {
      const bytes = new TextEncoder().encode(t);
      (window as any).__TAURI_INTERNALS__.invoke(c, bytes, { headers: { path: encodeURIComponent(p) } }).then(
        (v: unknown) => done({ ok: v }),
        (e: unknown) => done({ err: typeof e === 'string' ? e : JSON.stringify(e) })
      );
    },
    cmd,
    path,
    text
  ) as Promise<Answer>;

export const registerSpaces = (paths: string[], active: string): Promise<void> =>
  browser.execute((value: string[], current: string) => localStorage.setItem('clutter.spaces.v1', JSON.stringify({ paths: value, activePath: current })), paths, active) as Promise<void>;

export const onDisk = (file: string): string => fs.readFileSync(file, 'utf8');
export const tempFiles = (dir: string): string[] => fs.readdirSync(dir).filter((name) => name.startsWith('.clutter-tmp.'));
export const bodyText = (): Promise<string> => browser.execute(() => document.body.innerText) as Promise<string>;

export async function openFirstNote(tabId: (tab: string) => string): Promise<void> {
  const tab = await $(`[data-testid="${tabId('notes')}"]`);
  await tab.waitForExist({ timeout: 30000 });
  await tab.click();
  await (await $('[data-testid^="sidebar.noteItem."]')).click();
  await (await $('.cm-content')).waitForExist({ timeout: 15000 });
}

/** Opens the note whose sidebar row shows exactly `title` (the first row is not necessarily the one a spec means). */
export async function openNoteNamed(tabId: (tab: string) => string, title: string): Promise<void> {
  const tab = await $(`[data-testid="${tabId('notes')}"]`);
  await tab.waitForExist({ timeout: 30000 });
  await tab.click();
  await browser.waitUntil(
    async () =>
      (await browser.execute((wanted: string) => {
        const row = [...document.querySelectorAll('[data-testid^="sidebar.noteItem."]')].find((el) => (el.textContent ?? '').trim() === wanted) as HTMLElement | undefined;
        row?.click();
        return row !== undefined;
      }, title)) as boolean,
    { timeout: 20000, timeoutMsg: `no sidebar row titled ${title}` }
  );
  await (await $('.cm-content')).waitForExist({ timeout: 15000 });
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

/** Every file the test app wrote as a recovery record. */
export function recoveryFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(`${APP_DATA}/recovery`);
  return found;
}

/** The recovery records that contain `text`: other records (an earlier session's, say) are not this test's business. */
export const recoveryContaining = (text: string): string[] => recoveryFiles().filter((file) => fs.readFileSync(file, 'utf8').includes(text));

/** The test app's own processes, by its exact bundle path (never by a broad name: the development build is also called `app`). */
export function testAppPids(): number[] {
  try {
    return execFileSync('pgrep', ['-f', 'Clutter Sandbox Test.app/Contents/MacOS/app']).toString().split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}
