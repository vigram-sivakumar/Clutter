import fs from 'node:fs';
import { call, bodyText } from './common';

// Read-only: what the first screen is made of. Clicks nothing, opens no panel.
describe('attended 0: the Welcome screen of a fresh identity', () => {
  it('records the screen, the buttons and the authorization state', async () => {
    await browser.pause(4000);
    console.log('FINAL sandbox_info', JSON.stringify((await call('sandbox_info')).ok));
    console.log('FINAL documents_access', JSON.stringify((await call('documents_access')).ok));
    console.log('FINAL body', (await bodyText()).replace(/\n+/g, ' | ').slice(0, 400));
    const buttons = await browser.execute(() => [...document.querySelectorAll('button, [role="button"], input, textarea')].map((e) => `${e.tagName}:${(e.textContent ?? '').trim().slice(0, 40) || (e as HTMLInputElement).placeholder || e.getAttribute('aria-label') || ''}`));
    console.log('FINAL controls', JSON.stringify(buttons));
    const shot = process.env.CLUTTER_SHOT_DIR;
    if (shot) {
      fs.mkdirSync(shot, { recursive: true });
      await browser.saveScreenshot(`${shot}/00-welcome.png`);
    }
  });
});
