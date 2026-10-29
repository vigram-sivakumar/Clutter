/**
 * The enforced precondition of every atomic-save real-app test: prove the running profile is the isolated one, and
 * throw — before anything is written, renamed, deleted or crashed — if it is not. A warning is not enough.
 */
export const ISOLATED_APP_IDENTIFIER = 'com.clutter.atomictest';
export const SPACE_REGISTRY_KEY = 'clutter.spaces.v1';

export interface ProfileSnapshot {
  readonly appData: string;
  readonly registry: { paths: string[]; activePath?: string } | null;
  readonly otherKeys: string[];
}

export async function readProfile(): Promise<ProfileSnapshot> {
  return (await browser.executeAsync((registryKey: string, done: (value: unknown) => void) => {
    const internals = (window as any).__TAURI_INTERNALS__;
    let registry: unknown = null;
    const otherKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)!;
      if (key === registryKey) {
        try {
          registry = JSON.parse(localStorage.getItem(key) ?? 'null');
        } catch {
          registry = { paths: ['<unparsable registry>'] };
        }
      } else otherKeys.push(key);
    }
    internals.invoke('plugin:path|resolve_directory', { directory: 14 }).then(
      (appData: string) => done({ appData, registry, otherKeys }),
      (error: unknown) => done({ appData: `<${String(error)}>`, registry, otherKeys })
    );
  }, SPACE_REGISTRY_KEY)) as ProfileSnapshot;
}

/** Throws unless this profile is the isolated one and every Space it knows is inside `approvedRoot`. */
export async function assertIsolatedProfile(options: { fakeHome: string; approvedRoot: string }): Promise<ProfileSnapshot> {
  const { fakeHome, approvedRoot } = options;
  if (!/^\/(private\/)?tmp\/clutter-atomictest-/.test(fakeHome)) {
    throw new Error(`Refusing to run: CLUTTER_FAKE_HOME must be /tmp/clutter-atomictest-*, got ${JSON.stringify(fakeHome)}`);
  }
  const profile = await readProfile();
  const home = fakeHome.replace(/^\/private/, '');
  if (!profile.appData.replace(/^\/private/, '').startsWith(`${home}/`) || !profile.appData.includes(ISOLATED_APP_IDENTIFIER)) {
    throw new Error(`Refusing to run: the app-data directory is not the isolated one (${profile.appData})`);
  }
  const outside = (profile.registry?.paths ?? []).filter((path) => !path.replace(/^\/private/, '').startsWith(`${approvedRoot.replace(/^\/private/, '')}/`));
  if (outside.length > 0) {
    throw new Error(`Refusing to run: this profile knows Spaces outside the disposable root: ${outside.join(', ')}`);
  }
  const active = profile.registry?.activePath;
  if (active && outside.includes(active)) {
    throw new Error(`Refusing to run: the active Space is outside the disposable root: ${active}`);
  }

  return profile;
}
