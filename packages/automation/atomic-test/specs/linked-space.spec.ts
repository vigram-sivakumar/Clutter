import { assertIsolatedProfile } from '../isolation';
import { HOME } from './helpers';

// A Space reached through a link is refused when it is added (the watcher reports resolved paths and would never
// see its changes). This checks the native half in the real app, under the permission system.
describe('a folder reached through a link is recognised', () => {
  it('resolves /tmp to its real path and a real folder to itself', async () => {
    await browser.pause(3000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    const resolve = (path: string) =>
      browser.executeAsync((value: string, done: (r: unknown) => void) => {
        (window as any).__TAURI_INTERNALS__.invoke('canonical_space_path', { path: value }).then(done, (e: unknown) => done({ rejected: String(e) }));
      }, path);

    expect(await resolve('/tmp')).toBe('/private/tmp');
    expect(await resolve(`${HOME}/Documents`)).toBe(`${HOME}/Documents`);
    expect(await resolve('/definitely/not/there')).toEqual({ rejected: expect.stringContaining('No such file') });
  });
});
