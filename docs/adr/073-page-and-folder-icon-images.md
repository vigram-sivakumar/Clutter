# ADR-073: Page and Folder Icon Images

**Status:** Accepted

## Context

Pages and folders already persist a user-selected emoji in the owned frontmatter key `icon`. The same identity icon is rendered in headers and listing surfaces. Supporting an uploaded image must not overload the emoji field, duplicate the asset import pipeline, introduce a second folder metadata store, or make presentation components responsible for filesystem validation.

The repository already provides all required infrastructure:

- `PageOperations.updateMetadata()` and `FolderOperations.updateMetadata()` are the existing metadata write facades.
- Page metadata is persisted in the page's Markdown frontmatter.
- User-folder metadata is persisted in the existing `.folder.md` frontmatter and built by `FolderBuilder`; `.folder.md` is not a new subsystem or a folder identity requirement.
- `Application.importCoverAsset()` imports a local image into the existing `Assets/` folder and returns a vault-relative reference.
- `CoverImageUrlResolver` and the Vault resource index already provide the display URL boundary.
- `planMovedAssetReferences` already plans rewrites for body references, covers and Space avatars.
- `AssetCatalogBuilder` derives local asset usage from page and folder metadata.

This is a metadata and presentation extension of existing paths, not a new subsystem.

## Decisions

### 1. Keep emoji and image as separate metadata fields

Add optional `iconImage: string | null` to `PageMetadata` and `FolderMetadata`, and `iconImage?: string` to `PageFrontmatter` and `FolderFrontmatter`.

- `icon` remains emoji text; existing emoji-only notes and folders remain unchanged.
- `iconImage` stores only a vault-relative local image reference, such as `Assets/page-icon.png`.
- `iconImage` is an owned frontmatter key and is serialized adjacent to `icon`.
- The parser fingerprint is bumped when the parser starts returning this owned field.

The fields are mutually exclusive on normal writes:

- Selecting an emoji writes `icon` and clears `iconImage`.
- Selecting an image writes `iconImage` and clears `icon`.
- Removing the icon clears both.
- Clearing only an invalid image reference preserves the emoji fallback.

Both `PageOperations` and `FolderOperations` use one shared pure patch normalizer so the rule is not duplicated across facades.

### 2. Reuse existing folder persistence

Folder icon images are written through `FolderOperations.updateMetadata()` and the existing folder metadata serializer. The folder's `.folder.md` remains the persisted metadata document. No new file, database, marker, or folder identity rule is introduced.

### 3. Reuse existing image import and display boundaries

The UI uses `ImagePickerUpload` and `Application.importCoverAsset()`. The asset is imported to `Assets/`; only the returned relative reference is written to metadata.

`Application.resolvePageIconImageForDisplay()` is the single display boundary for both page and folder icons. It reuses the existing Vault-index/path validation and URL resolver, and rejects remote URLs, absolute paths, non-canonical paths, unsupported resources, missing resources, and non-image resources.

`PageIcon` is a presentation component that composes `AppIcon`. It does not access the filesystem or mutate metadata. It renders the fallback until the image successfully loads, and restores the fallback immediately on decode failure.

### 4. Reconcile invalid references through the existing operations facades

On opening a page or folder, Application checks the stored reference against the current Vault resource index. Missing or invalid references are cleared through `PageOperations.updateMetadata()` or `FolderOperations.updateMetadata()`. Decode failures clear the reference only if the metadata still points at the failed reference.

Cleanup is best-effort: failure never blocks rendering, and a later open retries. No metadata writes occur during render.

### 5. Include icon images in existing asset lifecycle paths

- `rewriteMovedAssetReferences` rewrites page and folder `iconImage` references alongside body and cover references.
- `AssetCatalogBuilder` records local icon references with usage `icon`.
- `archivedAssetReferences` counts icon references when deciding whether an asset is still referenced.

No second asset-move planner or icon-specific asset catalog is created.

### 6. Shared presentation scope

Use `PageIcon` in page/folder headers, Notes sidebar rows, Daily Notes, and Collection list/table/card/folder-card surfaces. WikiLinks, embeds, search and other secondary identity projections are not part of this change.

## Consequences

- Existing emoji frontmatter and rendering remain compatible.
- Page and folder metadata follow their established persistence boundaries.
- Image loading failures never expose a broken image or blank icon slot.
- Asset moves and archive/reference accounting remain consistent with icon usage.
- The parser cache is invalidated once for the newly owned key; no migration of user files is needed.
- The image import and metadata write are separate existing operations; no new transactional asset-import subsystem is introduced.

## Alternatives considered

- **Overload `icon` with a path:** rejected because existing emoji-oriented consumers would display paths as emoji text and the field would become ambiguous.
- **Store absolute paths or Base64:** rejected because they do not survive Space relocation and bypass the existing Assets lifecycle.
- **Create `.folder-icon` or another folder metadata file:** rejected because `.folder.md` already owns folder metadata.
- **Use the cover-specific display API directly from components:** rejected; icon components receive a resolved URL from Application and remain filesystem-agnostic.
- **Build a second asset move or import service:** rejected; the existing import and move planners already own these responsibilities.
