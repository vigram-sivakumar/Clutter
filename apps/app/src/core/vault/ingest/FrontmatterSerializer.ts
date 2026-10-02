import type { Page } from '../models/Page';
import type { Folder } from '../models/Folder';
import type { PageFrontmatter } from './frontmatter';
import { quoteFrontmatterString } from './frontmatter/frontmatterStringValue';

/**
 * Formats one block-list item. `aliases` are free text, so they go through
 * quoteFrontmatterString (FrontmatterParser unquotes them back); `tags`
 * follow the tag grammar, never need quoting, and stay byte-identical.
 */
function formatListItem(key: string, item: string): string {
  return `  - ${key === 'aliases' ? quoteFrontmatterString(item) : item}`;
}

/**
 * FrontmatterSerializer is the sole component responsible for converting the canonical `Page` model
 * into persisted YAML. It acts as the persistence boundary between Clutter's metadata model and Markdown files.
 *
 * Deterministic serialization is an architectural requirement to ensure that identical metadata always produces
 * identical output. Serialization should never invent, derive, or validate metadata; it only formats already
 * validated data.
 *
 * It also assembles the canonical persisted Markdown document by combining
 * serialized frontmatter with committed Markdown content.
 *
 * The serializer derives persisted frontmatter from the immutable `Page` model.
 *
 * It supports both serialization of persisted pages (`Page`) and page creation frontmatter (`PageFrontmatter`).
 */
