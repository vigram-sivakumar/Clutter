# Page title icon images — investigation and implementation plan

**Status:** Deferred — not implemented. Use this document when resuming work.

**Goal:** Extend page and folder title icons so users can choose either an **emoji** (existing) or an **uploaded image**. The same icon must appear consistently in page/folder headers and sidebar rows. Reuse the existing asset import, Vault resource index, metadata operations, and image presentation patterns. Do not duplicate upload logic or store absolute paths / Base64 in frontmatter.\n\n**UX invariant:** Never show a broken image, an empty icon slot, or a flash of a broken/late-loading image. Keep the emoji or generic fallback visible until the image has loaded successfully.

---

## Current behavior

- Page and folder headers show a user-set **emoji** in a 72×72 slot (`PageHeaderControls`).
- Persistence: frontmatter key `icon` → `PageMetadata.icon` / `FolderMetadata.icon` (`string | null`).
- Write path: `PageOperations.updateMetadata` / `FolderOperations.updateMetadata` only.
- UI: `ChangeIconPicker` (emoji-only `Popover` + `EmojiTray`); `PageHeaderMoreActionsMenu` offers Emoji when no icon is set.

---

## Phase 1 — Existing architecture (reference)

### Space avatar (reuse target)

| Piece | Location | Role |
|--------|----------|------|
| `SpaceAvatarPicker` | `components/space-avatar-picker/` | Emoji / Image tabs, Remove; `EmojiTray` + `ImagePickerUpload` |
| `SpaceAvatar` | `components/space-avatar/` | Renders emoji or image; `onError` → initial fallback |
| `ImagePickerUpload` | `app/layouts/page/cover/image-picker/` | Tauri file dialog → absolute path |
| `Application.applySpaceProfile` | `core/application/Application.ts` | Image → `importCoverAsset` → vault-relative `src` in `workspace.json` |
| `SpaceProfileStore` | `core/application/space/SpaceProfileStore.ts` | Typed `{ type: 'emoji' \| 'image', … }` in `.clutter/workspace.json` |

`SpaceAvatarPicker` is **upload-only** (no vault asset browser) by design for spaces without a vault yet.

### Asset import pipeline (single path)

```text
ImagePickerUpload → absolute path
  → Application.importCoverAsset(sourceAbsolutePath)
  → importCoverAsset → importAsset(fileSystem, vaultRoot, sourceAbsolutePath)
  → Assets/ with collision-free name
  → returns vault-relative reference (e.g. Assets/photo 2.png)
  → VaultSyncService.reconcileKnownPath (asset visible in index)
```

- **Non–Persistence Gate** write (same as covers and Space avatars); see `core/vault/asset/importAsset.ts` and `ARCHITECTURE_RULES.md` rule 2 scope.
- Default destination: `Assets/` at Space root (not `Assets/page-icons/` unless product adds `destinationFolderPath` later).

### Cover (parallel pattern for vault-relative refs)

- Frontmatter: `cover: Assets/…` or external URL.
- Upload: same `importCoverAsset` + `updateMetadata({ cover: relativePath, … })`.
- Display: `Application.resolveCoverImageForDisplay` + `CoverImageUrlResolver`.

### Page title stack

```text
Page.TitleSection → PageHeaderControls
  → emoji: AppIcon (editable) or system icon (read-only)
  → PageHost: onSelectEmoji / onRemoveEmoji → updateMetadata({ icon })
```

Folder collection pages use the same header controls via `folderOperations.updateMetadata`.

### Frontmatter today

- `PageFrontmatter.icon?: string` — treated everywhere as **emoji text**.
- `FrontmatterSerializer` writes `icon` when non-null; key in `OWNED_FRONTMATTER_KEYS`.
- Hand-editing `icon: Assets/foo.png` would render as literal emoji text via `AppIcon` — not supported intentionally.

### Presentation consumers of `icon` (emoji-only today)

- `buildEntryPresentation`, sidebar `Note`/`Folder` rows
- `resolvePageIdentityIcon`, WikiLinks, embeds, search, `EffectivePage.icon`

Image icons in the **header only** can ship first; listing/embed sites can follow in a later milestone.

### Asset move rewrite (gap)

`planMovedAssetReferences` updates **cover** and **Space avatar**, not page/folder **icon**. ADR-049-style moves will need `iconImage` included when this feature ships.

---

## Phase 2 — Recommended frontmatter schema

### Do not overload `icon`

Keep `icon` for emoji so existing pages and all emoji-oriented code paths stay unchanged.

### Add `iconImage`

| State | Frontmatter |
|--------|-------------|
| None | Both omitted |
| Emoji | `icon: "📝"` — no `iconImage` |
| Image | `iconImage: Assets/hero.png` — clear / omit `icon` |

