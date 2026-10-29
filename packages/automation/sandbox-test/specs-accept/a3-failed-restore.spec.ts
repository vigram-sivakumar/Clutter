import fs from 'node:fs';
import { CONTAINER, NAME, REAL_DOCS, SPACE, STORE, bodyText, call, onDisk, pressAfter } from './common';

describe('A3: when the saved Documents access cannot be restored', () => {
  it('does not pretend: Documents is not accessible, the Space is presented as needing its folder again, nothing is created elsewhere', async () => {
    await browser.pause(4000);
    expect((await call('documents_access')).ok).toBe('needed');
    const text = await bodyText();
    console.log('A3 BODY', JSON.stringify(text.slice(0, 600)));
    // The Space is not opened from anywhere else: the app is back at the start screen and the Space is still listed.
    expect(text).toContain('Select a folder');
    const registry = (await browser.execute(() => JSON.parse(localStorage.getItem('clutter.spaces.v1') ?? 'null'))) as { paths: string[] };
    expect(registry.paths).toContain(SPACE);
    expect((await call('create_space_folder', { name: `${NAME}4` })).err).toContain('documentsAccessNeeded');
    expect(fs.existsSync(`${CONTAINER}/Documents/${NAME}4`)).toBe(false);
    expect(onDisk(`${SPACE}/Welcome.md`)).toContain('five');
  });

  it('selecting Documents again restores access, and the Space works', async () => {
    pressAfter(5, 36);
    expect((await call('request_documents_access')).ok).toBe('granted');
    expect((await call('documents_access')).ok).toBe('granted');
    const created = await call('create_space_folder', { name: `${NAME}5` });
    expect(created.ok).toBe(`${SPACE}5`);
    fs.rmSync(`${SPACE}5`, { recursive: true });
    expect(JSON.parse(fs.readFileSync(STORE, 'utf8')).entries[REAL_DOCS]).not.toBe('deadbeef');
  });
});
