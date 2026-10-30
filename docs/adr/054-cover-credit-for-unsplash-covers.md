# ADR-054: `coverCredit` — a cover's photographer credit travels with the cover, as one owned frontmatter key

**Status:** Accepted (approved for implementation, 2026-10-15). Extends the cover metadata family (`cover`, `coverHidden`, `coverLayout`, `coverPositionAbove`, `coverPositionSide`) owned by Vault Ingest (`FrontmatterParser`/`FrontmatterSerializer`/`PageMetadata`/`FolderMetadata`) and edited only through `PageOperations.updateMetadata` / `FolderOperations.updateMetadata` and the Persistence Gate. No new subsystem, write path, backend or database; no change to the Gate's operation kinds. Consistent with ARCHITECTURE_RULES.md rule 2 (one write path) and the Markdown-native model (the note file is the source of truth).

## Context

Clutter lets a user pick an Unsplash photo as a note or folder cover. The [Unsplash API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) require that wherever an API photo is shown, the photographer is credited with a link to their Unsplash profile and Unsplash is credited, both links carrying `utm_source=<app>&utm_medium=referral` ("Photo by [Photographer] on Unsplash"). Images must be hotlinked from the URLs the API returned, and a selection that sets the photo as a background/cover must trigger a download event against `links.download_location`.

Today the picker credits the photographer only while it is open. Choosing a photo persists just `cover: <urls.regular>`; the photographer's identity is discarded at that moment, so a saved cover (page header, collection cards, folder covers, after restart) shows no credit. The attribution data exists only in the API response, and cannot be recovered later without an extra API request per render — the image URL's `photo-<id>` segment is not the API photo id, and a render-time lookup would add an API call to every note open and make attribution depend on network availability.

The credit therefore has to be persisted with the cover. Where covers are copied (template creation/application, duplication, "set this asset as cover") it has to travel with them.

## Decision

### 1. Format — one owned frontmatter key

```yaml
cover: https://images.unsplash.com/photo-…?…&w=1080
coverCredit: Alex Doe <https://unsplash.com/@alex>
```

`coverCredit` is a single scalar line: the photographer's display name, one space, then the Unsplash profile URL in angle brackets (the form of an email `From:` value, which keeps the file human-readable), optionally followed by a second angle-bracketed value — the photo's `links.download_location` exactly as the API returned it:

```yaml
coverCredit: Alex Doe <https://unsplash.com/@alex> <https://api.unsplash.com/photos/p1/download?ixid=…>
```

The download location is kept so a later user-requested download (§5) can be reported to Unsplash; it is written only when it is on `https://api.unsplash.com/`, and a two-part-less (older) line parses without it. The URL is the API's `user.links.html`, stored **without** referral parameters — `utm_source` / `utm_medium` are appended when rendering (one place: `unsplashAttribution.ts`), so the registered app name can change without migrating notes. `PageMetadata.coverCredit` / `FolderMetadata.coverCredit` are `CoverCredit | null` (`{ name; url; downloadLocation? }`), default `null`.

- **Parsing** is lenient and total: a value that does not match `Name <https-url>` (including an empty name, a non-`https:` URL, or a malformed line) parses as *absent*, never an error and never an invented credit. Parsing splits on the **last** ` <` so a name may contain `<`.
- **Writing** normalizes the name (control characters and runs of whitespace collapse to a single space, trimmed), requires an `https:` URL, and omits the key when the credit is null or invalid — the same omit-on-default convention as `coverHidden`. Serialized key order: directly after `cover`.
- `coverCredit` joins `OWNED_FRONTMATTER_KEYS` so it is parsed as a system key and never preserved as a custom property.

### 2. Lifecycle — the credit is part of the cover's identity

The credit describes *the image in `cover`*. Every operation that sets `cover` sets `coverCredit` in the same patch (`newCoverPatch(cover, credit?)`, the one shared "give this note a new cover" patch), so a stale credit can never survive a cover change:

| Operation | `coverCredit` |
|---|---|
| Pick an Unsplash photo | `{ name: user.name, url: user.links.html }` |
| Paste an Unsplash *photo page* link (`unsplash.com/photos/<title>-<id>`) in the Link tab | looked up once through the API (`GET /photos/:id`, no scraping) and treated as a pick: `urls.regular` becomes the cover, with `{ name, url, downloadLocation }`, and the download is reported. A lookup that fails sets nothing and says so |
| Pick any other link (an image address, including an `images.unsplash.com` one), an upload, or a vault asset | cleared (`null`) — an image address cannot be traced to its photographer: its `photo-<number>-<hash>` name is a CDN file name the API answers 404 for, and the file carries no credit metadata |
| Pick an existing *remote Unsplash* asset (Assets tab, "set as cover") | the credit of a page/folder already holding that exact URL, else cleared |
| Remove the cover | cleared |
| Hide the cover | kept (a hidden cover is shown as none; re-showing it must still be credited) |
| Position / layout changes | untouched |
| New note from a template; apply a template to a note that has no cover | copied with the cover (`pickInheritedTemplateMetadata`); applying never replaces an existing cover, so never its credit |
| Duplicate a note | file text is copied, so the key is copied |
| Move / rename / archive / restore | untouched (frontmatter rewrite preserves owned keys) |

### 3. Display

A cover renders attribution wherever the photo is shown at a size that can carry it, as one restrained line **"Photo by [Photographer] on Unsplash"**: the name links to the credited profile URL, "Unsplash" links to `https://unsplash.com`, both with the referral parameters. A long name is truncated (the name only; "Photo by" and "Unsplash" and both links stay visible) with the full name in the link's `title`/`aria-label`. Surfaces: the page/folder cover; the collection card preview's cover. In list rows and table cells the cover is a small thumbnail with no room for a line of text; there the thumbnail carries the credit as its tooltip/accessible name — this is a documented limitation, not a claim of full coverage.

