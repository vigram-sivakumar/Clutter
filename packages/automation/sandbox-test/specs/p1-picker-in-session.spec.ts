import fs from 'node:fs';
import { spawn } from 'node:child_process';

const PICK = '/Users/sivakuv3/Documents/zz-sbx-existing-space';
const call = (cmd: string, args: unknown) =>
  browser.executeAsync((c: string, a: unknown, done: (r: unknown) => void) => {
    (window as any).__TAURI_INTERNALS__.invoke(c, a).then((v: unknown) => done({ ok: v }), (e: unknown) => done({ err: String(e) }));
  }, cmd, args);

describe('Open Existing Space: native picker, same session (unmodified app)', () => {
  it('picks a real-Documents folder through the dialog plugin, then writes to it', async () => {
    await browser.pause(3000);
    // The panel is a system service in another process; confirm it with Return a few seconds after it opens.
    spawn('osascript', ['-e', 'delay 5', '-e', 'tell application "System Events" to key code 36'], { detached: true, stdio: 'ignore' }).unref();
    const picked = await call('plugin:dialog|open', { options: { directory: true, multiple: false, defaultPath: PICK, title: 'sandbox experiment' } });
    console.log('PICKED', JSON.stringify(picked));
    const write = await call('atomic_write_file', { request: { vaultRoot: PICK, path: `${PICK}/in-session.md`, contents: 'written in the picking session', intent: { kind: 'upsert' } } });
    console.log('IN-SESSION atomic write', JSON.stringify(write));
    const fsWrite = await call('plugin:fs|mkdir', { path: `${PICK}/in-session-dir`, options: {} });
    console.log('IN-SESSION fs mkdir', JSON.stringify(fsWrite));
    console.log('ON DISK', JSON.stringify(fs.readdirSync(PICK)));
  });
});
