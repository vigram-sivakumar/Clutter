interface Env { readonly RELEASES: R2Bucket; }

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:app\.tar\.gz|dmg)$/;

function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' } });
  const path = new URL(request.url).pathname;
  let key: string;
  let contentType: string;
  let cacheControl: string;
  if (path === '/latest.json') {
    key = 'latest.json'; contentType = 'application/json; charset=utf-8'; cacheControl = 'no-store, max-age=0';
  } else {
    const match = /^\/releases\/([^/]+)$/.exec(path);
    const filename = match?.[1];
    if (!filename || !FILE_NAME.test(filename)) return textResponse(404, 'Not found');
    key = 'releases/' + filename;
    contentType = filename.endsWith('.dmg') ? 'application/x-apple-diskimage' : 'application/gzip';
    cacheControl = 'public, max-age=31536000, immutable';
  }
  const object = await env.RELEASES.get(key);
  if (!object) return textResponse(404, 'Not found');
  const headers = new Headers({ 'Cache-Control': cacheControl, 'Content-Type': contentType, 'Content-Length': String(object.size), ETag: object.httpEtag, 'X-Content-Type-Options': 'nosniff' });
  object.writeHttpMetadata(headers);
  if (key !== 'latest.json') headers.set('Content-Disposition', 'attachment');
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

export default { fetch: (request: Request, env: Env) => handle(request, env) } satisfies ExportedHandler<Env>;