import fs from 'node:fs';
import { testIds } from '../../../../apps/app/src/shared/testing/selectors';
import { REAL_DOCS, bodyText, openNoteNamed } from './common';

// Launch 6: an image and a PDF (pdf.js, through its worker) embedded in a note, rendered by the packaged webview under
// the packaged CSP, plus navigation between notes. The files are made by this spec (no panel); the Space is the
// disposable one the crash spec made and the app reopens on its own.
const SPACE = `${REAL_DOCS}/ClutterSbxFinalCrashB`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF\n';

describe('F5: images, PDFs and navigation under the packaged CSP', () => {
  before(() => {
    if (!fs.existsSync(`${SPACE}/Welcome.md`)) throw new Error('the crash Space is missing; run the crash specs first');
    fs.mkdirSync(`${SPACE}/Assets`, { recursive: true });
    fs.writeFileSync(`${SPACE}/Assets/pic.png`, PNG);
    fs.writeFileSync(`${SPACE}/Assets/doc.pdf`, PDF);
    fs.writeFileSync(`${SPACE}/Media.md`, '---\nid: note-media\n---\nImage:\n\n![[Assets/pic.png]]\n\nPDF:\n\n![[Assets/doc.pdf]]\n');
  });

  it('shows the embedded image and renders the PDF page, with no policy violation reported', async () => {
    await browser.pause(4000);
    await openNoteNamed(testIds.sidebar.tab, 'Media');
    await browser.execute(() => {
      (window as any).__violations = [];
      document.addEventListener('securitypolicyviolation', (event) => (window as any).__violations.push(`${event.violatedDirective}|${event.blockedURI}`));
    });
    const image = await browser.waitUntil(
      async () =>
        (await browser.execute(() => {
          const img = document.querySelector('.cm-content img') as HTMLImageElement | null;
          return img && img.complete && img.naturalWidth > 0 ? `${img.naturalWidth}x${img.naturalHeight} ${img.src.split(':')[0]}` : null;
        })) as string | null,
      { timeout: 20000, timeoutMsg: 'the image never loaded' }
    );
    console.log('FINAL image', image);
    const pdf = await browser.waitUntil(
      async () =>
        (await browser.execute(() => {
          const canvas = document.querySelector('.cm-pdf-embed canvas') as HTMLCanvasElement | null;
          return canvas && canvas.width > 0 ? `${canvas.width}x${canvas.height}` : null;
        })) as string | null,
      { timeout: 30000, timeoutMsg: 'the PDF page never rendered' }
    );
    console.log('FINAL pdf canvas', pdf);
    const violations = (await browser.execute(() => (window as any).__violations)) as string[];
    console.log('FINAL violations', JSON.stringify(violations));
    expect(violations).toEqual([]);
    expect(await bodyText()).not.toContain('Couldn’t');
  });

  it('navigates between notes and back', async () => {
    await openNoteNamed(testIds.sidebar.tab, 'Welcome');
    expect(((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string)).toContain('Before the crash');
    await openNoteNamed(testIds.sidebar.tab, 'Media');
    expect(((await browser.execute(() => document.querySelector('.cm-content')?.textContent)) as string)).toContain('Image:');
  });
});
