import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/**
 * Module-scoped: pdfjs-dist requires exactly one `workerSrc` assignment
 * before the first `getDocument()` call, and ES module caching means this
 * file's body only runs once no matter how many consumers import it.
 * Shared by `usePdfDocument.ts` (`PdfViewer`) and the inline Markdown PDF
 * embed widget (`codemirror/pdf/PdfEmbedWidget.ts`, a raw-DOM CodeMirror
 * widget that calls `getDocument()` directly, with no React hook available
 * to it) — the one place this assignment happens, so a second `pdfjs-dist`
 * consumer never risks configuring the worker twice or differently.
 */
GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