A cover is credited when it has a `coverCredit` — **whatever its address now is**: a photo saved to the vault is a local file but still Unsplash's. A cover with no credit whose URL is hosted on `images.unsplash.com` / `plus.unsplash.com` gets the fallback below.

### 4. Backward compatibility / existing notes

Notes written before this ADR have `cover: <unsplash url>` and no `coverCredit`. They parse unchanged (absent key → `null`). Clutter does **not** invent a photographer and does **not** call the API to find one (no render-time requests). Their cover shows the fallback **"by Unsplash"** (link to `https://unsplash.com` with referral parameters) until the user re-picks the photo. This satisfies "credit Unsplash" but not "credit the photographer" for those covers; the limitation is documented here and in the verification report. No migration is run. Files with `coverCredit` read by an older build treat the key as a custom property and preserve it verbatim.

### 5. Hotlinking vs. an explicit save — what the guidelines say

Three different things, which the [API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) treat differently:

1. **Displaying** an API image must use the returned hotlinked URL ("All API uses must use the hotlinked image URLs returned by the API under the photo.urls properties", [Hotlinking](https://help.unsplash.com/en/articles/2511271-guideline-hotlinking-images)). `cover` keeps `urls.regular` verbatim, including `ixid` and every other parameter; nothing rewrites it.
2. **A user explicitly saving** a photo ("Download", "Save to vault" → `Assets/`) is not addressed by any hotlinking, storage or caching rule: the guidelines contain no prohibition on a user-requested copy, and the hotlinking rule governs the URLs an app *uses to display*. (The only nearby rule is "cannot replicate the core user experience of Unsplash", about the product, not a user's file.) Clutter never downloads automatically — only on the user's explicit action. Both actions therefore stay available for Unsplash photos. After a save, the cover points at the local file and keeps its `coverCredit`, so the photo remains credited.
3. **Reporting a download** is required for any action "similar to a download" ([Triggering a download](https://help.unsplash.com/en/articles/2511258-guideline-triggering-a-download)): a request to the photo's `download_location`, asynchronously, authenticated.

### 6. Download tracking

- **Committing a photo as a cover** (picker): sets the cover, then fires one best-effort `GET links.download_location`.
- **Download and Save to vault** are the same user-requested download (the latter into Assets): both report through `Application.reportUnsplashDownload(url)`, once the file has actually been written (Download: not on cancel; Save: after the copy exists, not on failure), using the `download_location` recorded in `coverCredit`. The location is read *before* a save, because the save repoints the cover at the local file.
- The request is exact-URL, authenticated, host-restricted to `api.unsplash.com`, asynchronous and never rejecting; a failure never affects the cover or the saved file. Nothing is tracked on browse, render or restart.
- **Limitation:** a photo with no recorded location (a cover saved before this ADR, or an Unsplash URL pasted into a note) can still be downloaded or saved — Clutter just has nothing it can report. Re-picking the photo from Unsplash records it.

## Alternatives Considered

- **Look the photographer up at render time** from the image URL / photo id: rejected — extra API request per cover render (rate limits, offline failure), and the id is not reliably derivable from the image URL.
- **Two keys (`coverCreditName`, `coverCreditUrl`)**: rejected — doubles parser/serializer/patch/plumbing for a value that is always read and written together; one key cannot be half-written.
- **A YAML mapping / JSON value**: rejected — Clutter's frontmatter parser and serializer are line-scalar based by design; introducing nested values for one key would add a parser mode for no other consumer.
- **A sidecar/database of photo metadata**: rejected — breaks the Markdown-native model (the credit would not travel with a copied or synced note) and adds a store with its own write path.
- **Picker-only attribution**: rejected — fails the guidelines for every place the cover is later shown.

## Consequences

- Every cover writer and cover reader of the metadata family gains one field (list in the implementation: models, frontmatter types, parser, serializer, `resolvePageMetadata`/`PageRebuilder`/`FolderBuilder`, `PagePersistenceCoordinator`'s draft-promotion patch, `PageOperations`/`FolderOperations`/`PageCreator` patch types, `EffectivePageState`, template pickers, UI models).
- Old covers display the "by Unsplash" fallback until re-picked.
- Non-Unsplash covers are unaffected (`coverCredit` is `null` and never serialized).
- **Parsed-note cache ([ADR-053](./053-persistent-parsed-note-cache.md)).** Owning `coverCredit` in `FrontmatterParser` changes what `parse` returns for a note that has the line (it used to be an unowned property), so `PARSER_VERSION` was raised from 1 to 2 and every cache written before this change is discarded on load. The golden corpus (`parserGolden`) now includes valid, download-location, malformed, non-https, empty and absent credits, and the cache equivalence tests assert that a credit survives parse, cache encode/decode and `Page` construction identically (with and without `downloadLocation`). A future change to how a cover-related key is parsed must bump `PARSER_VERSION` the same way.

## Testing

Parse/serialize round trip (including odd names, malformed values, absence); builders default to `null`; `newCoverPatch` sets/clears; template create/apply carry the credit and never replace an existing cover's; remove/replace clear it; duplication preserves it; UI: credit rendering, truncation with full-name label, fallback for credit-less Unsplash covers, nothing for non-Unsplash covers; hotlinked URLs unchanged; download tracking once per committed selection and again on replacement, never on browse/render, failures swallowed; Download and Save to vault of an Unsplash photo each report once, only after the file exists, with the credit kept on the saved local cover; no report when the location is unknown or the image is not Unsplash.
