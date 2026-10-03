/**
 * Builds the Assets catalog: every asset Clutter knows about or uses, as one
 * logical collection (ADR-039).
 *
 *   resources (files in the vault)  ─┐
 *   pages: embeds, images, covers   ─┼─►  one Asset per canonical reference
 *   folders: covers                 ─┘
 *
 * An asset is identified by its canonical reference — a local file's resource
 * id, or a remote URL — so a file referenced by three notes and used as a
 * cover is still one asset, with four references. Source (local / remote) and
 * usage (embed / cover) are separate: nothing here has a "cover asset" type.
 *
 * Pure and derived: nothing is stored, nothing is read from disk, and a remote
 * URL is never copied into the vault. The only cache is the per-page image
 * sources, keyed by the (immutable) Page object, so rebuilding after an
 * unrelated change doesn't re-parse every note.
 */
import type {
  Asset,
  AssetKind,
  AssetReference,
  AssetUsage,
  Folder,
  LocalAsset,
  Page,
  RemoteAsset,
  VaultResource,
} from '../models';
import { ImageReferenceExtractor } from '../ingest/extractors/ImageReferenceExtractor';
import { mimeTypeForPath } from '../ingest/SupportedResourceKind';

export interface AssetCatalogInput {
  /** The vault root — local references are vault-relative paths under it. */
  readonly root: string;
  /** The resources to list as local assets (the caller decides which are visible). */
  readonly resources: readonly VaultResource[];
  /** The pages whose uses count (the caller excludes archived/hidden ones). */
  readonly pages: readonly Page[];
  readonly folders: readonly Folder[];
}

const REMOTE_URL = /^https?:\/\//i;

export function isRemoteAssetUrl(reference: string): boolean {
  return REMOTE_URL.test(reference);
}

interface Draft {
  readonly asset: Omit<LocalAsset, 'references'> | Omit<RemoteAsset, 'references'>;
  readonly references: AssetReference[];
  readonly seen: Set<string>;
}

export class AssetCatalogBuilder {
  private readonly imageExtractor = new ImageReferenceExtractor();
  private readonly imageSourcesByPage = new WeakMap<Page, readonly string[]>();

  build(input: AssetCatalogInput): Asset[] {
    const { root, resources, pages, folders } = input;

    const resourcesByPath = new Map(resources.map((resource) => [resource.path, resource]));
    const drafts = new Map<string, Draft>();

    for (const resource of resources) {
      drafts.set(resource.id, {
        asset: {
          id: resource.id,
          source: 'local',
          kind: resource.kind,
          name: resource.name,
          mimeType: mimeTypeForPath(resource.path),
          resource,
        },
        references: [],
        seen: new Set(),
      });
    }

    const draftFor = (reference: string, remoteKind: AssetKind): Draft | undefined => {
      const trimmed = reference.trim();

      if (isRemoteAssetUrl(trimmed)) {
        const id = `remote:${trimmed}`;
        let draft = drafts.get(id);

        if (!draft) {
          draft = {
            asset: {
              id,
              source: 'remote',
              kind: remoteKind,
              name: remoteAssetName(trimmed),
              mimeType: mimeTypeForPath(trimmed),
              url: trimmed,
            },
            references: [],
            seen: new Set(),
          };
          drafts.set(id, draft);
        }

        return draft;
      }

      const resource = resolveLocal(root, resourcesByPath, trimmed);

      return resource ? drafts.get(resource.id) : undefined;
    };

    const use = (
      draft: Draft | undefined,
      usage: AssetUsage,
      referrer: AssetReference['referrer']
    ): void => {
      if (!draft) {
        return;
      }

      const key = `${usage}|${referrer.kind}|${referrer.id}`;

      if (!draft.seen.has(key)) {
        draft.seen.add(key);
        draft.references.push({ usage, referrer });
      }
    };

    for (const page of pages) {
      const referrer = { kind: 'page', id: page.id } as const;

      // `![[file.ext]]` — a wikilink embed. Only a target that names a
      // resource counts; a note embed is not an asset.
      for (const embed of page.analysis.embeds) {
        const resource = resolveLocal(root, resourcesByPath, embed.target);

        if (resource) {
          use(drafts.get(resource.id), 'embed', referrer);
        }
      }

      // `![alt](src)` — a local file or a remote image.
      for (const source of this.imageSourcesOf(page)) {
        use(draftFor(source, 'image'), 'embed', referrer);
      }

      if (page.metadata.cover && !page.metadata.coverHidden) {
        use(draftFor(page.metadata.cover, 'image'), 'cover', referrer);
      }
    }

    for (const folder of folders) {
      if (folder.metadata.cover && !folder.metadata.coverHidden) {
        use(draftFor(folder.metadata.cover, 'image'), 'cover', { kind: 'folder', id: folder.id });
      }
    }

    return [...drafts.values()].map(({ asset, references }) => ({ ...asset, references }) as Asset);
  }

  private imageSourcesOf(page: Page): readonly string[] {
    let sources = this.imageSourcesByPage.get(page);

    if (!sources) {
      sources = this.imageExtractor.extract(page.source.markdown);
      this.imageSourcesByPage.set(page, sources);
    }

    return sources;
  }
}

/** A vault-relative reference (`assets/photo.png`, `./photo.png`, percent-encoded) → the resource at that exact path. */
function resolveLocal(
  root: string,
  resourcesByPath: ReadonlyMap<string, VaultResource>,
  reference: string
): VaultResource | undefined {
  const candidates = [reference];

  try {
    const decoded = decodeURIComponent(reference);
    if (decoded !== reference) {
      candidates.push(decoded);
    }
  } catch {
    // A malformed percent sequence — the raw text is the only candidate.
  }

  for (const candidate of candidates) {
    const relative = candidate.replace(/^\.\//, '');
    const resource = resourcesByPath.get(`${root}/${relative}`);

    if (resource) {
      return resource;
    }
  }

  return undefined;
}

/** What a remote asset is called: its URL's file name, else its host. */
function remoteAssetName(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();

    return last ? decodeURIComponent(last) : parsed.hostname;
  } catch {
    return url;
  }
}
