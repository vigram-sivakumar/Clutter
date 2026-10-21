import type { Folder, Page, VaultResource } from '../../vault/models';
import { EmbedExtractor } from '../../vault/ingest/extractors/EmbedExtractor';
import { ImageReferenceExtractor } from '../../vault/ingest/extractors/ImageReferenceExtractor';
import { isRemoteAssetUrl, resolveLocalAssetReference } from '../membership/AssetCatalogBuilder';

/**
 * Is an archived file still pointed at by something that is not archived? The question automatic archive cleanup
 * asks before it permanently deletes a file (or a folder holding files), so a delete can never break a note.
 *
 * It does not have a resolver of its own. What counts as a reference, and how a reference becomes a file, is the
 * Assets catalog's (ADR-039, `AssetCatalogBuilder`): a `![[path]]` embed (its target, alias and heading already
 * split off), a standard `![alt](path)` image (the shared `ImageReferenceExtractor`: titles dropped, `<…>` removed,
 * code ignored), a note's cover and a folder's cover — and a reference is a vault-relative path, exactly, with a
 * leading `./` and percent-encoding allowed (`resolveLocalAssetReference`). On top of that this adds what a delete
 * needs and the catalog, which is about display, does not:
 *  - a hidden cover is still a reference (un-hiding it must not find the file gone);
 *  - the Space's avatar image is a reference;
 *  - a reference to where an archived file used to be counts, though nothing resolves there while it is archived.
 *
 * The rule, for an archived file and every reference an active note, active folder or the Space itself holds:
 *  1. A reference that resolves to a file that is staying (not archived) is satisfied by that file: it does not
 *     protect the archived one — this is how a same-named file in another folder is told apart.
 *  2. A reference that resolves to the archived file, at its original path or where it sits now, protects it.
 *  3. A reference that resolves to nothing at all but ends in the same file name might be this file under a path
 *     that no longer matches (a bare name, a path that moved). That cannot be settled safely, so it protects it.
 *  Everything else — no matching reference — leaves the file free to delete. Nothing is ever decided by file name
 *  alone: a name only counts for a reference that points at nothing.
 */
const imageExtractor = new ImageReferenceExtractor();
const embedExtractor = new EmbedExtractor();

/**
 * What a note's *text* points at: its `![[…]]` embeds and `![alt](…)` images, read with the same two extractors the
 * saved notes are read with. For text that is not saved yet — the open notes' live content, which an edit can change
 * in the moment before autosave writes it (or for good, while a save keeps failing) — so a reference typed a second
 * ago is not missed.
 */
export function collectMarkdownReferences(markdowns: Iterable<string>): readonly string[] {
  const references = new Set<string>();

  for (const markdown of markdowns) {
    const found = [...embedExtractor.extract(markdown).map((embed) => embed.target), ...imageExtractor.extract(markdown)];

    for (const reference of found) {
      const trimmed = reference.trim();

      if (trimmed && !isRemoteAssetUrl(trimmed) && !/^data:/i.test(trimmed)) {
        references.add(trimmed);
      }
    }
  }

  return [...references];
}

/** Every reference to a vault file held by `pages` and `folders` (which the caller limits to the ones that are not archived), and by the Space avatar. */
export function collectAssetReferences(input: {
  readonly pages: Iterable<Page>;
  readonly folders: Iterable<Folder>;
  /** The Space avatar's image reference (`Assets/logo.png`), if it has one. */
  readonly avatarSource?: string;
}): readonly string[] {
  const references = new Set<string>();
  const add = (reference: string | null | undefined) => {
    const trimmed = reference?.trim();

    // A web address or an inline image can't be a vault file.
    if (trimmed && !isRemoteAssetUrl(trimmed) && !/^data:/i.test(trimmed)) {
      references.add(trimmed);
    }
  };

  for (const page of input.pages) {
    page.analysis.embeds.forEach((embed) => add(embed.target));
    imageExtractor.extract(page.source.markdown).forEach(add);
    // Hidden or not: the cover is still saved in the note, and showing it again must not find the file gone.
    add(page.metadata.cover);
  }

  for (const folder of input.folders) {
    add(folder.metadata.cover);
  }

  add(input.avatarSource);

  return [...references];
}

/** The file an archived item is, and every absolute path an active note might still be looking for it at. */
export interface ArchivedAsset {
  readonly resource: VaultResource;
  /** Where it sits now (inside `Archive/`) and where it was before it was archived. */
  readonly paths: readonly string[];
}

/** The last segment of an absolute path: the file's name at that place. */
function fileNameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

/** The last path segment of a reference, decoded and lower-cased: what a bare or moved reference would be called. */
function referencedFileName(reference: string): string {
  const withoutFragment = reference.split(/[#?]/)[0] ?? reference;
  const last = withoutFragment.split('/').pop() ?? withoutFragment;

  try {
    return decodeURIComponent(last).toLowerCase();
  } catch {
    return last.toLowerCase();
  }
}

/**
 * Whether anything in `references` still points at `asset`. `staying` is every file that is not archived, by absolute
 * path — what a reference is first checked against, so a reference that a live file satisfies protects nothing.
 */
export function isArchivedAssetReferenced(input: {
  readonly root: string;
  readonly references: readonly string[];
  readonly staying: ReadonlyMap<string, VaultResource>;
  readonly asset: ArchivedAsset;
}): boolean {
  const { root, references, staying, asset } = input;
  const ownPaths = new Map(asset.paths.map((path) => [path, asset.resource] as const));
  // Every name the file has gone by: archiving renames a file that would collide (`logo.png` becomes `logo 2.png` in
  // Archive/), but a note still says `logo.png`, so the name it had before counts as much as the one it has now.
  const names = new Set([asset.resource.name, ...asset.paths.map(fileNameOf)].map((name) => name.toLowerCase()));

  for (const reference of references) {
    if (resolveLocalAssetReference(root, staying, reference)) {
      continue;
    }

    if (resolveLocalAssetReference(root, ownPaths, reference)) {
      return true;
    }

    if (names.has(referencedFileName(reference))) {
      return true;
    }
  }

  return false;
}
