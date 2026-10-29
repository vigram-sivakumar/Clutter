import { readProfile } from '../../atomic-test/isolation';

/** Sandbox variant: the container IS the isolation. Proves the app is the sandbox test identity, in its container. */
export async function assertIsolatedProfile(options: { fakeHome: string; approvedRoot: string }) {
  const profile = await readProfile();
  if (!profile.appData.startsWith(`${options.fakeHome}/Library/Application Support/com.clutter.sandboxtest`)) {
    throw new Error(`Refusing to run: not the sandbox test identity (${profile.appData})`);
  }
  if (!options.fakeHome.includes('/Library/Containers/com.clutter.sandboxtest/Data')) throw new Error('fake home is not the container');
  const outside = (profile.registry?.paths ?? []).filter((p) => !p.startsWith(`${options.approvedRoot}/`));
  if (outside.length > 0) throw new Error(`Refusing to run: Spaces outside the container: ${outside.join(', ')}`);
  return profile;
}
