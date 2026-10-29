import { assertIsolatedProfile } from '../isolation';

// Read-only. Proves the precondition itself works against the real isolated build.
describe('the atomic-save test profile is isolated', () => {
  it('has its own app data, no Space registry yet, and nothing outside the disposable root', async () => {
    await browser.pause(4000);
    const profile = await assertIsolatedProfile({
      fakeHome: process.env.CLUTTER_FAKE_HOME as string,
      approvedRoot: `${process.env.CLUTTER_FAKE_HOME}/Documents`,
    });

    expect(profile.registry).toBeNull();
    expect(profile.appData).toContain('com.clutter.atomictest');
  });
});

describe('the precondition refuses a profile that is not provably isolated', () => {
  const fakeHome = process.env.CLUTTER_FAKE_HOME as string;
  const seed = (value: unknown) =>
    browser.execute((raw: string | null) => (raw === null ? localStorage.removeItem('clutter.spaces.v1') : localStorage.setItem('clutter.spaces.v1', raw)), value === null ? null : JSON.stringify(value));

  afterEach(async () => {
    await seed(null);
  });

  it('throws when the registry holds a Space outside the disposable root, before anything else could run', async () => {
    await seed({ paths: ['/Users/somebody/Documents/Real Space'], activePath: '/Users/somebody/Documents/Real Space' });

    await expect(assertIsolatedProfile({ fakeHome, approvedRoot: `${fakeHome}/Documents` })).rejects.toThrow(/outside the disposable root/);
  });

  it('throws when even one of several Spaces is outside, and accepts only disposable ones', async () => {
    await seed({ paths: [`${fakeHome}/Documents/Mine`, '/Volumes/Archive/Notes'] });
    await expect(assertIsolatedProfile({ fakeHome, approvedRoot: `${fakeHome}/Documents` })).rejects.toThrow(/Volumes/);

    await seed({ paths: [`${fakeHome}/Documents/Mine`] });
    await expect(assertIsolatedProfile({ fakeHome, approvedRoot: `${fakeHome}/Documents` })).resolves.toBeDefined();
  });

  it('throws for a fake home that is not a /tmp/clutter-atomictest-* directory', async () => {
    await expect(assertIsolatedProfile({ fakeHome: '/Users/somebody', approvedRoot: '/Users/somebody/Documents' })).rejects.toThrow(/CLUTTER_FAKE_HOME/);
  });

  it('throws when the app-data directory is not the isolated build’s', async () => {
    await expect(assertIsolatedProfile({ fakeHome: '/tmp/clutter-atomictest-elsewhere', approvedRoot: '/tmp/clutter-atomictest-elsewhere/Documents' })).rejects.toThrow(/app-data directory/);
  });
});