**Mutual exclusion on write:**

- Pick emoji → set `icon`, clear `iconImage`.
- Pick image → set `iconImage`, clear `icon`.
- Remove → clear both.

**Read normalization (corrupt / hand-edited files):** If both are present, prefer `iconImage` only when it passes the shared Vault-relative path validation and exists in the Vault index; otherwise use a valid emoji. Normalize the conflict on the next successful metadata save. Do not mutate Markdown during rendering.

**Constraints:**

- No Base64, no absolute filesystem paths in frontmatter.
- Only vault-relative references produced by `importCoverAsset` (same as cover assets).
- Survives Space relocation (path is relative to vault root).
- Missing, invalid, unsupported, or non-canonical file: do not attempt to render it; use the emoji fallback, otherwise the generic default icon. Clear stale `iconImage` metadata through the relevant operations API on open/relevant Vault sync, without blocking rendering.

Apply the same keys to folder metadata using the existing FolderOperations and folder metadata persistence path. Folders do not use `.folder.md`; do not introduce that file or a new sidecar persistence mechanism.

**Durability:** Metadata edits follow the normal Gate path (Committed → Durable → Reconciled per `docs/durability-model.md`). Asset copy ordering should match avatar/cover (rollback created asset if metadata write fails, where applicable).

Optional: store under `Assets/page-icons/` via `importAsset(..., destinationFolderPath)` — not required for v1; default matches avatar/cover (`Assets/` root).

---

## Phase 3 — Component reuse

### Reuse as-is

- `SpaceAvatarPicker` (or one shared emoji+upload popover extracted from it)
- `ImagePickerUpload`
- `Application.importCoverAsset`
- Shared Vault-relative asset validation/resolution extracted from the cover implementation (do not make icon UI depend on a cover-specific API)
- `PageOperations.updateMetadata` / `FolderOperations.updateMetadata`

### Do not use for v1 page icon

- Full `ImagePicker` (Unsplash, link, asset tab) — cover-specific; requirement is upload from computer.
- A second upload API or Base64 in frontmatter.

### Extend

| Area | Change |
|------|--------|
| Shared picker | Converge `ChangeIconPicker` and `SpaceAvatarPicker` (tabs + upload + remove), or use `SpaceAvatarPicker` in `PageHeaderControls` with page-specific callbacks |
| `PageHeaderControls` | Render image in 72×72 slot; wire upload/remove; reuse image error fallback styling from `SpaceAvatar` |
| `PageHeaderMoreActionsMenu` | First-time “Change icon”: emoji and image, not emoji-only |
| `Page.TitleSection` / `PageHost` | Handlers: import → `updateMetadata` with mutual exclusion |
| Models | `iconImage: string \| null` on page/folder metadata + frontmatter types |

### Optional presentation helper

`resolvePageIconDisplay(metadata) → { kind: 'none' | 'emoji' | 'image', … }` for header (and later sidebar/embeds).

---

## Phase 4 — Implementation checklist

### Architecture (read before coding)

1. `docs/implementation-rules.md`
2. Relevant `docs/architecture-specification.md` sections: `PageOperations`, ingest/serializer, Persistence Gate boundary for assets
3. Consider a short ADR or spec amendment for owned key `iconImage` + mutual exclusion with `icon`

### Vault / ingest

- [ ] `PageMetadata`, `FolderMetadata` — `iconImage`
- [ ] `PageFrontmatter`, `FolderFrontmatter`
- [ ] `OWNED_FRONTMATTER_KEYS`, `resolvePageMetadata` (+ folder path)
- [ ] `FrontmatterSerializer` (page + folder, write order near `icon`)
- [ ] Tests: round-trip, emoji-only unchanged, mutual exclusion on serialize

### Application

- [ ] `PageOperations` / `FolderOperations` — `EditablePageMetadata`, patch merge, clear opposite field
- [ ] `EffectivePageState` — `iconImage` for session-over-committed
- [ ] `rewriteMovedAssetReferences` — pages/folders `iconImage`
- [ ] `archivedAssetReferences` — if delete/archive guards need `iconImage`

### UI

- [ ] `PageHost` — `onUploadIconImage`, folder equivalents; async + toast on failure (cover pattern)
- [ ] `PageHeaderControls`, CSS, `PageHeaderMoreActionsMenu`, `Page.TitleSection`
- [ ] Shared picker refactor

### Tests

- [ ] Frontmatter round-trip and `PageOperations` mutual exclusion
- [ ] Header render/change/remove; archived read-only
- [ ] Missing asset fallback
- [ ] Move rewrite for `iconImage`
- [ ] Regression: existing emoji flows

### Suggested milestones

