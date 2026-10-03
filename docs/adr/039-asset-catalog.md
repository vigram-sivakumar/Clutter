# ADR-039: The Assets catalog — every asset Clutter knows about or uses, derived from vault files and page/folder references

**Status:** Accepted (product direction, Vigram, 2026-10-03)

## Context

The Assets collection listed exactly the `VaultResource`s on disk (`MembershipSelector.getAllVisibleResources`). But Clutter also *uses* assets that are not vault files: remote images in Markdown (`![Mountain](https://…)`) and remote covers. And a vault file that three notes embed and one page uses as a cover should be one asset, not four. Nothing modelled "an asset and where it is used": page analysis extracts only `![[wikilink]]` embeds (not `![alt](src)` images), and `cover` is just a frontmatter string.

## Decision

1. **Concepts are separate.** An `Asset` has a **source** (`local` | `remote`) and a **kind** (`image` | `pdf`); *usage* (`embed` | `cover` | `attachment`) belongs to each **reference**, never to the asset. There is no "cover asset" type: a local image used as a cover and embedded is one `local` asset with two references. `attachment` is vocabulary only — nothing attaches files today, so nothing produces it (rule 13: no speculative machinery).
2. **Identity is the canonical reference.** A local asset is its `VaultResource` (id = resource id; the resource stays the source of truth for path, metadata and lifecycle). A remote asset is its URL (id = `remote:` + URL, kept exactly as written, never copied into the vault). The same URL in many notes is one asset.
3. **Derived, not stored.** `AssetCatalogBuilder` (`core/application/membership`, pure — application-level, so it may read `vault/ingest` without a `knowledge → ingest` cycle) builds the catalog from the visible resources, pages and folders. Nothing is persisted and no new `Vault` state is added. The only cache is a per-`Page`-object memo of parsed image sources, so an unrelated change doesn't re-parse every note.
4. **Sources of references.**
   - `![[file.ext]]` wikilink embeds → the existing `page.analysis.embeds`, counted only when the target resolves to a vault resource (a note embed is not an asset).
   - `![alt](src)` standard images → a new `ImageReferenceExtractor`, run over `page.source.markdown` at catalog-build time (not added to `ScannedPageAnalysis`, which would have changed every page fixture and persisted derivable data). Ignores code (shared `markdownCodeRanges`, which replaces the duplicated fenced-code helpers in the tag/task extractors). A destination may contain raw spaces, a title is dropped.
   - covers → `metadata.cover` of pages and folders (a hidden cover is not a use).
   A reference resolves to a vault resource by the same exact vault-relative path rule `resolveResourceEmbed` uses (plus a percent-decoded and `./`-stripped candidate); `http(s)://` is remote.
5. **Visibility.** `MembershipSelector.getAllAssets()` applies the existing rules: local files as `getAllVisibleResources`; a *use* counts only from a page or folder that is not dot-hidden, not archived and not inside an archived folder. Archiving a note therefore stops its remote images appearing; a vault file stays listed regardless.
6. **Metadata.** `kind`, `source`, a MIME type derived from the extension (absent when it can't be told), the file or URL, and `references` (page/folder id + usage). "Is a cover" / "is embedded" are derived from `references` (`isAssetUsedAs`).
7. **Out of scope / decisions to revisit.** A local reference whose file does not exist is *not* listed (only remote assets exist without a vault file). Remote assets have no file size or timestamps (ADR-038 metadata is local-only) and cannot be renamed, archived or moved; they open in the plain image overlay.

## Alternatives considered

- *Store references in `PageAnalysis`* — persists derivable data and touches every page fixture.
- *A new `Vault` lazy projection* — new invalidation triggers (resources, folder metadata) for a view that is cheap to derive.
- *Model "cover" as an asset type* — conflates source with usage; the same file would appear twice.

## Consequences

- `AssetsCollectionBody` and the asset card/list/table take `Asset` instead of `VaultResource`; the table gains a Source column and the list marks remote assets.
- Spec §3c documents the catalog; `Vault`, the Gate, Sync and the persisted view config are unchanged.
- Every Assets render re-derives the catalog (one pass over pages' memoized sources); if that ever shows up in profiling, memoizing at the selector is the next step.

## Amendment: actions on a remote asset (Save to vault)

A remote asset opened in the image overlay gets the *same* asset menu as a vault file, adapted by source (`buildResourceSidebarMenu(kind, source)` is the one definition and the one order): **Save to vault** (stands in for Move to…), **Open in browser** (Reveal in Finder), **Copy link** (Copy path), **Download**, then **Set as cover image** (listed but unavailable until it is wired). Rename and Archive have no file to act on and are absent.

**Save to vault** is the one action that writes. It adds an optional, binary-only `VaultFileSystem.writeBinaryFile(path, bytes)` primitive (like `stat`/`duplicate`: only providers that can write bytes need it) and `importRemoteAsset`, the URL counterpart of `importAsset`; both share `resolveAssetDestination`, so every imported asset is named by one rule (collision-free, in `Assets/`). It is a non-Gate write for the same reason `importAsset` is (an asset file is not Page/Folder domain content). The binary write is deliberately **not** registered as a self-write: the watcher's "created" event is how Sync adds the new file to the Vault, so it then appears in the Assets collection as a local asset (the remote entry for the same URL stays, as it is still referenced).

