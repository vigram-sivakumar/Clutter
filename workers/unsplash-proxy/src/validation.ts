/**
 * Everything the proxy accepts from a client is parsed here, and nothing else reaches the upstream URL: the upstream
 * address is built (in index.ts) only from the validated values this module returns. Nothing is forwarded verbatim.
 */

export const MAX_URL_LENGTH = 2048;
export const MAX_QUERY_LENGTH = 100;
export const MAX_PAGE = 50;
/** Fixed, never taken from the client: the page size Clutter's picker shows. */
export const PER_PAGE = 30;
export const ORIENTATIONS = ['landscape', 'portrait', 'squarish'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** An Unsplash photo id (the API's, not the CDN file name). */
export const PHOTO_ID_PATTERN = /^[A-Za-z0-9_-]{6,24}$/;
/** The `ixid` Unsplash adds to links it returns: an opaque token. */
export const IXID_PATTERN = /^[A-Za-z0-9_\-=+/.~%]{1,600}$/;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type Route =
  | { readonly kind: 'health' }
  | { readonly kind: 'search'; readonly query: string; readonly page: number; readonly orientation: Orientation }
  | { readonly kind: 'photo'; readonly id: string }
  | { readonly kind: 'download'; readonly id: string; readonly ixid: string | null };

export type Parsed =
  | { readonly ok: true; readonly route: Route }
  | { readonly ok: false; readonly status: 400 | 404 | 405 | 414; readonly error: string };

const refuse = (status: 400 | 404 | 405 | 414, error: string): Parsed => ({ ok: false, status, error });

/** The single value of a query parameter, `undefined` when absent, or `'duplicate'` when it was given twice. */
function single(params: URLSearchParams, name: string): string | undefined | 'duplicate' {
  const values = params.getAll(name);

  if (values.length > 1) return 'duplicate';

  return values[0];
}

function onlyAllowed(params: URLSearchParams, allowed: readonly string[]): boolean {
  for (const name of params.keys()) {
    if (!allowed.includes(name)) return false;
  }

  return true;
}

export function parseRequest(method: string, url: URL): Parsed {
  if (url.href.length > MAX_URL_LENGTH) return refuse(414, 'url_too_long');
  if (method !== 'GET') return refuse(405, 'method_not_allowed');

  const path = url.pathname;

  if (path === '/health') {
    return url.search === '' ? { ok: true, route: { kind: 'health' } } : refuse(400, 'unknown_parameter');
  }

  if (path === '/search/photos') {
    return parseSearch(url.searchParams);
  }

  const photo = /^\/photos\/([^/]+)$/.exec(path);

  if (photo) {
    const id = photo[1] as string;

    if (!PHOTO_ID_PATTERN.test(id)) return refuse(400, 'invalid_photo_id');
    if (url.search !== '') return refuse(400, 'unknown_parameter');

    return { ok: true, route: { kind: 'photo', id } };
  }

  const download = /^\/photos\/([^/]+)\/download$/.exec(path);

  if (download) {
    return parseDownload(download[1] as string, url.searchParams);
  }

  return refuse(404, 'not_found');
}

function parseSearch(params: URLSearchParams): Parsed {
  if (!onlyAllowed(params, ['query', 'page', 'orientation'])) return refuse(400, 'unknown_parameter');

  const rawQuery = single(params, 'query');
  const rawPage = single(params, 'page');
  const rawOrientation = single(params, 'orientation');

  if (rawQuery === 'duplicate' || rawPage === 'duplicate' || rawOrientation === 'duplicate') {
    return refuse(400, 'duplicate_parameter');
  }

  const query = (rawQuery ?? '').trim();

  if (query === '') return refuse(400, 'missing_query');
  if (query.length > MAX_QUERY_LENGTH) return refuse(400, 'query_too_long');
  if (CONTROL_CHARACTERS.test(query)) return refuse(400, 'invalid_query');

  let page = 1;

  if (rawPage !== undefined) {
    if (!/^\d{1,3}$/.test(rawPage)) return refuse(400, 'invalid_page');
    page = Number(rawPage);
    if (page < 1 || page > MAX_PAGE) return refuse(400, 'invalid_page');
  }

  let orientation: Orientation = 'portrait';

  if (rawOrientation !== undefined) {
    if (!(ORIENTATIONS as readonly string[]).includes(rawOrientation)) return refuse(400, 'invalid_orientation');
    orientation = rawOrientation as Orientation;
  }

  return { ok: true, route: { kind: 'search', query, page, orientation } };
}

function parseDownload(id: string, params: URLSearchParams): Parsed {
  if (!PHOTO_ID_PATTERN.test(id)) return refuse(400, 'invalid_photo_id');
  if (!onlyAllowed(params, ['ixid'])) return refuse(400, 'unknown_parameter');

  const ixid = single(params, 'ixid');

  if (ixid === 'duplicate') return refuse(400, 'duplicate_parameter');
  if (ixid !== undefined && !IXID_PATTERN.test(ixid)) return refuse(400, 'invalid_ixid');

  return { ok: true, route: { kind: 'download', id, ixid: ixid ?? null } };
}
