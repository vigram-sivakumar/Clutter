# ADR-057: Created and Last edited are the file's own times — `Page.fileTimes`, resolved by one pure function

**Status:** Accepted (product direction, Vigram, 2026-10-16). Amended the same day: the frontmatter fallback this ADR first kept was removed (clean break, no users yet).

## Context

A note's Created and Last edited dates came only from the frontmatter keys `created` and `modified`. A Markdown file created or edited outside Clutter has neither, so Created showed empty; no Clutter edit ever bumped `modified`, so Last edited on a Clutter-made note stayed at its creation time; and `PageRebuilder` fabricated `updatedAt = now` for a note without `modified`, which the next save then wrote into the file.

The file already has trustworthy dates: the operating system's birth time and modification time, readable through the `VaultFileSystem.stat` primitive ADR-038 added (Rust `Metadata::created()` / `modified()`; on macOS the birth time equals Finder's Date Created).

## Decision

1. **Policy.** Created is the file's birth time; Last edited is its modification time. Nothing else supplies them: no frontmatter value, no fallback. If the filesystem gives none (or an unparseable one) the value is `null`. A timestamp is never fabricated. Last opened is out of scope.
2. **Separate from Markdown.** The times live in the new optional `Page.fileTimes: { createdAt, modifiedAt }` (ISO-8601 UTC or `null`), a sibling of `metadata`, **never read by `FrontmatterSerializer`**. `PageMetadata` carries no date at all (`createdAt` / `updatedAt` are gone), so a filesystem value cannot reach frontmatter through any save path. The frontmatter keys `created` / `modified` only *declare* the Created / Last edited rows in the Properties list (ADR-058); their value is the literal `true`.
3. **One resolver.** `resolveEffectivePageDates(page)` (`vault/models/effectivePageDates.ts`) returns `{ createdAt, updatedAt }` from `page.fileTimes`, normalised to UTC ISO (so the lexicographic date sorts stay correct) or `null`. Properties, `EffectivePageState` (and so the sidebar, collections and their sorting) and the References ordering all use it; none reads a date from metadata.
4. **Acquisition (no new pipeline).** `readPageFileTimes` wraps `readResourceMetadata` (ADR-038). The scan reads it once per `.md` file (`ScannedPage.fileTimes` → `PageBuilder` → `Page.fileTimes`); Sync reads it again on every page reconcile (watcher event or subtree rescan); the Persistence Gate reads it after every successful write, before the rebuilt page enters the Vault — so a Clutter save refreshes Last edited at once, without waiting for the watcher echo. `PageRebuilder.rebuild(page, parsed, fileTimes)` takes the fresh value and never carries the previous one. A failed stat yields `undefined`. Nothing stats during render.
5. **No date in the page.** `PageRebuilder`, `PageBuilder`, archive and restore no longer set a date; the parser no longer reads a `created` / `modified` value.

## Limitations (stated, not worked around)

Filesystem timestamps describe the current file, not necessarily the document's history. Copying without preserving attributes, downloading, extracting an archive, restoring a backup, moving across filesystems, `git checkout` and cloud-sync downloads give the file a new birth time and modification time; an editor that saves by writing a temp file and renaming it over the original (verified on macOS) gives the file the temp file's birth time. Clutter's own saves write in place and keep the birth time. Where the platform reports no birth time Created is empty.

## Alternatives considered

- *Frontmatter dates as a fallback (the first form of this ADR)* — keeps date-value parsing, validation and an ordering policy alive for data nobody has yet; removed.
- *Put the filesystem value in `PageMetadata`* — the serializer writes `PageMetadata`, so it would leak into Markdown on the next save.
- *Stamp `modified` on every in-app save* — churns frontmatter on every autosave.

## Consequences

- One extra `stat` per page at scan, per Sync reconcile and per Gate write; none during render.
- `Page` gains an optional `fileTimes`; `PageMetadata` loses `createdAt` / `updatedAt`; `PARSER_VERSION` is 4.
