import fs from 'node:fs';
import { SPACE_PATHS, call, pressAfter, registerSpaces, seedFixture } from './common';

/** Launch 1 of the "existing" pair: seed the folder, pick it through the system panel (attended), save its access. */
describe('Trash setup: a Space picked outside Documents (existing)', () => {
  const space = SPACE_PATHS.existing;

  it('refuses to reuse a folder left by an earlier run', () => {
    if (fs.existsSync(space)) throw new Error(`refusing to run: ${space} already exists (run trash-7-cleanup first)`);
  });

  it('picks the folder, saves its access and registers it', async () => {
    seedFixture('existing');
    await browser.pause(3000);
    pressAfter(36); // Return: choose the folder in the panel
    const picked = await call('plugin:dialog|open', { options: { directory: true, multiple: false, recursive: true, defaultPath: space } });
    expect(picked.ok).toBe(space);
    expect((await call('remember_space_access', { path: space })).ok).toBe(true);
    await registerSpaces([space], space);
  });
});
