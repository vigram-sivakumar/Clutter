import type { Vault } from '@core/vault/models/Vault';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { formatDailyNoteTitle } from '@core/presentation/formatDailyNoteTitle';
import { NotePreviewCard } from '@features/collection/components/note/card/NotePreviewCard';
import type { DocumentPreviewResolvers } from '@features/collection/components/note/card/DocumentPreview';
import type { RenderWikiLinkPreview } from '@features/markdown/editor/codemirror/wikilink/WikiLinkPreviewPopover';

import { resolvePageIdentityIcon } from './resolvePageIdentityIcon';

/**
 * Composes `Vault` + `EffectivePageState` into the editor's injected
 * `RenderWikiLinkPreview` — the editor owns the hover lifecycle and popover,
 * never what a page is. Called only once a hover has settled.
 *
 * - A *resolved* link is previewed by loading its page by the id the link
 *   resolved to (`WikiLinkResolution.pageId`) — no second path/alias search.
 *   Content and name come from `EffectivePageState` (session wins over
 *   committed, the same source note embeds read), so an unsaved edit shows;
 *   a Daily Note's title is its human-readable date (`formatDailyNoteTitle`,
 *   as the page header uses), not its `YYYY-MM-DD` filename.
 * - The header (title + icon) is off by default — the preview is the page's
 *   cover and content as one scaled canvas; `showHeader` brings it back.
 * - An *unresolved* link has no page: it never touches `Vault`, and previews
 *   as an empty note under the link's own title. That includes a link whose
 *   target was since renamed — links name targets by path/alias, so the old
 *   link is simply unresolved, and this doesn't change that model.
 */
export function createWikiLinkPreviewRenderer(
  vault: Vault,
  effectivePageState: EffectivePageState,
  resolvers: DocumentPreviewResolvers,
  { showHeader = false }: { showHeader?: boolean } = {}
): RenderWikiLinkPreview {
  return (request) => {
    if (request.kind === 'unresolved') {
      return <NotePreviewCard title={request.title} showHeader={showHeader} />;
    }

    const page = vault.getPage(request.pageId);
    if (!page) {
      return null;
    }
    const effective = effectivePageState.getPage(page.id);
    const name = effective?.name ?? page.name;
    const title =
      page.type === 'daily-note'
        ? formatDailyNoteTitle(name)
        : name.trim().length > 0
          ? name
          : VaultPath.pageName(page.path);
    const { icon, emoji } = resolvePageIdentityIcon(
      page,
      effective,
      vault.isFolderWithinReservedFolder(page.parentId, 'templates')
    );

    return (
      <NotePreviewCard
        title={title}
        icon={icon}
        emoji={emoji ?? undefined}
        markdown={effective?.markdown ?? page.source.markdown}
        cover={effective?.cover}
        coverHidden={effective?.coverHidden}
        coverPositionAbove={effective?.coverPositionAbove}
        showHeader={showHeader}
        resolvers={resolvers}
      />
    );
  };
}
