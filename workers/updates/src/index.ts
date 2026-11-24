interface Env { readonly RELEASES: R2Bucket; }

const LEGACY_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:app\.tar\.gz|dmg)$/;
const SPARKLE_FILE = /^Clutter_beta_[0-9]+\.[0-9]+\.[0-9]+_aarch64\.(?:zip|dmg)$/;
const UNIVERSAL_FILE = /^Clutter_[0-9]+\.[0-9]+\.[0-9]+_universal\.(?:zip|dmg)$/;
const DELTA_FILE = /^Clutter_[0-9]+_to_[0-9]+_universal\.delta$/;
const NO_CACHE = 'no-store, max-age=0';

function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Cache-Control': NO_CACHE, 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': NO_CACHE } });
  const path = new URL(request.url).pathname;
  let key: string;
  let contentType: string;
  let attachment = false;
  if (path === '/latest.json') {
    key = 'latest.json'; contentType = 'application/json; charset=utf-8';
  } else if (path === '/appcast.xml') {
    key = 'appcast.xml'; contentType = 'application/rss+xml; charset=utf-8';
  } else {
    const match = /^\/releases\/([^/]+)$/.exec(path);
    const filename = match?.[1];
    if (!filename || (!LEGACY_FILE.test(filename) && !SPARKLE_FILE.test(filename) && !UNIVERSAL_FILE.test(filename) && !DELTA_FILE.test(filename))) return textResponse(404, 'Not found');
    key = 'releases/' + filename;
    contentType = filename.endsWith('.dmg') ? 'application/x-apple-diskimage' : filename.endsWith('.zip') ? 'application/zip' : filename.endsWith('.delta') ? 'application/octet-stream' : 'application/gzip';
    attachment = true;
  }
  const object = await env.RELEASES.get(key);
  if (!object) return textResponse(404, 'Not found');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  // Authoritative route metadata: stale R2 metadata must not override the feed/cache policy.
  headers.set('Cache-Control', NO_CACHE);
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  headers.set('X-Content-Type-Options', 'nosniff');
  if (attachment) headers.set('Content-Disposition', 'attachment');
  else headers.delete('Content-Disposition');
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

export default { fetch: (request: Request, env: Env) => handle(request, env) } satisfies ExportedHandler<Env>;
