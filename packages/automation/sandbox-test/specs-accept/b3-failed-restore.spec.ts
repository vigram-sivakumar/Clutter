import { EXISTING, bodyText, call, onDisk, pressAfter } from './common';

describe('B3: the picked Space when its saved access cannot be restored', () => {
  it('asks for the folder again instead of opening it from anywhere else', async () => {
    await browser.pause(4000);
    const text = await bodyText();
    console.log('B3 BODY', JSON.stringify(text.slice(0, 600)));
    // The unreachable Space is not opened (its text is not on screen) and not replaced: it stays registered.
    expect(text).not.toContain('b-three');
    const registry = (await browser.execute(() => JSON.parse(localStorage.getItem('clutter.spaces.v1') ?? 'null'))) as { paths: string[] };
    expect(registry.paths).toContain(EXISTING);
    const listing = await call('plugin:fs|read_dir', { path: EXISTING });
    expect(listing.err).toContain('Operation not permitted');
    expect(onDisk(`${EXISTING}/Welcome.md`)).toContain('b-three');
  });

  it('picking it again restores access', async () => {
    pressAfter(5, 36);
    const picked = await call('plugin:dialog|open', { options: { directory: true, multiple: false, recursive: true, defaultPath: EXISTING } });
    expect(picked.ok).toBe(EXISTING);
    expect((await call('remember_space_access', { path: EXISTING })).ok).toBe(true);
    expect((await call('plugin:fs|read_dir', { path: EXISTING })).err).toBeUndefined();
  });
});
