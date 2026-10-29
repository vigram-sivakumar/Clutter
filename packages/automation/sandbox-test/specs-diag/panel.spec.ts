import { call } from '../specs-accept/common';
describe('diag: where does the Documents panel appear', () => {
  it('opens the panel and waits', async () => {
    await browser.pause(3000);
    console.log('REQUEST', JSON.stringify(await call('request_documents_access')));
  });
});
