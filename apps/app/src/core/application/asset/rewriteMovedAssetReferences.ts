import type { Folder, Page, VaultResource } from '../../vault/models';
import { EmbedExtractor } from '../../vault/ingest/extractors/EmbedExtractor';
import { ImageReferenceExtractor } from '../../vault/ingest/extractors/ImageReferenceExtractor';
import { LinkExtractor } from '../../vault/ingest/extractors/LinkExtractor';
import { VaultPath } from '../../vault/ingest/VaultPath';
import {
  AssetMoveRefusedError,
  type AssetMovePlan,
  type AssetMoveStep,
  type AssetMoveReferenceSummary,
  type AssetReferenceFailure,
} from '../../vault/persistence/AssetMovePolicy';
import { resolveLocalAssetReference } from '../membership/AssetCatalogBuilder';
import { isRepresentableLinkTarget, rewriteReferenceTargets } from '../page/pageReferenceRewrite';

const embedExtractor = new EmbedExtractor();
const imageExtractor = new ImageReferenceExtractor();
const linkExtractor = new LinkExtractor();

/** What the planner and the rewriter need from the Space. Every write is one of its existing, supported edits. */
export interface MovedAssetReferenceDeps {
  readonly root: string;
  readonly resources: () => Iterable<VaultResource>;
  readonly pages: () => Iterable<Page>;
  readonly folders: () => Iterable<Folder>;
  readonly isPageArchived: (page: Page) => boolean;
  readonly isFolderArchived: (folder: Folder) => boolean;
  /** The open notes' text as it is now, by note id — a draft included. */
  readonly openNoteMarkdown: () => ReadonlyMap<string, string>;
  /** Whether the note's file still holds exactly what Clutter last read (never overwrite an outside edit). */
  readonly isUnchangedOnDisk: (pageId: string) => Promise<boolean>;
  /** The Space avatar's image reference (`Assets/logo.png`), if it has one. */
  readonly avatarSource: () => string | undefined;
  /** Rewrites a note's text, an open editor's unsaved text included, archived notes included. */
  readonly writeBody: (pageId: string, transform: (markdown: string) => string) => Promise<void>;
  readonly writePageCover: (pageId: string, cover: string) => Promise<void>;
  readonly writeFolderCover: (folderId: string, cover: string) => Promise<void>;
  readonly writeAvatar: (reference: string) => Promise<void>;
}

interface Move {
  /** Vault-relative old and new paths: how a reference writes them. */
  readonly from: string;
  readonly to: string;
  readonly id: string;
}

type Match = 'exact' | 'ambiguous' | 'none';

/** What a note's text refers to: each kind kept apart, since each is written (and checked) differently. */
interface TextReferences {
  readonly embeds: readonly string[];
  readonly images: readonly string[];
  readonly links: readonly string[];
}

function textReferences(markdown: string): TextReferences {
  const clean = (value: string) => value.trim();

  return {
    embeds: embedExtractor.extract(markdown).map((embed) => clean(embed.target)),
    images: imageExtractor.extract(markdown).map(clean),
    links: linkExtractor.extract(markdown).map((link) => clean(link.target)),
  };
}

/**
 * Finds, BEFORE a move, everything that points at the files about to move, and checks that each can be rewritten with
 * confidence. Throws `AssetMoveRefusedError` — with nothing changed — when that cannot be established. Returns a plan
 * whose `commit()` rewrites them after the files have moved.
 *
 * Conservative by design. A reference is rewritten only when it is exactly the file's vault-relative path, as the Assets
 * catalog resolves it (ADR-039). One that resolves to the file in another spelling (`./Assets/x.png`, percent-encoded)
 * is not guessed at: the move is refused. A reference that resolves to nothing, an alias, raw HTML, a web address or
 * anything in another Space is not a reference to this file and is left alone.
 *
 * Where it looks: every note including archived ones (an archived note can be restored) — its `![[…]]` embeds, `[[…]]`
 * links to the file's exact path, `![](…)` images and cover (hidden or not); an open note's text as it is now, saved or
 * not; every folder's cover; the Space avatar.
 */