1. Schema + persistence only (no UI).
2. Page header (notes + folder collection headers on `PageHost`).
3. Asset move reference rewrite.
4. Sidebar / WikiLinks / search / sidebar `ChangeIconPicker` (product scope).

---

## End-to-end flow (target)

```mermaid
flowchart TB
  subgraph ui [UI]
    picker[SpaceAvatarPicker or shared picker]
  end
  subgraph app [Application]
    import[importCoverAsset]
    umd[updateMetadata]
  end
  subgraph persist [Persistence]
    ser[FrontmatterSerializer]
    fm["icon / iconImage in .md or .folder.md"]
  end
  picker -->|upload path| import
  import -->|Assets/… reference| umd
  picker -->|emoji| umd
  umd --> ser
  ser --> fm
```


---

## Required behaviour: sidebar, loading fallback, and stale-reference cleanup

This section supersedes any earlier wording that limited image icons to headers.

The feature includes **page headers, folder headers, note sidebar rows, and folder sidebar rows** from the first release. All four surfaces must use the same shared icon presentation behaviour. Do not implement separate image checks in each component.

### Fallback-first rendering

| Condition | Presentation |
|---|---|
| Image is valid and has loaded successfully | Show image |
| Image is being resolved or loaded | Keep emoji visible, otherwise generic default icon |
| Image is missing, moved, invalid, unsupported, or fails to decode | Keep emoji visible, otherwise generic default icon |
| No image, valid emoji exists | Show emoji |
| Neither image nor emoji exists | Show generic default icon |

Never render an unverified image URL and wait for an image error to replace it. Keep the fallback visible until the image load event confirms success; only then reveal the image. On error, remain on the fallback. When the reference changes, reset loading state for the new reference and never briefly show the previous image. Preserve each surface's existing icon dimensions/layout.

The image element's error handler is a final presentation safeguard, not the source of truth for local Vault file existence. For Vault-managed assets, validate using the same canonical path, supported-resource, internal-path, and Vault-index rules already used by the cover resolver. Extract/reuse that logic at a shared boundary; do not create a second path validator or make icon presentation depend on a cover-named API.

### Missing and invalid reference reconciliation

When a note or folder is opened, and when Vault sync reports a relevant asset move/deletion:

1. Validate the iconImage reference using the shared Vault-relative path validation and resource-index check.
2. If it is invalid, unsupported, non-canonical, or missing from the Vault index, do not attempt to load it.
3. Clear only iconImage through PageOperations.updateMetadata or FolderOperations.updateMetadata.
4. Preserve a valid emoji fallback. If no emoji exists, show the generic default icon.
5. If metadata cleanup fails, continue opening/rendering with the safe fallback. Keep the reference for a later retry; do not block the UI.
6. Do not delete the image file itself.
7. Deduplicate reconciliation so sidebar rendering never enqueues writes on every render. Trigger it from an application-owned open/sync lifecycle, not from React render.

Do not infer that an arbitrary unindexed path is missing without applying the explicit validation rules. For iconImage, however, only canonical, supported, Vault-relative image references are valid; unsupported/unindexable references must be cleared.

### Asset movement

Extend planMovedAssetReferences / rewriteMovedAssetReferences to include page and folder iconImage references, alongside cover and Space avatar references. Rewrite references when a supported move/rename completes. Do not clear a reference while an in-progress supported move is being reconciled; use the completed Vault sync/move result.

### Implementation and test requirements

- [ ] Shared fallback-first icon presentation used by page header, folder header, note sidebar row, and folder sidebar row.
- [ ] Keep fallback visible until successful image load; no broken-image flash, blank slot, or stale previous image when the reference changes.
- [ ] Missing, moved, invalid, non-canonical, unsupported, and decode-failing image references never appear as broken images.
- [ ] Preserve emoji fallback; use generic default when no emoji exists.
- [ ] Reconcile stale iconImage on open and relevant Vault sync events through the existing operations APIs.
- [ ] Reconciliation is deduplicated and never runs as a render side effect.
- [ ] Failed cleanup does not block opening/rendering and can be retried on a later meaningful lifecycle event.
- [ ] Asset move/rename rewrites page and folder iconImage references.
- [ ] Existing emoji flows and archived/read-only constraints remain unchanged.
- [ ] Folder metadata continues using its existing persistence mechanism; no .folder.md is introduced.


---

## Open decisions when resuming

1. **Scope of milestone 2:** Page header only vs include sidebar rows in the same PR.
2. **Subfolder:** `Assets/` root (recommended) vs `Assets/page-icons/`.
3. **Picker naming:** Extract shared `EmojiOrImageIconPicker` vs wire `SpaceAvatarPicker` directly in header.
4. **Spec/ADR:** Whether `iconImage` needs an explicit ADR before merge.

---

© 2026 Vigram Sivakumar. Proprietary.
