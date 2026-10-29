import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { EXISTING, bodyText, call, corruptBookmarkFor, onDisk, openNoteAndEdit, tempFiles } from './common';

describe('B2: the picked Space after quitting and relaunching', () => {
  it('reopens and saves again — access came from the saved bookmark', async () => {
    await browser.pause(3000);
    const registry = (await browser.execute(() => JSON.parse(localStorage.getItem('clutter.spaces.v1') ?? 'null'))) as { activePath: string };
    expect(registry.activePath).toBe(EXISTING);
    await openNoteAndEdit(testIds.sidebar.tab, ' b-three');
    await browser.waitUntil(() => onDisk(`${EXISTING}/Welcome.md`).includes(' b-three'), { timeout: 20000 });
    expect(onDisk(`${EXISTING}/Welcome.md`)).toMatch(/existing start\s*b-one b-two b-three/);
    expect(tempFiles(EXISTING)).toEqual([]);
    expect(await bodyText()).not.toContain('Couldn’t save');
    expect((await call('plugin:fs|read_dir', { path: '/Users/sivakuv3/Desktop' })).err).toContain("forbidden path");
  });

  after(() => corruptBookmarkFor(EXISTING));
});