export async function planMovedAssetReferences(
  deps: MovedAssetReferenceDeps,
  steps: readonly AssetMoveStep[],
  subject: string
): Promise<AssetMovePlan> {
  try {
    return await plan(deps, steps, subject);
  } catch (error) {
    if (error instanceof AssetMoveRefusedError) {
      throw error;
    }
    // Whatever went wrong, nothing has moved: say so, and why.
    console.warn('Checking what uses an asset before moving it failed:', error);
    throw new AssetMoveRefusedError('scan-failed', subject);
  }
}

async function plan(
  deps: MovedAssetReferenceDeps,
  steps: readonly AssetMoveStep[],
  subject: string
): Promise<AssetMovePlan> {
  const relative = (path: string) => VaultPath.relativeTo(path, deps.root);
  const moves: Move[] = steps.map(({ resource, newPath }) => ({
    from: relative(resource.path),
    to: relative(newPath),
    id: resource.id,
  }));
  const affectedIds = new Set(moves.map((move) => move.id));
  const byFrom = new Map(moves.map((move) => [move.from, move]));
  const resourcesByPath = new Map<string, VaultResource>();

  for (const resource of deps.resources()) {
    resourcesByPath.set(resource.path, resource);
  }

  /** `exact`: the reference is one of the files' vault-relative paths. `ambiguous`: it finds one, spelled another way. */
  const match = (reference: string): { kind: Match; move?: Move } => {
    if (reference === '') {
      return { kind: 'none' };
    }

    const exact = byFrom.get(reference);

    if (exact) {
      return { kind: 'exact', move: exact };
    }

    const found = resolveLocalAssetReference(deps.root, resourcesByPath, reference);

    return found && affectedIds.has(found.id) ? { kind: 'ambiguous' } : { kind: 'none' };
  };

  const refuseSpelling = (where: string, reference: string): never => {
    throw new AssetMoveRefusedError('unsupported-spelling', subject, `${where}: “${reference}”`);
  };

  // What an embed (`![[…]]`), a link (`[[…]]`) and an image (`![](…)`) can hold in the new path.
  const assertWritable = (move: Move, kind: 'embed' | 'link' | 'image', where: string) => {
    const ok = kind === 'image' ? !/[\s()<>]/.test(move.to) : isRepresentableLinkTarget(move.to);

    if (!ok) {
      throw new AssetMoveRefusedError('unrepresentable-path', subject, `${where}: “${move.to}”`);
    }
  };

  const pagesToRewrite: Page[] = [];
  const pageCovers = new Map<string, string>();
  const folderCovers = new Map<string, string>();
  let avatar: string | undefined;
  const open = deps.openNoteMarkdown();
  const seenPages = new Set<string>();

  const scanText = (markdown: string, where: string): boolean => {
    const found = textReferences(markdown);
    let uses = false;

    for (const [kind, references] of [
      ['embed', found.embeds],
      ['image', found.images],
    ] as const) {
      for (const reference of references) {
        const result = match(reference);

        if (result.kind === 'ambiguous') {
          refuseSpelling(where, reference);
        }
        if (result.kind === 'exact' && result.move) {
          assertWritable(result.move, kind, where);
          uses = true;
        }
      }
    }

    // A plain `[[…]]` link to the file is not an asset use (ADR-039), so an unusual spelling is never refused over it; but
    // one that names the file exactly is rewritten along with the rest, so it does not break either.
    for (const reference of found.links) {
      const result = match(reference);

      if (result.kind === 'exact' && result.move) {
        assertWritable(result.move, 'link', where);
        uses = true;
      }
    }

    return uses;
  };

  for (const page of deps.pages()) {
    seenPages.add(page.id);
    const where = page.path;
    const live = open.get(page.id);
    const inText = scanText(page.source.markdown, where) || (live !== undefined && live !== page.source.markdown && scanText(live, where));
    const cover = page.metadata.cover?.trim() ?? '';
    const coverMatch = match(cover);

    if (coverMatch.kind === 'ambiguous') {
      refuseSpelling(where, cover);
    }
    if (coverMatch.kind === 'exact' && coverMatch.move) {
      pageCovers.set(page.id, coverMatch.move.to);
    }
    if (inText || coverMatch.kind === 'exact') {
      pagesToRewrite.push(page);
    }
  }

  // A new note nobody has saved: there is no saved text to update, so it can't be moved out from under.
  for (const [id, markdown] of open) {
    if (!seenPages.has(id) && scanText(markdown, 'a note you haven’t saved')) {
      throw new AssetMoveRefusedError('unsaved-draft', subject);
    }
  }

  for (const folder of deps.folders()) {
    const cover = folder.metadata.cover?.trim() ?? '';
    const result = match(cover);

    if (result.kind === 'none') {
      continue;
    }
    if (result.kind === 'ambiguous') {
      refuseSpelling(folder.path, cover);
    }
    if (deps.isFolderArchived(folder)) {
      throw new AssetMoveRefusedError('archived-folder', subject, folder.path);
    }
    if (result.move) {
      folderCovers.set(folder.id, result.move.to);
    }
  }

  const avatarSource = deps.avatarSource()?.trim() ?? '';
  const avatarMatch = match(avatarSource);

  if (avatarMatch.kind === 'ambiguous') {
    refuseSpelling('the Space avatar', avatarSource);
  }
  if (avatarMatch.kind === 'exact' && avatarMatch.move) {
    avatar = avatarMatch.move.to;
  }

  // Never overwrite a note that changed outside Clutter since Clutter last read it.
  for (const page of pagesToRewrite) {
    if (!(await deps.isUnchangedOnDisk(page.id))) {
      throw new AssetMoveRefusedError('changed-on-disk', subject, page.path);
    }
  }

  const referenceCount = pagesToRewrite.length + folderCovers.size + (avatar === undefined ? 0 : 1);

  return { referenceCount, commit: () => commit(deps, moves, pagesToRewrite, pageCovers, folderCovers, avatar) };
}

