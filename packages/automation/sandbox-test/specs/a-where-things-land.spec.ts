const invoke = (cmd: string, args: unknown = {}) =>
  browser.executeAsync((c: string, a: unknown, done: (r: unknown) => void) => {
    (window as any).__TAURI_INTERNALS__.invoke(c, a).then((value: unknown) => done({ ok: value }), (e: unknown) => done({ err: String(e) }));
  }, cmd, args);

const REAL_DOCS = '/Users/sivakuv3/Documents';
const NAME = `zz-sbx-app-${Date.now()}`;

describe('what the sandboxed app can reach', () => {
  it('reports where Documents, home and app data are', async () => {
    await browser.pause(3000);
    for (const [label, directory] of [['document', 6], ['home', 21], ['appData', 14]] as const) {
      console.log('PATH', label, JSON.stringify(await invoke('plugin:path|resolve_directory', { directory })));
    }
  });

  it('create_space_folder (the Create Space backend) — where does the folder land?', async () => {
    const result = await invoke('create_space_folder', { name: NAME });
    console.log('CREATE', JSON.stringify(result));
  });

  it('a direct write to the real Documents path is refused by the OS', async () => {
    const result = await invoke('plugin:fs|mkdir', { path: `${REAL_DOCS}/${NAME}-direct`, options: {} });
    console.log('REAL-MKDIR', JSON.stringify(result));
  });
});
