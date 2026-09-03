import type { Vault } from '@core/vault/models/Vault';
import type { VaultResource } from '@core/vault/models/VaultResource';

/**
 * Resolves a `![[...]]` Embed target into the exact `VaultResource` it
 * names — the resource-scoped counterpart to `resolveWikiLink.ts`'s
 * `createWikiLinkResolver`, deliberately much narrower per the approved
 * Resource embed resolution rules:
 *
 * - Exact vault-relative path match only, via `Vault.getResourceByPath` —
 *   the same literal-path lookup `resolveWikiLink.ts` tries first for
 *   Pages, with no second-chance fallback after it.
 * - No alias lookup: `VaultResource` carries no aliases at all (see its
 *   own doc comment, §3b of the spec) — there is no fallback dimension to
 *   search, so there is no `ambiguous` status this resolver could ever
 *   produce (unlike `resolveWikiLink.ts`'s alias-scan branch, which is the
 *   *only* source of its own `ambiguous` result).
 * - No filename-wide fallback across folders: `![[logo.png]]` resolves
 *   only if a resource exists at exactly `<vault root>/logo.png` — if
 *   `Projects/A/logo.png` and `Projects/B/logo.png` both exist instead,
 *   neither is returned; the embed must be folder-qualified
 *   (`![[Projects/A/logo.png]]`) to resolve unambiguously. This mirrors
 *   Pages' own literal-path behavior (a bare `[[Title]]` only matches a
 *   root-level `Title.md`, never a filename-only scan across folders) —
 *   not a new search dimension invented for resources.
 * - No filesystem scan: this is a pure `Vault` lookup, the same
 *   already-live, already-reconciled in-memory state every other resource
 *   consumer reads from (MembershipSelector, ResourceOperations, ...).
 * - Extension required: `path` is the resource's real, full filename
 *   (`hero.png`, never `hero`) — resources are never de-extensioned the
 *   way Page WikiLink targets are (VaultPath.pageName's `.md` stripping
 *   has no resource equivalent; see VaultResource/MoveService's own
 *   extension-preserving conventions).
 *
 * Not currently wired into the editor as an injected `Resolve*` boundary
 * function (unlike `resolveWikiLink.ts`/`ResolveWikiLink`) — this
 * milestone is syntax/autocomplete/resolution only, with no renderer yet
 * to call this at click/render time. A future rendering milestone is
 * expected to wrap this same function into that shape once it exists.
 */
export function resolveResourceEmbed(vault: Vault, path: string): VaultResource | undefined {
  return vault.getResourceByPath(`${vault.root}/${path}`);
}
