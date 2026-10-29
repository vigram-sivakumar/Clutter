const PICK = '/Users/sivakuv3/Documents/zz-sbx-existing-space';
const call = (cmd: string, args: unknown) =>
  browser.executeAsync((c: string, a: unknown, done: (r: unknown) => void) => {
    (window as any).__TAURI_INTERNALS__.invoke(c, a).then((v: unknown) => done({ ok: v }), (e: unknown) => done({ err: String(e) }));
  }, cmd, args);

describe('Open Existing Space: after a relaunch (unmodified app; no bookmark code exists)', () => {
  it('can the app still write to the previously picked folder?', async () => {
    await browser.pause(3000);
    console.log('RELAUNCH atomic write', JSON.stringify(await call('atomic_write_file', { request: { vaultRoot: PICK, path: `${PICK}/after-restart.md`, contents: 'x', intent: { kind: 'upsert' } } })));
    console.log('RELAUNCH fs mkdir', JSON.stringify(await call('plugin:fs|mkdir', { path: `${PICK}/after-restart-dir`, options: {} })));
    console.log('RELAUNCH fs read_dir', JSON.stringify(await call('plugin:fs|read_dir', { path: PICK })));
  });
  it('unauthorized real paths stay inaccessible', async () => {
    for (const p of ['/Users/sivakuv3/Desktop', '/Users/sivakuv3/.ssh', '/Users/sivakuv3/Documents', '/Users/Shared']) {
      console.log('UNAUTH read_dir', p, JSON.stringify(await call('plugin:fs|read_dir', { path: p })));
    }
    console.log('UNAUTH atomic outside', JSON.stringify(await call('atomic_write_file', { request: { vaultRoot: '/Users/sivakuv3/Desktop', path: '/Users/sivakuv3/Desktop/zz-nope.md', contents: 'x', intent: { kind: 'create' } } })));
  });
});
