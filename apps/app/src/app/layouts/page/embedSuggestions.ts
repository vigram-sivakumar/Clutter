import type { Vault } from '@core/vault/models/Vault';
import type { VaultResource } from '@core/vault/models/VaultResource';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type {
  EmbedResourceSuggestion,
  GetEmbedSuggestions,
} from '@features/markdown/editor/MarkdownEditor';

/**
 * Composes `Vault` + `MembershipSelector` into the editor's injected
 * `GetEmbedSuggestions` boundary — the Embed-scoped counterpart to
 * `wikiLinkSuggestions.ts`'s `createWikiLinkSuggester`. Sources from
 * `MembershipSelector.getAllVisibleResources()` — already the single
 * source of truth for "every visible resource in the vault" (the same
 * query the Assets collection view already uses) — never a second
 * resource collection/query and never a filesystem scan.
 *
 * Matching differs from `createWikiLinkSuggester`'s in one deliberate way:
 * it matches against each resource's full vault-relative path (folder
 * included), not just its filename. This is required, not a stylistic
 * choice — the product spec calls for folder-qualified queries to work
 * (`![[Projects/` showing resources under `Projects/`, `![[Projects/hero`
 * filtering further), which a filename-only match (the existing WikiLink
 * suggester's own behavior) cannot do. A resource's relative path already
 * ends with its filename, so a single substring check against the full
 * path serves both the bare-filename case and the folder-qualified case
 * with no special-casing between them.
 */
export function createEmbedSuggester(
  vault: Vault,
  membershipSelector: MembershipSelector
): GetEmbedSuggestions {
  return (query) => {
    const normalizedQuery = query.trim().toLowerCase();

    // Deterministic, simple order — same reasoning/comparator convention
    // createWikiLinkSuggester's own `byTitle` already establishes, sorted
    // by full path here (folder-qualified) rather than by title alone, so
    // resources sharing a filename group predictably by folder.
    const byPath = (a: EmbedResourceSuggestion, b: EmbedResourceSuggestion) =>
      a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });

    const resources = membershipSelector.getAllVisibleResources();

    // Empty query: a freshly typed `![[` — show every visible resource
    // rather than nothing, same "open immediately" rule
    // createWikiLinkSuggester already applies for a freshly typed `[[`.
    if (!normalizedQuery) {
      return resources.map((resource) => toResourceSuggestion(vault, resource)).sort(byPath);
    }

    return resources
      .filter((resource) => matchesQuery(vault, resource, normalizedQuery))
      .map((resource) => toResourceSuggestion(vault, resource))
      .sort(byPath);
  };
}

/**
 * `resource.path` is root-prefixed (Vault's own storage shape, same as
 * `Page.path`); Embed targets are vault-relative, extension INCLUDED
 * (unlike a WikiLink target, which strips `.md` — see
 * `resolveResourceEmbed.ts`'s own doc comment on why resources are never
 * de-extensioned).
 */
function relativePath(vault: Vault, resource: VaultResource): string {
  return resource.path.startsWith(`${vault.root}/`)
    ? resource.path.slice(vault.root.length + 1)
    : resource.path;
}

function matchesQuery(vault: Vault, resource: VaultResource, normalizedQuery: string): boolean {
  return relativePath(vault, resource).toLowerCase().includes(normalizedQuery);
}

function toResourceSuggestion(vault: Vault, resource: VaultResource): EmbedResourceSuggestion {
  const path = relativePath(vault, resource);

  return {
    kind: 'resource',
    path,
    title: getResourceDisplayName(resource),
    breadcrumb: VaultPath.parentDirectory(path) || null,
    resourceKind: resource.kind,
  };
}