/**
 * Rewrites what the plan found, after the files have moved. Each place is its own existing edit; one failing never stops
 * the rest, and everything left undone is returned, not hidden. Idempotent: a place already rewritten matches nothing.
 */
async function commit(
  deps: MovedAssetReferenceDeps,
  moves: readonly Move[],
  pages: readonly Page[],
  pageCovers: ReadonlyMap<string, string>,
  folderCovers: ReadonlyMap<string, string>,
  avatar: string | undefined
): Promise<AssetMoveReferenceSummary> {
  const failed: AssetReferenceFailure[] = [];
  let updated = 0;

  const attempt = async (failure: Omit<AssetReferenceFailure, 'message'>, write: () => Promise<void>): Promise<boolean> => {
    try {
      await write();

      return true;
    } catch (error) {
      failed.push({ ...failure, message: error instanceof Error ? error.message : String(error) });

      return false;
    }
  };

  const transform = (markdown: string): string => {
    let next = markdown;

    for (const move of moves) {
      next = rewriteReferenceTargets(next, move.from, move.to);
      next = imageExtractor.replaceSource(next, move.from, move.to);
    }

    return next;
  };

  for (const page of pages) {
    const failure = { kind: 'note' as const, id: page.id, path: page.path };
    const open = deps.openNoteMarkdown().get(page.id) ?? page.source.markdown;
    const bodyOk =
      transform(open) === open && transform(page.source.markdown) === page.source.markdown
        ? true
        : await attempt({ ...failure, usage: 'text' }, () => deps.writeBody(page.id, transform));
    const cover = pageCovers.get(page.id);
    const coverOk = cover === undefined ? true : await attempt({ ...failure, usage: 'cover' }, () => deps.writePageCover(page.id, cover));

    if (bodyOk && coverOk) {
      updated += 1;
    }
  }

  const foldersById = new Map<string, Folder>();

  for (const folder of deps.folders()) {
    foldersById.set(folder.id, folder);
  }

  for (const [id, cover] of folderCovers) {
    const ok = await attempt(
      { kind: 'folder', id, path: foldersById.get(id)?.path ?? '', usage: 'cover' },
      () => deps.writeFolderCover(id, cover)
    );

    updated += Number(ok);
  }

  if (avatar !== undefined) {
    updated += Number(await attempt({ kind: 'avatar', id: '', path: '', usage: 'avatar' }, () => deps.writeAvatar(avatar)));
  }

  if (failed.length > 0) {
    console.warn(
      `Moved assets: ${failed.length} reference update(s) failed, so something still points at an old path:`,
      failed
    );
  }

  return {
    moves: moves.map(({ from, to }) => ({ from, to })),
    updated,
    failed,
    complete: failed.length === 0,
  };
}
