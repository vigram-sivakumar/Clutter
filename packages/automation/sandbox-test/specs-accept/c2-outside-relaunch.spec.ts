import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { OUTSIDE, bodyText, call, corruptBookmarkFor, onDisk, openNoteAndEdit, tempFiles } from './common';

describe('C2: the outside Space after quitting and relaunching', () => {
  it('reopens and saves again — access came from the saved bookmark', async () => {
    await browser.pause(3000);
    const registry = (await browser.execute(() => JSON.parse(localStorage.getItem('clutter.spaces.v1') ?? 'null'))) as { activePath: string };
    expect(registry.activePath).toBe(OUTSIDE);
    await openNoteAndEdit(testIds.sidebar.tab, ' c-three');
    await browser.waitUntil(() => onDisk(`${OUTSIDE}/Welcome.md`).includes(' c-three'), { timeout: 20000 });
    expect(onDisk(`${OUTSIDE}/Welcome.md`)).toMatch(/outside start\s*c-one c-two c-three/);
    expect(tempFiles(OUTSIDE)).toEqual([]);
    expect(await bodyText()).not.toContain('Couldn’t save');
    expect((await call('plugin:fs|read_dir', { path: '/Users/sivakuv3/Desktop' })).err).toMatch(/forbidden path|Operation not permitted/);
  });

  after(() => corruptBookmarkFor(OUTSIDE));
});
