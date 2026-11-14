import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('dist');
export function server(port = 4178, assetRoot = root) {
  const app = createServer(async (req, res) => {
    // Only fixed built artifacts. No path traversal or app-vault access.
    const name = new URL(req.url, 'http://localhost').pathname;
    const files = {
      '/origin': 'origin.html',
      '/origin.js': 'origin.js',
      '/control': 'control.html',
      '/control.js': 'control.js',
      '/': 'index.html',
      '/app.js': 'app.js',
      '/app.js.map': 'app.js.map',
      '/style.css': 'style.css',
      '/prosemirror.css': 'prosemirror.css',
      '/tables.css': 'tables.css',
    };
    if (!files[name]) {
      res.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(resolve(assetRoot, files[name]));
      res.setHeader(
        'Content-Type',
        { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[
          extname(files[name])
        ] ?? 'application/json'
      );
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'"
      );
      res.end(bytes);
    } catch {
      res.writeHead(500).end();
    }
  });
  return new Promise((resolve) =>
    app.listen(port, '127.0.0.1', () => resolve(app))
  );
}
if (process.argv[1]?.endsWith('/serve.mjs')) {
  const app = await server();
  console.log('Experiment: http://127.0.0.1:' + app.address().port);
}
