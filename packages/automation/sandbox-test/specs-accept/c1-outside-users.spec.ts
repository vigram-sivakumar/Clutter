import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { OUTSIDE, SPACE, call, onDisk, openNoteAndEdit, pressAfter, registerSpaces, tempFiles, typeAtEnd } from './common';

describe('C1: a Space picked outside /Users and /Volumes', () => {
  before(() => {
    fs.mkdirSync(`${OUTSIDE}/.clutter`, { recursive: true });
    fs.writeFileSync(`${OUTSIDE}/Welcome.md`, '---\nid: note-outside\n---\noutside start\n');
  });

  it('picks the folder, saves its access, opens it and saves repeatedly', async () => {
    await browser.pause(3000);
    pressAfter(5, 36);
    const picked = await call('plugin:dialog|open', { options: { directory: true, multiple: false, recursive: true, defaultPath: OUTSIDE } });
    expect(picked.ok).toBe(OUTSIDE);
    expect((await call('remember_space_access', { path: OUTSIDE })).ok).toBe(true);

    await registerSpaces([SPACE, OUTSIDE], OUTSIDE);
    // The workspace file inside the dot folder is reachable through the plugin: the Space really opened.
    await browser.refresh();
    await browser.pause(3000);
    await openNoteAndEdit(testIds.sidebar.tab, ' c-one');
    await browser.waitUntil(() => onDisk(`${OUTSIDE}/Welcome.md`).includes(' c-one'), { timeout: 20000 });
    await typeAtEnd(' c-two');
    await browser.waitUntil(() => onDisk(`${OUTSIDE}/Welcome.md`).includes(' c-two'), { timeout: 20000 });
    expect(tempFiles(OUTSIDE)).toEqual([]);
  });
});
