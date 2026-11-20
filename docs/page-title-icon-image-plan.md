# Page and folder icon images — implementation plan

**Status:** Implementation in progress on `feature/page-icon-component`.

**Goal:** Keep `icon` as the existing emoji field and add `iconImage` for a local image asset. Render the same identity consistently in page/folder headers, sidebar rows, Daily Notes, and Collection views. Reuse the existing PageIcon, SpaceAvatarPicker, asset import, Vault resolver, metadata operations, and asset-move rewrite paths.

---

## Resolved product and architecture decisions

1. **Folder persistence:** folder icon metadata uses the existing `.folder.md` frontmatter path. This is already the authoritative user-folder metadata mechanism: `FolderBuilder` reads it, `FrontmatterSerializer` writes it, and `FolderOperations.updateMetadata()` persists changes. Do not create a second folder metadata store or alter folder identity. The earlier prohibition on `.folder.md` in this plan was incorrect and is superseded by this decision.
2. **Asset location:** upload to the existing vault-root `Assets/` folder through `Application.importCoverAsset()`. Do not introduce `Assets/page-icons/` or a second import API.
3. **Frontmatter:** `icon` remains emoji text. `iconImage` is a new owned, vault-relative reference. No URLs, absolute paths, or Base64 are accepted.
4. **Mutual exclusion:** selecting an emoji clears `iconImage`; selecting an image clears `icon`; Remove clears both. Clearing only an invalid image reference preserves the emoji fallback.
5. **Read conflicts:** when both fields are hand-edited, a valid image takes precedence visually; an invalid image falls back to the emoji. The next successful metadata update normalizes the pair through the shared patch helper.
6. **Presentation scope:** page/folder headers, Notes sidebar rows, folder sidebar rows, Daily Notes rows, and Collection list/table/card/folder-card views use `PageIcon`. WikiLinks, embeds, search, and unrelated identity projections remain out of scope.
7. **Sizing:** `PageIcon` owns explicit context variants: `small` (20px slot / 16px glyph), `medium` (24px / 16px), and `large` (72px / 64px). Emoji fills the slot; system glyphs use the glyph size; images fill the slot with `object-fit: contain`.
8. **Invalid assets:** unresolved, missing, unsupported, non-canonical, absolute, or remote references render the fallback immediately. When the page/folder is opened, stale metadata is cleared through its existing operations facade. A browser decode failure also clears the same reference if it is still current. Cleanup is best-effort and never blocks rendering.
9. **Asset moves:** app-initiated asset moves rewrite page and folder `iconImage` references through the existing `planMovedAssetReferences` workflow. The Assets catalog and archive-reference guard count icon uses.

---

## Existing architecture to reuse

| Concern | Existing owner / path |
|---|---|
| Emoji + upload picker | `SpaceAvatarPicker`, `EmojiTray`, `ImagePickerUpload` |
| Shared icon rendering | `PageIcon` composes `AppIcon`; no duplicate emoji/SVG renderer |
| Image import | `Application.importCoverAsset()` → existing `importAsset` pipeline → `Assets/` relative reference |
| Page metadata | `PageOperations.updateMetadata()` → Persistence Gate → `FrontmatterSerializer` |
| Folder metadata | `FolderOperations.updateMetadata()` → existing `.folder.md` persistence path |
| Path and resource validation | `Application.resolvePageIconImageForDisplay()`, reusing the existing Vault-index validation and `CoverImageUrlResolver` |
| Asset movement | `planMovedAssetReferences` / `rewriteMovedAssetReferences` |
| Asset usage catalog | `AssetCatalogBuilder` with usage `icon` |
| Archive safety | `archivedAssetReferences` |

Do not add a second image importer, filesystem path validator, metadata writer, folder persistence mechanism, or asset-move subsystem.

---

## Persistence contract

- `PageMetadata.iconImage?: string | null`
- `FolderMetadata.iconImage?: string | null`
- `PageFrontmatter.iconImage?: string`
- `FolderFrontmatter.iconImage?: string`
- `iconImage` is included in `OWNED_FRONTMATTER_KEYS` and serialized adjacent to `icon`.
- The parser fingerprint is bumped to version 7 because the parser now returns an additional owned frontmatter field.
- `EffectivePageState` projects the durable page reference; drafts do not create a second icon-image state.
- The shared `normalizeIconMetadataPatch` helper enforces emoji/image mutual exclusion for both operations facades.

---

## Rendering and failure behaviour

1. The caller resolves a persisted reference through `Application.resolvePageIconImageForDisplay()`; `PageIcon` never reads the filesystem or metadata.
2. `PageIcon` keeps the emoji/system fallback visible while the image loads.
3. It reveals the image only after `onLoad`; `onError` immediately restores the fallback and reports the failure to the owning page/folder.
4. On active page/folder open, the application checks whether the stored reference resolves to an indexed image. A missing/invalid reference is cleared through `PageOperations` or `FolderOperations`.
5. A decode failure clears the reference only if metadata still contains the same failed reference; stale callbacks cannot clear a newer selection.
6. If metadata cleanup fails, the UI remains usable and a later open retries.

---

## Asset lifecycle

- `AssetCatalogBuilder` records page/folder icon references as usage `icon`, independently from source (local/remote).
- `archivedAssetReferences` includes icon references so an asset still used by a page/folder is not treated as unreferenced.
- `rewriteMovedAssetReferences` updates icon paths alongside body and cover references; failures use the existing asset-move feedback structure with usage `icon`.
- No special icon-only asset storage or movement service is introduced.

---

## Implementation checklist

### Completed in this branch

- [x] Add page/folder metadata and frontmatter fields.
- [x] Own, parse, and serialize `iconImage`; bump parser fingerprint and golden sample.
- [x] Enforce mutual exclusion through one shared patch normalizer.
- [x] Add strict Vault-aware display resolution and open/decode-failure cleanup.
- [x] Add PageIcon context sizes, fallback-first loading, and decode-error callback.
- [x] Wire upload and display into page/folder headers using `SpaceAvatarPicker` and `ImagePickerUpload`.
- [x] Render images in Notes/Favorites/Folder sidebar rows, Daily Notes, and Collection views.
- [x] Rewrite moved page/folder icon references and include icon usage in Assets/archive reference accounting.
- [x] Add focused unit tests for resolver, PageIcon loading/error, patch normalization, serializer, folder builder, asset catalog, archive references, and asset moves.

### Still to verify / finish

- [ ] Run the full app typecheck and targeted Vitest suites locally.
- [ ] Review all UI call sites and existing regression tests after the new leading icon nodes.
- [ ] Validate on macOS: upload, restart, move/rename asset, missing file, corrupt image, and folder metadata persistence.
- [ ] Confirm archived/read-only views remain non-editable and fallback correctly.
- [ ] Update the architecture specification and ADR record to match the implemented contract.

---

## End-to-end flow

```text
SpaceAvatarPicker / first-time More Actions upload
  → ImagePickerUpload (absolute source path)
  → Application.importCoverAsset()
  → Assets/<collision-free filename>
  → vault-relative iconImage
  → PageOperations / FolderOperations.updateMetadata()
  → Persistence Gate
  → FrontmatterSerializer
  → page .md / folder .folder.md
  → Application.resolvePageIconImageForDisplay()
  → PageIcon (fallback first; image only after load)
```

---

© 2026 Vigram Sivakumar. Proprietary.
