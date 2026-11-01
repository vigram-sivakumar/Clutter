import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { REAL_DOCS, openNoteNamed } from './common';

const SPACE = `${REAL_DOCS}/ClutterSbxFinalCrashB`;
describe('F5 diagnostic', () => {
  it('captures the failing image URL and what the asset protocol answers for it', async () => {
    await browser.pause(3000);
    await browser.execute(() => {
      (window as any).__errs = [];
      window.addEventListener('error', (e) => { const t = e.target as HTMLElement; if (t && t.tagName === 'IMG') (window as any).__errs.push(`img-error ${(t as HTMLImageElement).src}`); }, true);
      document.addEventListener('securitypolicyviolation', (e) => (window as any).__errs.push(`csp ${e.violatedDirective} ${e.blockedURI}`));
    });
    await openNoteNamed(testIds.sidebar.tab, 'Media');
    await browser.pause(6000);
    const errs = (await browser.execute(() => (window as any).__errs)) as string[];
    console.log('FINAL errs', JSON.stringify(errs));
    const direct = await browser.executeAsync((path: string, done: (v: unknown) => void) => {
      const url = (window as any).__TAURI_INTERNALS__.convertFileSrc(path);
      fetch(url).then((r) => done({ url, status: r.status, type: r.headers.get('content-type') }), (e) => done({ url, error: String(e) }));
    }, `${SPACE}/Assets/pic.png`);
    console.log('FINAL direct', JSON.stringify(direct));
    const img = await browser.executeAsync((path: string, done: (v: unknown) => void) => {
      const url = (window as any).__TAURI_INTERNALS__.convertFileSrc(path);
      const i = new Image(); i.onload = () => done({ loaded: true, w: i.naturalWidth }); i.onerror = () => done({ loaded: false }); i.src = url;
    }, `${SPACE}/Assets/pic.png`);
    console.log('FINAL new Image()', JSON.stringify(img));
  });
});
