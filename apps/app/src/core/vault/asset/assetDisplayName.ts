import { classifySupportedResourceFile } from '../ingest/SupportedResourceKind';

const MAX_NAME_LENGTH = 80;

/** Alt texts that say nothing about the picture — a file named after one would be no better than the URL's. */
const GENERIC_NAMES: ReadonlySet<string> = new Set([
  'image',
  'img',
  'photo',
  'picture',
  'pic',
  'screenshot',
  'untitled',
  'alt',
  'alt text',
  'cover',
  'thumbnail',
  'attachment',
  'download',
]);

/** Characters no common file system accepts in a name, plus all control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f/\\:*?"<>|]+/g;

/**
 * A display text (the `![display text](url)` a user typed) turned into a safe
 * file name stem, or `null` when it can't make a useful one.
 *
 * Kept as typed wherever a file system allows it — spaces, accents and any
 * script — with only what can't be in a name (path separators, reserved
 * characters, control characters) replaced by `-`, whitespace collapsed,
 * leading/trailing dots, dashes and spaces trimmed, a trailing image extension
 * dropped (the saved file's extension comes from the download), and the length
 * bounded. A result that is empty, a bare URL, camera-style (`IMG_1234`), or one
 * of the generic words ("image", "screenshot", …) is `null`: the caller falls
 * back to the URL's own name. Never contains a path separator, so it cannot
 * escape `Assets/`.
 */
export function sanitizeAssetDisplayName(text: string): string | null {
  const cleaned = text
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\- ]+|[.\- ]+$/g, '');

  const withoutExtension =
    classifySupportedResourceFile(cleaned) !== null ? cleaned.replace(/\.[A-Za-z0-9]+$/, '') : cleaned;
  const bounded = Array.from(withoutExtension).slice(0, MAX_NAME_LENGTH).join('').trim().replace(/[.\- ]+$/g, '');

  if (!bounded) {
    return null;
  }

  const lower = bounded.toLowerCase();

  if (
    GENERIC_NAMES.has(lower) ||
    /^https?[-:]/.test(lower) ||
    /^(img|dsc|image|screenshot|photo|pic)[ _-]?\d+$/.test(lower) ||
    /^[\d\s.-]+$/.test(lower)
  ) {
    return null;
  }

  return bounded;
}

/** The first display text, in the order given, that makes a usable name. */
export function pickAssetDisplayName(candidates: Iterable<string>): string | undefined {
  for (const candidate of candidates) {
    const name = sanitizeAssetDisplayName(candidate);

    if (name) {
      return name;
    }
  }

  return undefined;
}
