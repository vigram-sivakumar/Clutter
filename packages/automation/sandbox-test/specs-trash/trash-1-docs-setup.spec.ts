import fs from 'node:fs';
import { SPACE_PATHS, call, pressAfter, registerSpaces, seedFixture } from './common';

/** Launch 1 of the Documents-Space pair: make sure Documents is authorized, create the Space, seed it, register it. */
describe('Trash setup: a Space inside Documents', () => {
  const space = SPACE_PATHS.docs;

  it('refuses to reuse a Space folder left by an earlier run', () => {
    if (fs.existsSync(space)) throw new Error(`refusing to run: ${space} already exists (run trash-7-cleanup first)`);
  });

  it('has Documents access (attended only if the saved access is missing)', async () => {
    await browser.pause(3000);
    if ((await call('documents_access')).ok !== 'granted') {
      pressAfter(36); // Return: accept the Documents panel
      expect((await call('request_documents_access')).ok).toBe('granted');
    }
  });

  it('creates the Space through the app, seeds it and registers it', async () => {
    expect((await call('create_space_folder', { name: space.split('/').pop() })).ok).toBe(space);
    seedFixture('docs');
    await registerSpaces([space], space);
  });
});
