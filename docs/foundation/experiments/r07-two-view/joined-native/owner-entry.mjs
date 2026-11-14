import { readFileSync } from 'node:fs';
import { startHost } from '../durable/host.mjs';
import * as model from './model.mjs';
const asset = (name, type) => ({
  bytes: readFileSync(new URL('./web/' + name, import.meta.url)),
  type,
});
await startHost({
  model,
  requireSupervisor: true,
  nativeFullSync: process.platform === 'darwin',
  editorContexts: ['A', 'B'],
  htmlPath: new URL('./web/origin.html', import.meta.url),
  assets: {
    '/origin.js': asset('origin.js', 'text/javascript'),
    '/style.css': asset('style.css', 'text/css'),
    '/tables.css': asset('tables.css', 'text/css'),
    '/prosemirror.css': asset('prosemirror.css', 'text/css'),
  },
});
