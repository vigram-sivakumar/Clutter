# Assets collection file drops

## Scope

File importing is enabled only on Assets collection pages. The earlier editor file-drop handler, insertion-position plugin, Markdown insertion API and editor-drop tests have been removed. The Markdown editor and its extensions match the main-branch versions; existing paste and internal text dragging keep their existing behavior.

## Destinations and feedback

The optional file-drop capability belongs to the shared Page wrapper, rather than just the collection body. Asset cards, table/list rows, the page header, covers, whitespace and empty states all lie within that surface. Notes and other collection pages do not install its handlers.

Folder cards in an Assets collection carry their folder identity. Both the native and DOM paths resolve the actual hit element to its closest folder card, or to the page when no folder is hit. The existing `DropFeedback` component highlights that same target: the folder card for a folder import, or the page for a current-collection import. Folder titles, icons and padding all count as the folder target.

A drop on a folder imports into that folder without opening it. A drop anywhere else imports into the collection being viewed, including an Assets subfolder. PageHost resolves the folder ID through the live Vault model at drop time; a missing folder or one no longer inside Assets is rejected. Existing import methods enforce archived destinations, Space permissions and collision-safe naming. Portaled overlays and the sidebar are outside the page's DOM surface and do not import into the underlying page.

## Native and browser routing

Previously no native file-drop subscription or DOM asset-drop target existed. CodeMirror's text drop handler and the clipboard paste handler do not import Finder paths. Tauri's native drop handling remains explicitly enabled in the base window configuration.

`useFileDropTarget` bridges native enter/over/drop/leave events and DOM file events. The pinned Wry macOS implementation reports AppKit logical points, which the pinned Tauri runtime passes through without scaling despite labeling the payload as physical. macOS coordinates therefore pass through unchanged; other platforms retain the documented physical-to-CSS conversion. Dividing macOS points by Retina DPR a second time maps the left part of the page into the sidebar. Native paths exclusively own Tauri imports; browser Files use the existing byte-import path. DOM file events are consumed in capture phase so child cards, rows and controls cannot intercept the import. Native events alone own desktop hover feedback, so DOM child-level dragleave events cannot clear an active Finder highlight. Browser-only dragleave events with no relatedTarget use pointer hit-testing to distinguish child transitions from actually leaving the page. Text/URI-only drags remain unaffected. Listener cleanup includes late asynchronous registration after unmount.

The picker and drops share the same ordered batch helper, `importAssetSources`. Files are copied through `Application.importAsset` or `Application.importPastedAsset`, then reconciled through Sync so the collection updates without restarting. Numeric collision suffixes, per-file error handling and partial success remain shared. No dependencies or broader filesystem permissions are added. Imported files are not inserted into any note.

## Mac acceptance

The lockfile pins Tauri 2.11.5, tauri-plugin-fs 2.5.2, and Wry 0.55.1. Development and packaged builds inherit the same base drop configuration; `tauri.dev.conf.json` changes only the application identifier. The sandbox keeps its existing user-selected read/write and app-scoped bookmark entitlements.

Actual Finder/WKWebView and signed macOS app execution cannot be verified from the Linux workspace. Repeat the following in `npm run desktop`, `npm run dev:sandbox`, and a packaged `.app` produced through the existing signed build flow:

- Drop one image, a PDF, and an ordered mixed batch on existing asset cards and list/table rows, the header, blank margins, and the empty collection.
- Drop over a folder's title, icon and padding. Check that the folder alone highlights and receives the files, without opening. Repeat inside a nested Assets collection.
- Drop outside folders while viewing a subfolder. Verify that subfolder receives the files.
- Drop two same-named files from different external directories. Confirm numeric suffixes and unchanged original/source files.
- Mix supported files, an unsupported file, a directory and an unreadable source. Confirm partial success and visible error feedback.
- Cancel a drag, cross between folder and page targets, hover an overlay or sidebar, and change Spaces repeatedly. Check correct highlight cleanup and no duplicate imports.
- Repeat across Retina/non-Retina displays. The highlighted destination must match the pointer.
- Drag text inside a note and use existing internal move gestures. No asset importing or Markdown insertion should occur.

## Changed files

Implementation/configuration:

- `apps/app/src-tauri/tauri.conf.json`
- `apps/app/src/shared/hooks/useFileDropTarget.tsx`
- `apps/app/src/app/layouts/page/Page.tsx`
- `apps/app/src/app/layouts/page/PageHost.tsx`
- `apps/app/src/app/layouts/page/body/AssetsCollectionBody.tsx`
- `apps/app/src/features/notes/helpers/uploadAssets.ts`
- `apps/app/src/core/application/Application.ts`
- `apps/app/src/core/vault/asset/importAsset.ts`

Tests:

- `apps/app/src/shared/hooks/useFileDropTarget.test.tsx`
- `apps/app/src/app/layouts/page/PageHost.archivedControls.test.tsx`
- `apps/app/src/features/notes/helpers/uploadAssets.test.ts`
- `apps/app/src/core/vault/asset/importAssetBytes.test.ts`

Documentation: this file.

## Reference contracts

- [Tauri configuration](https://v2.tauri.app/reference/config/#windowconfig)
- [Tauri webview event API](https://v2.tauri.app/reference/javascript/api/namespacewebview/)
- [Pinned Wry 0.55.1 macOS drag coordinates](https://github.com/tauri-apps/wry/blob/wry-v0.55.1/src/wkwebview/drag_drop.rs): draggingLocation and frame height are used directly, without Retina scaling.
- [Pinned Tauri runtime-wry 2.11.4 forwarding](https://github.com/tauri-apps/tauri/blob/tauri-runtime-wry-v2.11.4/crates/tauri-runtime-wry/src/lib.rs): with_drag_drop_handler wraps the coordinates without conversion. Recheck this compatibility handling when upgrading these dependencies.
- Local filesystem enforcement: `apps/app/src-tauri/src/new_file_no_clobber.rs`, `fs_authorization.rs`, and `Entitlements.plist`.

## Automated verification

The initial Assets-only revision passed all **621 tests across 19 targeted test files**. The subsequent hover/coordinate fix passed **180 tests across 4 targeted test files**, including macOS Retina/non-Retina coordinates, the page’s left/sidebar boundary, and overlapping native/DOM drag events. Coverage includes page headers, empty pages, existing assets, folder destinations, current subfolders, collision naming, immediate collection updates, native target highlighting, portal exclusion, and no asset importing from note editors. Editor paste, link and selection-related regression tests also pass.

`tsc --noEmit` and `git diff --check` pass for the hover fix. The preceding Assets-only frontend `vite build` passed with a large-chunk advisory. This does not replace the actual macOS Finder acceptance checks described above.
