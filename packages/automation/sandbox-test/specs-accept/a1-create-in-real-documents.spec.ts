import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { ASSETS, CONTAINER, NAME, REAL_DOCS, REAL_HOME, SPACE, bodyText, call, onDisk, openNoteAndEdit, pressAfter, registerSpaces, tempFiles, typeAtEnd, writeTinyAssets } from './common';

describe('A1: Create a Space in the real Documents folder, edit, rename, import (first launch)', () => {
  before(() => {
    if (fs.existsSync(SPACE)) throw new Error(`refusing to run: ${SPACE} already exists`);
    writeTinyAssets();
  });

  it('is sandboxed and names the real Documents and home', async () => {
    await browser.pause(3000);
    const info = (await call('sandbox_info')).ok;
    expect(info).toEqual({ sandboxed: true, realHome: REAL_HOME, documents: REAL_DOCS });
    expect((await call('documents_access')).ok).toBe('needed');
  });

  it('creates nothing — not even in its container — until Documents is authorized', async () => {
    const result = await call('create_space_folder', { name: NAME });
    expect(result.err).toContain('documentsAccessNeeded');
    expect(fs.existsSync(SPACE)).toBe(false);
    expect(fs.existsSync(`${CONTAINER}/Documents/${NAME}`)).toBe(false);
  });

  it('cancelling the authorization creates nothing and asks again next time', async () => {
    pressAfter(5, 53);
    expect((await call('request_documents_access')).ok).toBe('cancelled');
    expect((await call('create_space_folder', { name: NAME })).err).toContain('documentsAccessNeeded');
    expect(fs.existsSync(SPACE)).toBe(false);
    expect(fs.existsSync(`${CONTAINER}/Documents/${NAME}`)).toBe(false);
  });

  it('authorizing Documents once lets Create make ~/Documents/<name>, and later creations ask nothing', async () => {
    pressAfter(5, 36);
    expect((await call('request_documents_access')).ok).toBe('granted');
    const created = await call('create_space_folder', { name: NAME });
    expect(created.ok).toBe(SPACE);
    expect(fs.statSync(SPACE).isDirectory()).toBe(true);
    expect(fs.existsSync(`${CONTAINER}/Documents/${NAME}`)).toBe(false);

    const second = await call('create_space_folder', { name: `${NAME}2` });
    expect(second.ok).toBe(`${SPACE}2`);
    fs.rmSync(`${SPACE}2`, { recursive: true });
  });

  it('edits and saves the same note repeatedly through the atomic writer', async () => {
    fs.mkdirSync(`${SPACE}/.clutter`, { recursive: true });
    fs.writeFileSync(`${SPACE}/Welcome.md`, '---\nid: note-welcome\n---\nstart\n');
    await registerSpaces([SPACE], SPACE);
    await browser.refresh();
    await browser.pause(3000);
    await openNoteAndEdit(testIds.sidebar.tab, ' one');
    let previous = fs.statSync(`${SPACE}/Welcome.md`).ino;
    await browser.waitUntil(() => onDisk(`${SPACE}/Welcome.md`).includes(' one'), { timeout: 20000 });
    for (const text of [' two', ' three', ' four']) {
      await typeAtEnd(text);
      await browser.waitUntil(() => onDisk(`${SPACE}/Welcome.md`).includes(text), { timeout: 20000 });
      const now = fs.statSync(`${SPACE}/Welcome.md`).ino;
      expect(now).not.toBe(previous); // replaced whole each time
      previous = now;
    }
    expect(onDisk(`${SPACE}/Welcome.md`)).toMatch(/start\s*one two three four/);
    expect(tempFiles(SPACE)).toEqual([]);
    expect(await bodyText()).not.toContain('Couldn’t save');
  });

  it('shows an external edit made while the Space is open (file watching)', async () => {
    const note = `${SPACE}/Welcome.md`;
    const external = `${onDisk(note)}EXTERNAL-LINE\n`;
    fs.writeFileSync(`${SPACE}/.ext-tmp`, external);
    fs.renameSync(`${SPACE}/.ext-tmp`, note);
    await browser.waitUntil(async () => ((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string).includes('EXTERNAL-LINE'), { timeout: 20000, timeoutMsg: 'the editor never showed the external edit' });
  });

  it('renames and deletes files inside the Space', async () => {
    expect((await call('plugin:fs|rename', { oldPath: `${SPACE}/Welcome.md`, newPath: `${SPACE}/Renamed.md`, options: {} })).err).toBeUndefined();
    expect(fs.existsSync(`${SPACE}/Renamed.md`)).toBe(true);
    expect((await call('plugin:fs|rename', { oldPath: `${SPACE}/Renamed.md`, newPath: `${SPACE}/Welcome.md`, options: {} })).err).toBeUndefined();
    fs.writeFileSync(`${SPACE}/Scratch.md`, 'x');
    expect((await call('plugin:fs|remove', { path: `${SPACE}/Scratch.md`, options: {} })).err).toBeUndefined();
    expect(fs.existsSync(`${SPACE}/Scratch.md`)).toBe(false);
  });

  it('imports an image and a PDF through the system file picker', async () => {
    fs.mkdirSync(`${SPACE}/Assets`, { recursive: true });
    for (const [dir, file] of [['img', 'pic.png'], ['pdf', 'doc.pdf']]) {
      pressAfter(5, 124, 36);
      const picked = await call('plugin:dialog|open', { options: { multiple: false, directory: false, defaultPath: `${ASSETS}/${dir}` } });
      expect(picked.ok).toBe(`${ASSETS}/${dir}/${file}`);
      const copied = await call('plugin:fs|copy_file', { fromPath: picked.ok, toPath: `${SPACE}/Assets/${file}`, options: {} });
      expect(copied.err).toBeUndefined();
      expect(fs.readFileSync(`${SPACE}/Assets/${file}`).equals(fs.readFileSync(`${ASSETS}/${dir}/${file}`))).toBe(true);
    }
  });

  it('keeps the registry for the relaunch', async () => {
    fs.writeFileSync(`${CONTAINER}/a1.json`, JSON.stringify({ note: onDisk(`${SPACE}/Welcome.md`) }));
  });
});
