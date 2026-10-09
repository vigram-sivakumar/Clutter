import type { EditablePageMetadata, PageOperations } from '@core/application/page/PageOperations';
import type { PageMetadata } from '@core/vault/models/PageMetadata';

/**
 * The template's visual identity a new note inherits: its icon and cover (the
 * reference only — a vault-relative `Assets/…` path or a URL, so the image file
 * is shared, never duplicated) plus how that cover is presented. Nothing else:
 * id, timestamps, tags, aliases, favorite, description and custom properties
 * stay the new note's own.
 *
 * Only values that differ from a page's defaults are returned, so a template
 * with no visual metadata yields an empty patch and the note stays a plain
 * draft. The cover's presentation settings are meaningless without a cover, so
 * they are inherited only alongside one.
 */
export function pickInheritedTemplateMetadata(
  template: Pick<
    PageMetadata,
    'icon' | 'cover' | 'coverHidden' | 'coverLayout' | 'coverPositionAbove' | 'coverPositionSide'
  >
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

  return patch;
}

/**
 * "New note from a template": opens an ordinary new-note draft in `folderId`
 * (the same openDraft(...) every other "New note" entry point uses), then puts
 * the template's body into it through mutateBody() — the sanctioned route for
 * template insertion (ADR-031). The template itself is never opened or
 * changed. The body is copied, and — when `templateMetadata` is given — so are
 * the template's icon and cover (pickInheritedTemplateMetadata); the title,
 * tags and properties are not. The new note has its own id (the draft's).
 *
 * Inheriting an icon or cover goes through updateMetadata(), which — like any
 * icon/cover change on a draft — makes the note a real page at once, with the
 * body and the inherited fields written in that one create. A template with
 * neither leaves the note a draft until it is saved like any other new note,
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
