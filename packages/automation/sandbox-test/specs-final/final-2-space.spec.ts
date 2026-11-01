import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { NAME, OUT, SPACE, bodyText, call, callWithBody, onDisk, openFirstNote, registerSpaces, tempFiles, typeAtEnd } from './common';

// Launch 2: Create a Space in the user's real Documents (authorization restored from the bookmark the user granted this
// test identity earlier: no panel), open it, save repeatedly, see an external edit, then exercise every replacement
// command inside an authorized Space, including a link that leaves it and the Space's own folder.
const NOTE = `${SPACE}/Welcome.md`;
const SECRET = `${OUT}/secret.md`;

describe('F2: a Space created in the real Documents folder, in the packaged sandboxed app', () => {
  before(() => {
    if (fs.existsSync(SPACE)) throw new Error(`refusing to run: ${SPACE} already exists`);
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(SECRET, 'ORIGINAL SECRET');
  });

  it('has Documents access restored from the saved bookmark, with no prompt', async () => {
    await browser.pause(3000);
    const restored = await call('restore_space_access');
    console.log('FINAL restore_space_access', JSON.stringify(restored.ok ?? restored.err).slice(0, 300));
    const status = (await call('documents_access')).ok;
    console.log('FINAL documents_access', status);
    expect(status).toBe('granted');
  });

  it('creates ~/Documents/<name> through the native command, and not in its own container', async () => {
    const created = await call('create_space_folder', { name: NAME });
    expect(created.ok).toBe(SPACE);
    expect(fs.statSync(SPACE).isDirectory()).toBe(true);
    fs.writeFileSync(`${SPACE}/marker.txt`, 'mine');
    const again = await call('create_space_folder', { name: NAME });
    expect(again.err).toBeDefined(); // an existing folder is never adopted
    expect(fs.readFileSync(`${SPACE}/marker.txt`, 'utf8')).toBe('mine');
    fs.rmSync(`${SPACE}/marker.txt`);
  });

  it('opens it (its filesystem is classified as APFS) and saves the same note repeatedly through the atomic writer', async () => {
    fs.mkdirSync(`${SPACE}/.clutter`, { recursive: true });
    fs.writeFileSync(NOTE, '---\nid: note-welcome\n---\nstart\n');
    await registerSpaces([SPACE], SPACE);
    await browser.refresh();
    await browser.pause(3000);
    await openFirstNote(testIds.sidebar.tab);
    expect(await bodyText()).not.toContain('can only save safely');
    await typeAtEnd(' one');
    let previous = fs.statSync(NOTE).ino;
    await browser.waitUntil(() => onDisk(NOTE).includes(' one'), { timeout: 20000 });
    for (const text of [' two', ' three', ' four']) {
      await typeAtEnd(text);
      await browser.waitUntil(() => onDisk(NOTE).includes(text), { timeout: 20000 });
      const now = fs.statSync(NOTE).ino;
      expect(now).not.toBe(previous); // replaced whole each time
      previous = now;
    }
    expect(onDisk(NOTE)).toMatch(/start\s*one two three four/);
    expect(tempFiles(SPACE)).toEqual([]);
    expect(await bodyText()).not.toContain('Couldn’t save');
  });

  it('shows an external edit made while the Space is open (file watching)', async () => {
    fs.writeFileSync(`${SPACE}/.ext-tmp`, `${onDisk(NOTE)}EXTERNAL-LINE\n`);
    fs.renameSync(`${SPACE}/.ext-tmp`, NOTE);
    await browser.waitUntil(async () => ((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string).includes('EXTERNAL-LINE'), {
      timeout: 20000,
      timeoutMsg: 'the editor never showed the external edit',
    });
  });

  describe('inside the authorized Space', () => {
    before(() => {
      fs.mkdirSync(`${SPACE}/Ops`, { recursive: true });
      fs.writeFileSync(`${SPACE}/Ops/existing.md`, 'EXISTING');
      fs.writeFileSync(`${SPACE}/Ops/source.md`, 'SOURCE');
      fs.writeFileSync(`${SPACE}/Ops/existing.bin`, 'EXISTING BYTES');
      fs.symlinkSync(OUT, `${SPACE}/Ops/exit-dir`);
    });

    it('the old plugin commands cannot overwrite, replace, delete or create here either: the original bypass, closed', async () => {
      const before = onDisk(NOTE);
      for (const answer of [
        await callWithBody('plugin:fs|write_text_file', NOTE, 'OVERWRITTEN'),
        await callWithBody('plugin:fs|write_text_file', NOTE, ''),
        await call('plugin:fs|rename', { oldPath: `${SPACE}/Ops/source.md`, newPath: NOTE, options: {} }),
        await call('plugin:fs|remove', { path: NOTE, options: {} }),
        await call('plugin:fs|mkdir', { path: `${SPACE}/Ops/exit-dir/made`, options: { recursive: true } }),
      ]) {
        expect(answer.err ?? '').toContain('not allowed');
      }
      expect(onDisk(NOTE)).toBe(before);
      expect(fs.existsSync(`${OUT}/made`)).toBe(false);
    });

    it('creates folders (recursively, and exclusively), and an existing folder is never entered by the exclusive form', async () => {
      expect((await call('create_directory', { path: `${SPACE}/Ops/a/b/c`, recursive: true })).err).toBeUndefined();
      expect(fs.statSync(`${SPACE}/Ops/a/b/c`).isDirectory()).toBe(true);
      expect((await call('create_directory', { path: `${SPACE}/Ops/a`, recursive: false })).err ?? '').toMatch(/File exists|os error 17/);
      expect((await call('create_directory', { path: `${SPACE}/Ops/fresh`, recursive: false })).err).toBeUndefined();
    });

    it('never replaces an existing file when moving, copying or writing: the existing bytes survive', async () => {
      expect((await call('move_file_no_clobber', { from: `${SPACE}/Ops/source.md`, to: `${SPACE}/Ops/existing.md` })).err ?? '').toMatch(/EEXIST|exists/i);
      expect((await call('copy_file_no_clobber', { from: `${SPACE}/Ops/source.md`, to: `${SPACE}/Ops/existing.md` })).err ?? '').toMatch(/EEXIST|exists/i);
      expect((await callWithBody('write_file_no_clobber', `${SPACE}/Ops/existing.bin`, 'NEW BYTES')).err ?? '').toMatch(/EEXIST|exists/i);
      expect(onDisk(`${SPACE}/Ops/existing.md`)).toBe('EXISTING');
      expect(onDisk(`${SPACE}/Ops/source.md`)).toBe('SOURCE');
      expect(onDisk(`${SPACE}/Ops/existing.bin`)).toBe('EXISTING BYTES');
      expect(tempFiles(`${SPACE}/Ops`)).toEqual([]);
      // To a free name, the same commands work.
      expect((await call('move_file_no_clobber', { from: `${SPACE}/Ops/source.md`, to: `${SPACE}/Ops/moved.md` })).err).toBeUndefined();
      expect((await call('copy_file_no_clobber', { from: `${SPACE}/Ops/moved.md`, to: `${SPACE}/Ops/copied.md` })).err).toBeUndefined();
      expect((await callWithBody('write_file_no_clobber', `${SPACE}/Ops/written.bin`, 'BYTES')).err).toBeUndefined();
      expect([onDisk(`${SPACE}/Ops/moved.md`), onDisk(`${SPACE}/Ops/copied.md`), onDisk(`${SPACE}/Ops/written.bin`)]).toEqual(['SOURCE', 'SOURCE', 'BYTES']);
    });

    it('a link inside the Space cannot carry a create, delete or move out of it', async () => {
      const refusals = [
        await call('create_directory', { path: `${SPACE}/Ops/exit-dir/made`, recursive: true }),
        await call('create_directory', { path: `${SPACE}/Ops/exit-dir/made`, recursive: false }),
        await call('delete_path', { path: `${SPACE}/Ops/exit-dir/secret.md` }),
        await call('move_file_no_clobber', { from: `${SPACE}/Ops/moved.md`, to: `${SPACE}/Ops/exit-dir/out.md` }),
        await call('copy_file_no_clobber', { from: `${SPACE}/Ops/moved.md`, to: `${SPACE}/Ops/exit-dir/copy.md` }),
        await callWithBody('write_file_no_clobber', `${SPACE}/Ops/exit-dir/new.bin`, 'x'),
        await call('create_directory', { path: `${OUT}/made`, recursive: true }),
      ];
      console.log('FINAL link refusals', JSON.stringify(refusals.map((r) => r.err ?? r.ok)));
      for (const answer of refusals) expect(answer.err ?? '').toContain('forbidden path');
      expect(fs.readdirSync(OUT)).toEqual(['secret.md']);
      expect(onDisk(SECRET)).toBe('ORIGINAL SECRET');
      expect(fs.existsSync(`${SPACE}/Ops/moved.md`)).toBe(true);
    });

    // KNOWN RESULT (first packaged run): the step that unlinks the link to the outside fails, because the real scope follows
    // the link and refuses it whole (fail closed). final-3 pins that behavior; everything else in this file passed.
    it('deleting is exact: a file, a folder only when asked, a link is unlinked without touching what it points at', async () => {
      expect((await call('delete_path', { path: `${SPACE}/Ops/a`, recursive: false })).err).toBeDefined(); // not empty
      expect(fs.existsSync(`${SPACE}/Ops/a/b/c`)).toBe(true);
      expect((await call('delete_path', { path: `${SPACE}/Ops/a`, recursive: true })).err).toBeUndefined();
      expect((await call('delete_path', { path: `${SPACE}/Ops/written.bin` })).err).toBeUndefined();
      expect((await call('delete_path', { path: `${SPACE}/Ops/exit-dir` })).err).toBeUndefined(); // the link itself
      expect(fs.existsSync(`${SPACE}/Ops/exit-dir`)).toBe(false);
      expect(onDisk(SECRET)).toBe('ORIGINAL SECRET');
      expect((await call('delete_path', { path: `${SPACE}/Ops/nothing-here.md` })).err ?? '').toMatch(/No such file|os error 2/);
    });

    it('the Space\'s own folder cannot be deleted through delete_path, recursively or not, and nothing in it is touched', async () => {
      const listing = fs.readdirSync(SPACE).sort();
      const answers = [
        await call('delete_path', { path: SPACE, recursive: false }),
        await call('delete_path', { path: SPACE, recursive: true }),
        await call('delete_path', { path: `${SPACE}/`, recursive: true }),
      ];
      console.log('FINAL space-root', JSON.stringify(answers.map((a) => a.err ?? a.ok)));
      for (const answer of answers) expect(answer.err ?? '').toMatch(/is a Space|holds one/);
      expect(fs.readdirSync(SPACE).sort()).toEqual(listing);
      expect(onDisk(NOTE)).toContain('four');
      // The parent that holds a Space is covered by the Rust tests on scratch folders. It is deliberately not tried
      // here: a bug in the safeguard would then delete the user's real Documents folder.
    });
  });

  after(() => {
    fs.rmSync(OUT, { recursive: true, force: true });
  });
});
