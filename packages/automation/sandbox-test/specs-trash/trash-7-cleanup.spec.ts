import fs from 'node:fs';
import { type SpaceKind, SPACE_PATHS, call, forgetFixtureState, registerSpaces } from './common';

/** Removes everything this suite created: the three Space folders (by exact path), saved picker access, run state. */
describe('Trash cleanup', () => {
  it('removes the suite’s Space folders, saved access and state', async () => {
    await browser.pause(2000);
    for (const kind of Object.keys(SPACE_PATHS) as SpaceKind[]) {
      const space = SPACE_PATHS[kind];
      if (kind !== 'docs') await call('forget_space_access', { path: space });
      fs.rmSync(space, { recursive: true, force: true });
      forgetFixtureState(kind);
      expect(fs.existsSync(space)).toBe(false);
    }
    await registerSpaces([], '');
  });
});
