import { call } from '../specs-accept/common';
describe('diag: state after relaunch with a corrupted Documents entry', () => {
  it('prints', async () => {
    await browser.pause(4000);
    console.log('DOCS-ACCESS', JSON.stringify(await call('documents_access')));
    console.log('RESTORE', JSON.stringify(await call('restore_space_access')));
    console.log('DOCS-ACCESS-2', JSON.stringify(await call('documents_access')));
    console.log('READDIR', JSON.stringify(await call('plugin:fs|read_dir', { path: '/Users/sivakuv3/Documents' })).slice(0, 150));
    console.log('REGISTRY', JSON.stringify(await browser.execute(() => localStorage.getItem('clutter.spaces.v1'))));
  });
});
