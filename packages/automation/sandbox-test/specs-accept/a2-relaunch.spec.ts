import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { CONTAINER, NAME, REAL_DOCS, SPACE, bodyText, call, corruptBookmarkFor, onDisk, openNoteAndEdit, tempFiles } from './common';

describe('A2: after quitting and relaunching', () => {
  it('Documents access is restored with no prompt, and the Space opens from the real Documents', async () => {
    await browser.pause(3000);
    expect((await call('documents_access')).ok).toBe('granted');
    const registry = (await browser.execute(() => JSON.parse(localStorage.getItem('clutter.spaces.v1') ?? 'null'))) as { activePath: string };
    expect(registry.activePath).toBe(SPACE);

    const before = JSON.parse(fs.readFileSync(`${CONTAINER}/a1.json`, 'utf8')).note as string;
    await openNoteAndEdit(testIds.sidebar.tab, ' five');
    const content = (await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string;
    expect(content).toContain('one two three four');
    await browser.waitUntil(() => onDisk(`${SPACE}/Welcome.md`).includes(' five'), { timeout: 20000 });
    expect(onDisk(`${SPACE}/Welcome.md`)).toContain(before.split('---\n')[2].split('EXTERNAL')[0].trim().slice(0, 5));
    expect(tempFiles(SPACE)).toEqual([]);
    expect(await bodyText()).not.toContain('Couldn’t save');
    expect(fs.existsSync(`${CONTAINER}/Documents/${NAME}`)).toBe(false);
  });

  it('creates another Space with no prompt', async () => {
    const created = await call('create_space_folder', { name: `${NAME}3` });
    expect(created.ok).toBe(`${SPACE}3`);
    fs.rmSync(`${SPACE}3`, { recursive: true });
  });

  // Between launches: the saved access for Documents becomes unusable, as it would if the bookmark went bad.
  after(() => corruptBookmarkFor(REAL_DOCS));
});
