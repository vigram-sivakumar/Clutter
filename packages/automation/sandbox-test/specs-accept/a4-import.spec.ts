import fs from 'node:fs';
import { ASSETS, SPACE, call, pressAfter, writeTinyAssets } from './common';

describe('A4: import an image and a PDF through the system file picker (Space in the real Documents)', () => {
  before(() => writeTinyAssets());

  for (const [dir, file] of [['img', 'pic.png'], ['pdf', 'doc.pdf']]) {
    it(`imports ${file}`, async () => {
      await browser.pause(3000);
      fs.mkdirSync(`${SPACE}/Assets`, { recursive: true });
      pressAfter(5, 124, 36);
      const picked = await call('plugin:dialog|open', { options: { multiple: false, directory: false, defaultPath: `${ASSETS}/${dir}` } });
      expect(picked.ok).toBe(`${ASSETS}/${dir}/${file}`);
      const copied = await call('plugin:fs|copy_file', { fromPath: picked.ok, toPath: `${SPACE}/Assets/${file}`, options: {} });
      expect(copied.err).toBeUndefined();
      expect(fs.readFileSync(`${SPACE}/Assets/${file}`).equals(fs.readFileSync(`${ASSETS}/${dir}/${file}`))).toBe(true);
    });
  }
});
