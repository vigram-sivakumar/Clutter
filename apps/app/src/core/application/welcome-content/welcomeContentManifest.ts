/**
 * ADR-067: the one module that knows what the bundled welcome content is. It owns the glob over
 * `apps/app/src/welcome-content/Welcome to Clutter/` (the shipped Space root: its contents are installed directly
 * into the first Space, with no extra folder level) and turns it into an ordered list of entries.
 *
 * - Markdown is bundled as text (`?raw`). `exhaustive: true` is required: the glob's default drops dotfiles, which
 *   would silently lose both `.folder.md` files. `.DS_Store` is excluded by the `*.md` / image-extension patterns
 *   and again by an explicit negative pattern.
 * - Images are bundled as URLs (`?url`) and read as bytes, never as text (`?raw` would corrupt them).
 * - Both globs are lazy, so none of it is in the main chunk.
 * - A `.folder.md` is not an entry of its own: it belongs to its directory's entry.
 * - Entries are sorted by path, so a directory always precedes what is inside it, and the order is deterministic.
 */
const SHIPPED_ROOT = '/src/welcome-content/Welcome to Clutter/';

const markdownFiles = import.meta.glob('/src/welcome-content/Welcome to Clutter/**/*.md', {
  query: '?raw',
  import: 'default',
  exhaustive: true,
});
const imageFiles = import.meta.glob(
  [
    '/src/welcome-content/Welcome to Clutter/**/*.{jpg,jpeg,png,gif,webp}',
    '!/src/welcome-content/Welcome to Clutter/**/.DS_Store',
  ],
  { query: '?url', import: 'default' }
);

/** The reserved folder (ADR-030) the shipped content puts notes in. It is made only by `ensureReservedFolder`. */
export const WELCOME_TEMPLATES_FOLDER = 'Templates';

export type WelcomeEntry =
  | {
      readonly kind: 'directory';
      readonly path: string;
      /** `reserved`: Templates, made by `ensureReservedFolder`. `marker`: has a shipped `.folder.md`. `plain`: neither. */
      readonly folder: 'reserved' | 'marker' | 'plain';
      readonly loadMarker?: () => Promise<string>;
    }
  | { readonly kind: 'markdown'; readonly path: string; readonly load: () => Promise<string> }
  | { readonly kind: 'image'; readonly path: string; readonly load: () => Promise<Uint8Array> };

export interface WelcomeManifest {
  readonly entries: readonly WelcomeEntry[];
  /** A digest of every path and every bundled byte. Loads all content, so it is computed only when an install or resume runs. */
  plan(): Promise<string>;
}

export interface ManifestFile {
  /** Path relative to the shipped Space root, `/`-separated. */
  readonly path: string;
  readonly loadText?: () => Promise<string>;
  readonly loadBytes?: () => Promise<Uint8Array>;
}

const FOLDER_MARKER = '.folder.md';

/** Pure: builds the ordered manifest from files. Exported for tests; the bundled content goes through it too. */
export function buildWelcomeManifest(files: readonly ManifestFile[]): WelcomeManifest {
  const directories = new Set<string>();
  const markers = new Map<string, () => Promise<string>>();
  const content: WelcomeEntry[] = [];

  for (const file of files) {
    const segments = file.path.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      directories.add(segments.slice(0, depth).join('/'));
    }

    const name = segments[segments.length - 1];
    if (name === FOLDER_MARKER) {
      if (file.loadText) markers.set(segments.slice(0, -1).join('/'), file.loadText);
    } else if (file.loadText) {
      content.push({ kind: 'markdown', path: file.path, load: file.loadText });
    } else if (file.loadBytes) {
      content.push({ kind: 'image', path: file.path, load: file.loadBytes });
    }
  }

  const entries: WelcomeEntry[] = [
    ...[...directories].map((path): WelcomeEntry => {
      const loadMarker = markers.get(path);
      const folder = path === WELCOME_TEMPLATES_FOLDER ? 'reserved' : loadMarker ? 'marker' : 'plain';

      return loadMarker ? { kind: 'directory', path, folder, loadMarker } : { kind: 'directory', path, folder };
    }),
    ...content,
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { entries, plan: () => computePlan(entries) };
}

async function computePlan(entries: readonly WelcomeEntry[]): Promise<string> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const push = (bytes: Uint8Array) => {
    parts.push(bytes);
    parts.push(Uint8Array.of(0));
  };

  for (const entry of entries) {
    push(encoder.encode(`${entry.kind}:${entry.path}`));
    if (entry.kind === 'markdown') push(encoder.encode(await entry.load()));
    if (entry.kind === 'image') push(await entry.load());
    if (entry.kind === 'directory' && entry.loadMarker) push(encoder.encode(await entry.loadMarker()));
  }

  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', joined);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the bundled welcome file (${response.status})`);

  return new Uint8Array(await response.arrayBuffer());
}

function relative(key: string): string {
  return key.slice(SHIPPED_ROOT.length);
}

/** The bundled content as a manifest. `loadImageBytes` is replaceable for tests; the app reads the bundled URL. */
export function bundledWelcomeManifest(loadImageBytes: (url: string) => Promise<Uint8Array> = fetchBytes): WelcomeManifest {
  return buildWelcomeManifest([
    ...Object.entries(markdownFiles).map(([key, load]) => ({
      path: relative(key),
      loadText: load as () => Promise<string>,
    })),
    ...Object.entries(imageFiles).map(([key, load]) => ({
      path: relative(key),
      loadBytes: async () => loadImageBytes((await (load as () => Promise<string>)()) as string),
    })),
  ]);
}
