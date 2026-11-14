import { readFileSync } from 'node:fs';
import { startHost } from '../durable/host.mjs';
import * as model from './codec.mjs';
const asset = (path, type) => ({
  bytes: readFileSync(new URL(path, import.meta.url)),
  type,
});
await startHost({
  model,
  editorContexts: ['A', 'B'],
  htmlPath: new URL('../origin.html', import.meta.url),
  assets: {
    '/origin.js': asset('../dist/joined.js', 'text/javascript'),
    '/style.css': asset('../style.css', 'text/css'),
    '/tables.css': asset('../dist/tables.css', 'text/css'),
    '/prosemirror.css': asset('../dist/prosemirror.css', 'text/css'),
  },
});
