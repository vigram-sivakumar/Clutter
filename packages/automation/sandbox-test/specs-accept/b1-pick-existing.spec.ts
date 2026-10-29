import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { EXISTING, REAL_DOCS, SPACE, call, onDisk, openNoteAndEdit, pressAfter, registerSpaces, tempFiles, typeAtEnd } from './common';

describe('B1: Open Existing Space through the system picker (first launch)', () => {
  before(() => {
    fs.mkdirSync(`${EXISTING}/.clutter`, { recursive: true });
    fs.writeFileSync(`${EXISTING}/Welcome.md`, '---\nid: note-existing\n---\nexisting start\n');
  });

  it('picks the folder, saves its access, opens it and saves repeatedly', async () => {
    await browser.pause(3000);
    pressAfter(5, 36);
    const picked = await call('plugin:dialog|open', { options: { directory: true, multiple: false, recursive: true, defaultPath: EXISTING } });
    expect(picked.ok).toBe(EXISTING);
    expect((await call('remember_space_access', { path: EXISTING })).ok).toBe(true);

    await registerSpaces([SPACE, EXISTING], EXISTING);
    await browser.refresh();
    await browser.pause(3000);
    await openNoteAndEdit(testIds.sidebar.tab, ' b-one');
    await browser.waitUntil(() => onDisk(`${EXISTING}/Welcome.md`).includes(' b-one'), { timeout: 20000 });
    await typeAtEnd(' b-two');
    await browser.waitUntil(() => onDisk(`${EXISTING}/Welcome.md`).includes(' b-two'), { timeout: 20000 });
    expect(tempFiles(EXISTING)).toEqual([]);
  });

  it('refuses a folder whose access cannot be saved (not in the picker grant)', async () => {
    const result = await call('remember_space_access', { path: '/Users/Shared' });
    expect(result.err).toContain('forbidden path');
    expect(REAL_DOCS).toBeTruthy();
  });
});
