import type { EditablePageMetadata, PageOperations } from '@core/application/page/PageOperations';
import { evaluateTemplateMarker } from '@core/vault/ingest/frontmatter/templateMarker';
import type { PageMetadata } from '@core/vault/models/PageMetadata';

/**
 * What a new note inherits from its template's metadata, besides the body:
 *
 *  - the icon, and the cover (the reference only — a vault-relative `Assets/…` path or a URL, so the
 *    image file is shared, never duplicated) with how it is presented;
 *  - the tags and the description;
 *  - the custom properties (the user's own frontmatter keys), minus the `kind: template` marker, which
 *    marks a page living in Templates and is not the new note's to carry (ADR-041).
 *
 * Never inherited: aliases, favorite, id, created/modified and the archive fields. They are not in the
 * returned patch, so the new note's own id and timestamps come from its creation, and nothing here can
 * carry them across.
 *
 * Only values that differ from a page's defaults are returned, so a template with none of these yields
 * an empty patch and the note stays a plain draft. The cover's presentation settings are meaningless
 * without a cover, so they are inherited only alongside one.
 */
export function pickInheritedTemplateMetadata(
  template: Pick<
    PageMetadata,
    'icon' | 'cover' | 'coverHidden' | 'coverLayout' | 'coverPositionAbove' | 'coverPositionSide'
  > &
    Partial<Pick<PageMetadata, 'description' | 'tags' | 'unownedFrontmatter'>>
): Partial<EditablePageMetadata> {
  const patch: { -readonly [K in keyof EditablePageMetadata]?: EditablePageMetadata[K] } = {};

  if (template.icon) {
    patch.icon = template.icon;
  }

  if (template.cover) {
    patch.cover = template.cover;
    patch.coverHidden = template.coverHidden;
    patch.coverLayout = template.coverLayout;
    patch.coverPositionAbove = template.coverPositionAbove;
    patch.coverPositionSide = template.coverPositionSide;
  }

  if (template.description) {
    patch.description = template.description;
  }

  if (template.tags && template.tags.length > 0) {
    patch.tags = template.tags;
  }

  const customLines = template.unownedFrontmatter ?? [];
  // The one marker rule (evaluateTemplateMarker): outside Templates, `kind: template` is removed and any
  // other `kind` — the user's own — is kept. null: already nothing to remove.
  const properties = evaluateTemplateMarker(customLines, false) ?? customLines;

  if (properties.length > 0) {
    patch.unownedFrontmatter = properties;
  }

  return patch;
}

/**
 * "New note from a template": opens an ordinary new-note draft in `folderId`
 * (the same openDraft(...) every other "New note" entry point uses), then puts
 * the template's body into it through mutateBody() — the sanctioned route for
 * template insertion (ADR-031). The template itself is never opened or
 * changed. The body is copied, and — when `templateMetadata` is given — so is
 * what pickInheritedTemplateMetadata picks (icon, cover, tags, description,
 * custom properties); the title, aliases and favorite are not. The new note has its own id and
 * timestamps (the draft's).
 *
 * Inheriting any of it goes through updateMetadata(), which — like any
 * metadata change on a draft — makes the note a real page at once, with the
 * body and the inherited fields written in that one create. A template with
 * none of it leaves the note a draft until it is saved like any other new note,
 * and a blank template with neither leaves the empty draft.
 */
export async function createNoteFromTemplate(
  pageOperations: PageOperations,
  folderId: string | null,
  templateMarkdown: string,
  templateMetadata?: Parameters<typeof pickInheritedTemplateMetadata>[0]
): Promise<void> {
  const draftId = await pageOperations.openDraft({ folderId });

  if (templateMarkdown.trim() !== '') {
    await pageOperations.mutateBody(draftId, () => templateMarkdown);
  }

  const inherited = templateMetadata ? pickInheritedTemplateMetadata(templateMetadata) : {};

  if (Object.keys(inherited).length > 0) {
    await pageOperations.updateMetadata(draftId, inherited);
  }
}
