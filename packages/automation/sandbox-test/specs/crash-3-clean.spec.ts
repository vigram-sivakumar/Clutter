import { assertIsolatedProfile } from './sandboxIsolation';
import { HOME, recoveryFiles } from './helpers';

// Part 3 of 3: after the recovered work was saved, a further launch has nothing to ask.
describe('crash, part 3: no stale recovery prompt', () => {
  after(async () => {
    await browser.execute(() => localStorage.removeItem('clutter.spaces.v1'));
  });

  it('opens straight to the note with no recovery review and no snapshot left', async () => {
    await browser.pause(6000);
    await assertIsolatedProfile({ fakeHome: HOME, approvedRoot: `${HOME}/Documents` });
    const text = (await browser.execute(() => document.body.innerText)) as string;

    expect(text).not.toContain('Restore');
    expect(text).not.toContain('Discard');
    expect(recoveryFiles()).toEqual([]);
  });
});