export class FrontmatterSerializer {
  /**
   * Serializes persisted frontmatter during page creation. Array-valued
   * fields (e.g. `tags`) are written as a block list — the same shape
   * FrontmatterParser already reads back and serializePage's own `tags`
   * handling already writes — and omitted entirely while empty, rather
   * than falling through to the scalar `${key}: ${value}` line (which
   * would stringify an array as a bare comma-joined, unparseable value).
   */
  serialize(frontmatter: PageFrontmatter): string {
    const lines = ['---'];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === undefined || key === 'unownedLines') {
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          continue;
        }

        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(formatListItem(key, item));
        }
        continue;
      }

      lines.push(`${key}: ${value}`);
    }

    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Serializes only defined values from the provided page.
   * The output is intended to be deterministic.
   * Future implementations may support richer YAML features such as arrays,
   * multiline values, escaping, and quoting, while preserving the same public contract.
   */
  serializePage(page: Page): string {
    const lines = ['---'];
    // A system key is written under the spelling the file already uses
    // (`Aliases:`), when it differs from canonical — so a save never
    // rewrites frontmatter the user didn't edit. An edit of that property
    // drops its spelling (PageOperations.updateMetadata), writing the
    // canonical key from then on.
    const spellings = page.metadata.frontmatterKeySpellings ?? {};
    const keyFor = (key: string): string => spellings[key] ?? key;

    // Metadata is serialized in a deterministic order so identical Page models
    // always produce identical persisted output.
    // Future iterations may replace this formatter with a full YAML serializer
    // while preserving the same canonical field ordering.
    // No `type` field: a page's Daily Note vs. Note role is derived from
    // its current path at runtime (Vault.resolvePageType/PageBuilder),
    // never persisted — see the Page.type investigation. Any `type:` line
    // already present in an existing file on disk is inert legacy data,
    // never read back (FrontmatterParser still parses it as an arbitrary
    // field; nothing consumes it for classification) and naturally drops
    // out of this list the next time that file is saved.
    const entries: [string, any][] = [
      ['id', page.id],
      ['created', page.metadata.createdAt],
      ['modified', page.metadata.updatedAt],
      ['favorite', page.metadata.favorite],
      ['icon', page.metadata.icon],
      ['cover', page.metadata.cover],
      // `|| undefined`, not the bare boolean: unlike favorite (always
      // written, true or false), coverHidden should only ever appear in
      // frontmatter when actually hiding a cover — omitted while false,
      // per the desired before/after shape (a plain `cover: ...` stays
      // that way until Hide is used; it doesn't grow a `coverHidden:
      // false` line on every save).
      ['coverHidden', page.metadata.coverHidden || undefined],
      // Same omit-on-default convention as coverHidden above, keyed to
      // coverLayout's own default ('side') instead of `false`.
      [
        'coverLayout',
        page.metadata.coverLayout === 'side' ? undefined : page.metadata.coverLayout,
      ],
      // Same omit-on-default convention as coverHidden/coverLayout above,
      // keyed to the centered default (50) instead of `false`/`'side'`.
      [
        'coverPositionAbove',
        page.metadata.coverPositionAbove === 50 ? undefined : page.metadata.coverPositionAbove,
      ],
      [
        'coverPositionSide',
        page.metadata.coverPositionSide === 50 ? undefined : page.metadata.coverPositionSide,
      ],
      ['description', page.metadata.description],
      ['status', page.metadata.status],
      ['archivedAt', page.metadata.archivedAt],
      ['originalPath', page.metadata.originalPath],
      ['originalParentId', page.metadata.originalParentId],
    ];

    for (const [key, value] of entries) {
      if (value !== undefined && value !== null) {
        lines.push(`${keyFor(key)}: ${value}`);
      }
    }

    // Block-list array, same shape FrontmatterParser already reads back
    // for `aliases`/`tags` (a `key:` line with no inline value, followed
    // by `  - value` lines) — omitted entirely while empty, the same
    // omit-on-default convention as coverHidden/coverLayout above, so a
    // note with no tags never grows a bare `tags:` line.
    if (page.metadata.tags && page.metadata.tags.length > 0) {
      lines.push(`${keyFor('tags')}:`);
      for (const tag of page.metadata.tags) {
        lines.push(`  - ${tag}`);
      }
    }

    // Same block-list shape and omit-while-empty convention as `tags`.
    // Values are written as they are in PageMetadata.aliases — never
    // deduplicated or re-cased here — quoted only where a plain value
    // would be misread.
    if (page.metadata.aliases && page.metadata.aliases.length > 0) {
      lines.push(`${keyFor('aliases')}:`);
      for (const alias of page.metadata.aliases) {
        lines.push(formatListItem('aliases', alias));
      }
    }

    // Frontmatter Clutter doesn't own (custom keys) — written
    // back verbatim after the owned fields, so a save never deletes it.
    // The serializer still never invents or reformats any of it.
    if (page.metadata.unownedFrontmatter) {
      lines.push(...page.metadata.unownedFrontmatter);
    }

    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Serializes a complete Markdown document consisting of YAML frontmatter
   * followed by the Markdown body.
   *
   * This is the canonical representation written to disk.
   */
  serializeDocument(page: Page, markdown: string): string {
    return `${this.serializePage(page)}\n${markdown}`;
  }

  /**
   * Serializes only defined values from the provided folder, mirroring
   * serializePage's shape and field-ordering determinism — a folder's
   * `.folder.md` is a persisted-identity file, not a page, but the same
   * "id is authoritative, everything else optional and defaulted by
   * FolderBuilder when absent" contract applies (see FolderCreator's own
   * use of the plain `serialize()` for a freshly created folder's minimal
   * `{ id }` frontmatter — this is the same serialization path extended to
   * a full Folder so an existing folder's other metadata survives a
   * repair write, not a parallel implementation of it).
   */
  serializeFolder(folder: Folder): string {
    const lines = ['---'];

    const entries: [string, any][] = [
      ['id', folder.id],
      ['icon', folder.metadata.icon],
      ['favorite', folder.metadata.favorite],
      ['description', folder.metadata.description],
      ['cover', folder.metadata.cover],
      // See serializePage's identical `|| undefined` for coverHidden.
      ['coverHidden', folder.metadata.coverHidden || undefined],
      // See serializePage's identical default-omission for coverLayout.
      [
        'coverLayout',
        folder.metadata.coverLayout === 'side' ? undefined : folder.metadata.coverLayout,
      ],
      // See serializePage's identical omit-on-default for the position pair.
      [
        'coverPositionAbove',
        folder.metadata.coverPositionAbove === 50 ? undefined : folder.metadata.coverPositionAbove,
      ],
      [
        'coverPositionSide',
        folder.metadata.coverPositionSide === 50 ? undefined : folder.metadata.coverPositionSide,
      ],
      ['status', folder.metadata.status],
      ['archivedAt', folder.metadata.archivedAt],
      ['originalPath', folder.metadata.originalPath],
      ['originalParentId', folder.metadata.originalParentId],
    ];

    for (const [key, value] of entries) {
      if (value !== undefined && value !== null) {
        lines.push(`${key}: ${value}`);
      }
    }

    lines.push('---');

    return lines.join('\n');
  }

  /**
   * Serializes a folder's `.folder.md` document — frontmatter only, no
   * Markdown body (a folder has none), mirroring FolderCreator.buildContent's
   * exact trailing-newline convention so a repaired file is
   * indistinguishable in shape from one Clutter created outright.
   */
  serializeFolderDocument(folder: Folder): string {
    return `${this.serializeFolder(folder)}\n`;
  }
}
