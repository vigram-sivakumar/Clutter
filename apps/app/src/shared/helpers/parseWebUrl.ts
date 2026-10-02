/**
 * Parses `raw` as a web (http/https) URL, or returns null. Platform URL
 * parser (per the "use the platform parser, not a regex" requirement), not
 * just a string check — `new URL()` throws on anything that isn't a
 * structurally valid URL. The scheme check on top of that is what actually
 * matters for "is this a web URL": `new URL()` alone happily parses
 * `javascript:...`, `data:...`, `file:...`, etc.
 */
export function parseWebUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return parsed;
}
