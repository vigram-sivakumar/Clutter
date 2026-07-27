# Core Architecture Review

Principal-architect-level design review of `apps/app/src/core`, performed before further feature work. Grounded in the actual code (not the intended design docs) — every claim below is cited with a file and line.

## 0. Critical finding: the type checker is not actually catching these bugs

Before anything else: `npx tsc --noEmit -p .` currently **exits early** with only two `TS6305` (unbuilt project reference) errors from `e2e/*.spec.ts`, and reports **zero** errors for `src/`. This looks clean, but it's a false negative — `tsconfig.json`'s `references` to `tsconfig.node.json` fail their build-freshness check first, and `tsc` aborts before it ever type-checks the rest of the program.

Re-running with `references` stripped and the same `include` surfaces real, pre-existing errors that are currently invisible to whoever runs `tsc -p .` (including CI, if CI relies on this exact command):

```
src/core/vault/knowledge/EmbedBuilder.ts(10,11): error TS2353: Object literal may only specify known properties, and 'sourcePageId' does not exist in type 'Embed'.
src/core/vault/knowledge/LinkBuilder.ts(10,11): error TS2353: Object literal may only specify known properties, and 'sourcePageId' does not exist in type 'Link'.
src/core/vault/understand/analysis/MarkdownAnalyzer.ts(1,42): error TS2307: Cannot find module './ScannedScannedPageAnalysis' or its corresponding type declarations.
src/core/vault/understand/frontmatter/PageFrontmatter.ts(1,31): error TS2307: Cannot find module '../Page' or its corresponding type declarations.
src/core/engine/DocumentSession.ts(51,20): error TS6133: 'attachedViews' is declared but its value is never read.
```

Outside `core/` the same masking hides five more broken imports (`@core/vault/models/Task` doesn't exist — only `TaskOccurrence` does) and one in `TagSwatch.tsx`. **Fix the `tsc -p .` short-circuit first** — until it's fixed, every other type-safety claim about this codebase is unverifiable, and the two bugs below were shipped invisibly.

**Action:** either build the referenced project first (`tsc -b`) as part of the check script, or drop `e2e` from `include` in the app's own `tsconfig.json` and check it separately.

## 1. Vault duplicates PageService's page-lifecycle API

[`Vault.ts:151-184`](../../apps/app/src/core/vault/models/Vault.ts) implements `openPage`, `closePage`, `getOpenPage`, `isPageOpen` as pure pass-throughs to its internal `DocumentRegistry`. [`PageService.ts:31-39`](../../apps/app/src/core/application/page/PageService.ts) then calls `vault.openPage()`, which calls `documentRegistry.open()`. Three classes implement the same operation; two do nothing but forward it.

This isn't just noise — the domain boundary intended by the design ("UI never accesses Vault directly") is only convention today, because `Vault.openPage` is public and callable directly, bypassing `Workspace` state entirely.

**Recommendation:** delete the four pass-through methods from `Vault`; have `PageService` talk to `DocumentRegistry` directly (`vault.documentRegistry` or inject the registry into `PageService`).

## 2. A stated invariant is already contradicted in code

[`Vault.ts:22-24`](../../apps/app/src/core/vault/models/Vault.ts): *"The Vault owns the filesystem reconciliation (find vs create)... The Application owns the startup workflow."* The broader design says *"Vault never performs filesystem writes"* and *"VaultInitializer performs writes."* Daily-note-must-always-exist is a filesystem write. Whoever implements Arc 3 needs to resolve this before writing code, not after.

## 3. LinkBuilder / EmbedBuilder don't build what their own types promise

`Link` ([`Link.ts`](../../apps/app/src/core/vault/models/Link.ts)) is documented as "a unique link target aggregated from all LinkOccurrences," with one field: `targetPageId`. `LinkBuilder.build()` ([`LinkBuilder.ts:4-20`](../../apps/app/src/core/vault/knowledge/LinkBuilder.ts)) instead pushes one un-aggregated record per raw occurrence shaped like `{sourcePageId, target, heading, blockReference, alias}` — it never computes `targetPageId`, and `sourcePageId` isn't even a field on `Link`. Confirmed as a real compiler error (`TS2353`, see §0), not a style nit. Same defect in `EmbedBuilder.ts:4-20` against `Embed`.

Resolution already exists correctly elsewhere — `LinkResolver` + `KnowledgeGraphBuilder` resolve links against `PageIndex` and produce `KnowledgeGraph.edges`. **There are two independent, non-communicating link pipelines**: one that resolves correctly (feeds `KnowledgeGraph`, unused by anything yet) and one that's wired into `Vault.links()`/`Vault.embeds()` and is currently broken.

**Recommendation:** delete `LinkBuilder`/`EmbedBuilder` and `Vault.links()`/`Vault.embeds()`, or rewrite them to aggregate from the already-working `LinkResolver` output. Don't maintain two resolution paths for the same concept.

## 4. Two broken relative imports, invisible to `tsc -p .` today

- [`MarkdownAnalyzer.ts:1`](../../apps/app/src/core/vault/understand/analysis/MarkdownAnalyzer.ts) imports `./ScannedScannedPageAnalysis` (doubled "Scanned") — the real file is `ScannedPageAnalysis.ts`.
- [`PageFrontmatter.ts:1`](../../apps/app/src/core/vault/understand/frontmatter/PageFrontmatter.ts) imports `PageType` from `../Page` — no `Page.ts` exists under `understand/`; the real type lives in `vault/models/Page.ts:10`.

Both are almost certainly stale paths from a file move. Trivial one-line fixes once §0 is resolved and CI can actually see them.

## 5. VaultScanner has no concurrency, no incrementality, no exclusions

[`VaultScanner.scanDirectory`](../../apps/app/src/core/vault/discover/VaultScanner.ts#L31-L73) recursively `await`s every directory entry and every file sequentially, on every startup, with no ignore-list (`.git`, `.clutter/cache`, etc.) and no incremental rescan path. At "hundreds of thousands of files" (the stated target), this is a multi-second-to-minutes cold start today, with no design in place to avoid re-walking the whole tree on the next file-watcher event either.

## 6. Full corpus held in memory with no incremental index

- `VaultBuilder.build()` ([`VaultBuilder.ts:23-105`](../../apps/app/src/core/vault/build/VaultBuilder.ts)) holds every page's full raw markdown and full parsed analysis in memory simultaneously, rebuilt wholesale on every load. No streaming, no eviction.
- `PageIndex` ([`PageIndex.ts`](../../apps/app/src/core/vault/knowledge/PageIndex.ts)) is map-indexed for path/filename/alias lookups (good), but `findHeading`/`findBlockReference` (`PageIndex.ts:50-51,58-61`) fall back to a linear `Array.find` scan over **all** pages — called once per link occurrence during resolution, i.e. effectively O(pages × links) for any vault using heading- or block-anchored links. The file's own TODO acknowledges this pattern for "if linear scans become a bottleneck" but only applied the fix to path/filename/alias, not headings/blocks, in the same file.
- `Vault`'s own `Map`-based indexes (`pagesById`, `foldersById`, `tagsByName`) and `PageIndex`'s independent maps are two separate ad hoc indexing layers built from scratch over the same `Page[]`, with no shared indexing abstraction between them.
- `MarkdownAnalyzer.analyze()` makes six independent full-content passes (one per extractor: heading, tag, task, link, embed, block-reference) instead of one shared pass. Constant-factor, not superlinear, but it's six traversals × every file at scale.

None of this is fatal at today's usage, but all of it needs a plan before "hundreds of thousands of files" is real, and none of the current abstractions (Vault, PageIndex, VaultBuilder) have a seam for incremental update — a single edited file currently implies rebuilding indexes over the entire vault unless something outside this code special-cases it.

## 7. Dead / speculative scaffolding built ahead of any consumer

- `SaveCoordinator` ([`SaveCoordinator.ts`](../../apps/app/src/core/engine/SaveCoordinator.ts)) is instantiated nowhere in the app (`grep -rl SaveCoordinator src` returns only itself). Its own docstring says persistence "will be introduced later." Manual/autosave is fully unimplemented at the engine layer despite this class existing.
- `DocumentTransaction.isEmpty`/`.equals()` and `DocumentRevision.isInitial`/`.equals()` have zero call sites anywhere.
- `KnowledgeGraph` ([`KnowledgeGraph.ts`](../../apps/app/src/core/vault/models/graph/KnowledgeGraph.ts)) is `{ edges: readonly GraphEdge[] }` with four TODOs ("derive backlinks," "track unresolved links," "support traversal / page ranking / unlinked mentions") and zero query methods, despite `KnowledgeGraphBuilder` already doing real resolution work to populate it. Nothing in the app queries `vault.knowledgeGraph` yet.
- `Occurrence.rawText`/`startOffset`/`endOffset`/`sourceVersion` are declared on every occurrence type and explicitly set to `undefined` at every call site in `PageBuilder.ts` (lines 115-118, 130-133, 147-151, 165-169) — a fully-modeled, 100%-dead field set across four types.
- `DocumentSession.attachedViews` ([`DocumentSession.ts:51`](../../apps/app/src/core/engine/DocumentSession.ts)) is declared but never read anywhere (confirmed by `TS6133` in §0) — the "attach/detach views" responsibility described in its docstring isn't implemented.

None of this needs to be deleted outright, but it's worth naming as debt: the `understand/`+`knowledge/` subsystem (7 extractors, 3 analyzers, 6 builders, a knowledge graph) is substantially larger than what's actually exercised by a working "open a note" path, which itself is incomplete (`VaultInitializer.ts` is currently empty).

## 8. Minor naming / structural nits

- [`LocalFileSystem.ts`](../../apps/app/src/core/vault/providers/LocalFileSystem.ts) contains a class called `LocalVaultProvider` — file name and class name don't match, a discoverability tax when scanning imports or file trees.
- `IdentityResolver` ([`IdentityResolver.ts`](../../apps/app/src/core/vault/build/IdentityResolver.ts)) exposes `resolvePage`/`resolveFolder` as two public methods with identical bodies delegating to one private `resolve()` — implies a semantic difference between page/folder identity resolution that doesn't exist in the implementation. Could be a single function, not a class with two names for one behavior.
- `FrontmatterParser.parseFrontmatter` ([`FrontmatterParser.ts:87-141`](../../apps/app/src/core/vault/understand/FrontmatterParser.ts)) has no `default` case in its key switch — unknown frontmatter keys, and any YAML beyond flat scalars plus one hardcoded array key (`aliases`), are silently dropped with no warning. Any vault with moderately complex frontmatter will lose data with zero signal to the user.
- `BlockReferenceExtractor` ([`BlockReferenceExtractor.ts:8-9`](../../apps/app/src/core/vault/understand/extractors/BlockReferenceExtractor.ts)) only matches a block ID on its own line (`^\^([A-Za-z0-9_-]+)$`), not the far more common inline-at-end-of-paragraph form (`text ^block-id`). Its own TODO acknowledges this. Practically, `#^block-id` links will resolve to "missing" for most real-world content today.
- Stray `console.log` debug statements left in [`PageService.ts:45`](../../apps/app/src/core/application/page/PageService.ts) and [`Workspace.ts:51`](../../apps/app/src/core/workspace/Workspace.ts).

## What to do before writing more features

1. **Fix the `tsc -p .` short-circuit (§0).** This is the highest-leverage fix in this review — it's currently hiding every other type bug, in `core/` and beyond.
2. **Fix the two broken imports (§4)** — one-line changes, blocked only by #1 making them visible.
3. **Pick one owner for page open/close/session** (§1) — collapse `Vault`'s pass-through methods.
4. **Decide the Vault-writes-to-disk question (§2)** before Arc 3 (daily notes) is implemented — otherwise the daily-note feature will be built against a rule the codebase already contradicts.
5. **Delete or fix `LinkBuilder`/`EmbedBuilder`** (§3) — don't ship two competing link-resolution systems.

Everything in §5-§8 is real but not urgent: worth tracking, not worth blocking current feature work over, as long as the team is deliberate about when "hundreds of thousands of files" stops being hypothetical.

## 9. Do we need ~70 files? — navigability and extensibility review

This section answers a different question than §0-§8: not "is anything broken," but "is the file structure itself easy to hold in your head, and easy to extend without rewriting things." Written for a non-technical reader who wants to be able to trust that adding a feature later means *plugging something in*, not *rewriting what's there*.

**Short answer: 70 files is not the problem.** The pipeline the files implement is a clean five-stage assembly line, one folder per stage:

1. **`discover/`** — walks the vault on disk and notices what files exist. Doesn't understand markdown yet.
2. **`understand/`** — reads each file: parses frontmatter, and runs small single-purpose readers over the text (one for `#tags`, one for `[[links]]`, one for tasks, headings, etc.) — each one's only job is "find this one thing."
3. **`build/`** — turns everything `understand/` extracted into the app's real vocabulary: a `Page`, a `Folder`, each with a stable ID.
4. **`knowledge/`** — looks *across* all built pages: link resolution, vault-wide tag/task lists, the knowledge graph.
5. **`models/`** (`Vault`) — the shelf everything above gets placed on; the rest of the app (`Application`, `Workspace`, `PageService`) reads from and writes through this.

`scan → understand → build → assemble knowledge → shelve it → app reads from the shelf` is a reasonable mental model for anyone, technical or not, and each folder maps to exactly one step in it.

**Where "one file, one job" is paying off — keep doing this:**

- `understand/extractors/` (7 small files, one per markdown feature: tags, tasks, links, embeds, headings, aliases, block references). Adding a new syntax later (e.g. "callouts") means writing one new extractor and wiring it into `MarkdownAnalyzer` — nothing else changes. This is the "plug it in, don't rewrite" pattern working as intended.
- `vault/providers/` (`VaultFileSystem` interface + `LocalFileSystem` implementation). The rest of the app only talks to the interface, never the disk directly. A future cloud-sync backend means one new file implementing the same interface, no upstream changes.

**Where it's actually hurting clarity — fix by deleting/merging, not by reorganizing.** The real cost in this codebase isn't file count, it's that a few concepts got *two* homes, so a newcomer can't tell which one is authoritative:

1. **"Open/close a page" is implemented three times** — `Vault`, `PageService`, and `DocumentRegistry` all have their own `openPage`/`closePage` (see §1). One job should live in one file (`PageService`); the other two copies should be deleted.
2. **"What does a page link to" has two competing systems** — the broken, unused `LinkBuilder`/`Vault.links()` path, and the correct `LinkResolver`/`KnowledgeGraph` path (see §3). A future "show backlinks" feature has no obvious system to build on until one of these is deleted.
3. **"Look up a page by name/path" is rebuilt from scratch in two places** — `Vault`'s own maps and `PageIndex` inside `knowledge/` (see §6) — duplicated effort that will silently drift out of sync as one gets updated and the other doesn't.

None of these three are "too many files" in the sense of needing a reorg — each is exactly *one extra file* doing a second, conflicting version of a job that already has an owner. That's the opposite of "plug in easily": it creates "which of these two do I plug into?" instead.

**Verdict:** the file count is appropriate for the pipeline as designed, conditional on consolidating the three duplicates above. A couple of pieces are ahead of their time rather than duplicated (`KnowledgeGraph` is a shell with no query methods yet, `SaveCoordinator` isn't instantiated anywhere) — harmless as clearly-marked placeholders, just don't let a second parallel structure get built next to them later because nobody remembered they already exist.

**Rule of thumb going forward:** before adding a new file, ask "does something already do this job, even partially?" If yes, extend or replace that file — don't add a sibling. The extractor and provider folders already prove this codebase knows how to do that well; the three duplicates above are the only places a sibling got added instead. Fixing those three (not restructuring anything else) is what actually gets you "plug things in, never rewrite" going forward.

## 10. Arc 3 post-implementation review

Revisiting §1-§9 after the Arc 3 refactor that was explicitly meant to address them. Verified against the current code, not the refactor summary.

**Fixed and verified:**

- **Page lifecycle (§1)** — `Vault` no longer implements `openPage`/`closePage`/`getOpenPage`. `PageService.openPage` (`application/page/PageService.ts:33-47`) is now the single coordinator: `vault.getPage` for lookup, `documentRegistry.open` for the session, `workspace.openPage` for nav state. One owner, correctly layered.
- **Runtime ownership** — `Application` owns `Vault`/`Workspace`/`DocumentRegistry`/`PageService` (`application/Application.ts:29-32`); nothing outside `PageService` touches `DocumentRegistry`. Clean, single-owner graph. **Freeze this.**
- **Startup sequencing** — `Application.open()` (`application/Application.ts:35-62`) matches the intended `VaultInitializer → DailyNoteService.ensureToday → VaultScanner → VaultBuilder → Vault.getPageByPath → PageService.openPage` flow. Verified the path formats actually agree end to end: `DailyNoteService.ensure` builds `${rootPath}/Daily Notes/...` (`daily-notes/DailyNoteService.ts:28`) and `LocalVaultProvider.readDirectory` builds page paths the same way from the same root (`vault/providers/LocalFileSystem.ts:19-26`) — the new `getPageByPath` lookup isn't just plausible, it works.
- **`ReservedResources`/`VaultInitializer`/`DailyNoteService`/`DailyNotePath`** — each does exactly what its doc comment claims, no scope creep, no filesystem access leaking into `DailyNotePath`, no daily-note logic leaking into `VaultInitializer`. `Vault.getPageByPath` is correctly a plain lookup on data Vault already owns, same shape as `getPage(id)`. **Freeze all four.**

**Not actually finished — "deprecate" was used where "delete" was needed:**

- `LinkBuilder.ts` is a stub and `VaultBuilder` no longer calls it — but `VaultBuilder.ts:96` now hardcodes `[]` into `Vault`'s link collection permanently, and `Vault.links()`/`linkCount` are still exposed. A repo-wide grep found **zero callers** of either. This is a live API guaranteed to always return empty, silently — worse than the duplication it replaced, since a duplicate is at least discoverable by searching. Delete `Link.ts`, `Vault.links()`/`linkCount`/`linkList`, the `linkCollection` constructor parameter, `LinkBuilder.ts`, and its barrel export (`vault/knowledge/index.ts:3`) together, in one pass.
- `Application`'s instance constructor still builds a throwaway `VaultInitializer` (`application/Application.ts:70`) purely to support `initialize()` (lines 78-82), marked "remove once AppShell uses `Application.open()`." AppShell already only calls `Application.open()` (`app/AppShell.tsx:21`) — the removal condition is already satisfied. Delete both now.
- `EmbedBuilder` still hasn't done the aggregation `Embed.ts:2`'s own TODO demands — `EmbedBuilder.build()` still pushes one un-deduplicated `{target}` per occurrence. Same defect flagged pre-refactor, untouched by it.
- `Vault.ts:9-24` carries a stale doc comment describing daily-note responsibilities "to implement" that are now implemented elsewhere (`DailyNoteService`) — dead, misleading documentation; delete it.

**A gap that isn't on the deliberately-postponed list:** grepped for callers of `DocumentSession.commit()`, `markSaved()`, and `SaveCoordinator` — there are none, anywhere in the app. Edits made in an open note are never written back to disk. That's distinct from the explicitly deferred sync/collaboration/performance items — it's single-writer local save, which is basic table stakes for a "you own your files" markdown app. This should become an explicit decision (on the postponed list with a rationale, or the next feature) rather than an accidental silence.

**Verdict:** the refactor did fix the structural issue it targeted (page lifecycle ownership) and the new startup/daily-note pieces are solid enough to freeze. The remaining debt is small, mechanical, and self-inflicted by stopping cleanup halfway (deprecating instead of deleting) rather than any new design flaw — worth a follow-up pass before more feature surface gets added on top.

## 11. The aggregate-vs-occurrence rule for `vault/models`

`core/vault/models` pairs each extracted concept with a per-occurrence type (`*Occurrence`, one per mention in one page) and, for three of the four, a vault-wide aggregate type (`Tag`, `Link`, `Embed`) with no `*Occurrence` suffix. `Task` has no aggregate — `Vault.tasks()` returns `TaskOccurrence` directly. This is not an oversight to "fix" by adding a `Task.ts`; it reflects a real semantic split that was never written down, which is why the other three don't even agree with each other today:

| Concept | Aggregate exists | Builder actually dedupes |
|---|---|---|
| Tag | Yes (`Tag.ts`) | Yes — `TagBuilder` keys a `Map` by name |
| Link | Yes but dead (`Link.ts`) | No builder exists; `Vault.links()`/`linkCount` always return empty (see §10) |
| Embed | Yes (`Embed.ts`) | No — `EmbedBuilder` pushes one un-deduplicated record per occurrence, contradicting its own file's TODO |
| Task | None | N/A |

**The rule to establish** (put it as a one-line comment on `models/occurrences/Occurrence.ts`, since that's the shared base every one of these extends):

> A vault-wide aggregate type in `models/` (e.g. `Tag`) exists only when occurrences share a natural identity that multiple pages can collide on (a tag name, a link target). If a concept has no such key — every occurrence is itself a distinct entity, as with tasks — expose the `*Occurrence` type directly from `Vault`, the way `tasks()` does. Don't create an aggregate type with no dedup logic behind it.

**To actually conform to that rule** (mechanical, not a redesign):
- Fix `EmbedBuilder` to dedupe by `target` using the same `Map` pattern `TagBuilder` already uses, so `Embed.ts`'s doc comment stops being aspirational.
- Finish deleting `Link` — `Link.ts`, `Vault.links()`/`linkCount`/`linkList`, and the constructor parameter — the builder is already gone (deleted since §10 was written), only the dead type and dead `Vault` surface remain.
- Leave `Task` exactly as it is — no `Task.ts` — now that the reason is a documented rule instead of an unexplained gap.

Once these three land, the rule doubles as the answer for any future extractor: aggregate only if there's a real dedup key, otherwise expose occurrences directly.

## 12. Page creation: `PageFactory` vs. `TemplateService`, and the frontmatter decision

**System page definitions vs. user templates are genuinely different concepts, and the split is correct.** `id`/`type`/`created`/`modified` are the page's identity, not fill-in-the-blank content — treating them as placeholders in an editable "template" implied a user could safely delete or corrupt them. The corrected shape:

- **`PageFactory`** (internal) — generates identity/timestamps, builds frontmatter, optionally appends a user template's body, writes the file. Lives in `core/`, never exposed to the vault, never seeded to disk. Because system definitions were never meant to be user-editable, they have zero version-lock risk from living purely in code — this resolves the seeding/versioning tension from §11's precursor discussion entirely, rather than just working around it.
- **`TemplateService`** (scope narrowed) — loads an optional user template body (`Templates/<Name>.md`) and substitutes a small set of body-safe variables (e.g. a date for a heading). No longer touches `id`/`created`/`modified`. Its doc comment should be updated to drop the metadata-generation responsibilities it no longer has.

**One gap to close before implementing `PageFactory`:** there is no frontmatter serializer anywhere in `core/` (verified via search) — only `FrontmatterParser` (read-side). If `PageFactory` generates frontmatter by filling `{{id}}`/`{{created}}` into a raw YAML string, that's a second, independent representation of "valid frontmatter" alongside `PageFrontmatter`/`FrontmatterParser`, free to drift out of sync with the read side — the same asymmetry class as `FrontmatterParser` silently dropping unknown keys (§0/pre-Arc-3 finding, still unresolved). Build `serializeFrontmatter(PageFrontmatter): string` next to the parser; have `PageFactory` construct a typed `PageFrontmatter` object and serialize it, not template a string.

**Should Clutter use frontmatter at all? Yes — validated against alternatives, not assumed.** The dividing line that actually decides this: *derived* data (rebuildable from a rescan — search index, backlinks, embeddings, the knowledge graph) belongs in a `.clutter/` cache/database; *non-derived source-of-truth* data (`id`, `created`) cannot be rebuilt from anything and must live inside the file itself, or it's lost the moment a file leaves this specific vault.

- **Sidecar files** (`note.md` + `note.clutter`) fail Identity and Portability outright — a sidecar only survives a move/rename/sync if Clutter is running at that exact moment; outside the app it's an orphanable second file, and it doubles every folder's file count.
- **A vault-level database** fails Durability/Portability for exactly the data that matters most — fine for derived data, wrong for `id`/`created`, since a copied `.md` file's "permanent identity independent of filename" evaporates the instant it leaves the vault that has the database row for it.
- **Metadata embedded elsewhere in the Markdown** (HTML comments, custom markers) has every weakness frontmatter has (still needs parsing, still hand-edit risk) with none of frontmatter's ecosystem support (Obsidian/Jekyll/Hugo/GitHub/VS Code already special-case a leading `---` block). Strictly dominated by frontmatter.
- **YAML frontmatter** is the only option where identity is self-sufficient inside a single copied file — durable even opened in a plain text editor decades from now, degrades gracefully in tools that don't understand it, and Import/Export are near-free since the format is already the ecosystem default.

The real weakness found here is implementation, not architecture: `FrontmatterParser`'s hand-rolled parser silently drops unrecognized/nested keys with no `default` case (§0, still open) — a reason to harden the parser/serializer, not to abandon frontmatter.

**A concrete consequence that needs a policy before `PageFactory`/import ship:** `Vault.ts`'s constructor throws and refuses to load the *entire* vault if any two pages share an `id`. Once identity is portable and copyable by design, duplicate IDs stop being a bug and become routine — copying a file between vaults, resolving a sync conflict, duplicating a note in Finder. A hard throw on the whole vault is the wrong failure mode for something this expected; needs an explicit collision policy (regenerate on collision, surface a warning, etc.) before this becomes more common than it is today.

## 13. Arc 3 critical review — page creation pipeline (`PageCreator`/`PageFactory`)

Full principal-review pass over `Application`, `DailyNoteService`, `PageCreator`, `PageFactory`, `PageApplicationService`, `IdGenerator`, `UuidGenerator`, `Vault`, `Workspace`, `DocumentRegistry`, verified against the working tree, not the described design.

**The one finding that matters most: an agreed decision was never applied to the code.** This conversation explicitly decided (precursor to §12) not to seed `Templates/*.md` into the vault — keep built-in defaults compiled into the app only. `vault/initialize/ReservedResources.ts` still seeds `Templates/Note.md`, `Templates/Daily Note.md`, `Templates/Folder.md` from `BuiltInTemplates` today. Until this is reconciled, the architecture being reviewed and the architecture actually running are two different documents — fix this before anything else here.

**Dead code from the abandoned design:** `templates/TemplateServices.ts` (`TemplateService`) and `templates/TemplateVariables.ts` have zero callers anywhere in the app (verified by grep) — `PageCreator`/`PageFactory` fully replaced their job for system pages. `BuiltInTemplates` will also have zero callers once `ReservedResources` is fixed per the above. Delete all three now; when user-editable template bodies are eventually built, rebuild narrower (a pure loader with no IO of its own, feeding `PageFactory.create(frontmatter, body)`) — today's `TemplateService.create()` reads *and* writes a file itself, which contradicts the IO-free pattern `PageFactory`/`PageCreator` now establish.

**What's genuinely solid (verified, not just described):** `PageCreator` (identity + timestamps + content, stateless, no IO) and `PageFactory` (pure string assembly) are correctly single-responsibility and correctly IO-free. `IdGenerator`/`UuidGenerator` mirror the proven `VaultFileSystem`/`LocalVaultProvider` interface-plus-impl shape. `Vault`'s `Link`/`LinkBuilder` cleanup from §10/§11 has fully landed — no `Link` import, no `linkList`, no `links()` remain. Dependency directions throughout are all correct.

**One doc comment now lies:** `PageApplicationService`'s doc comment claims "Create pages" as a responsibility (line 10); `createPage` is still a TODO in the same file. Fix the comment or build the method — don't leave a claimed capability that doesn't exist.

**Data flow — should `Vault` participate in creation?** Not for writing or content generation (would break "immutable in-memory representation," verbatim from `Vault.ts`'s own doc comment). But today's "write file, then let the next full scan/build pick it up" pattern only works because startup does exactly one scan before anything opens. The moment New Note fires during a live session, there's no cheap path to reflect it short of a full `VaultScanner`/`VaultBuilder` rerun. `Vault` will need a narrow `addPage(page: Page): void` seam — registering an already-fully-formed page in its maps, not touching disk — before New Note can work without rebuilding every index for one new page.

**Genuinely inevitable gaps, in rough order of when they'll bite:**
1. The `Vault.addPage` seam above — needed the moment New Note ships.
2. A duplicate-ID collision policy (§12) — Import and Duplicate both make collisions routine, not exceptional; `Vault`'s current hard-throw-on-construction has the wrong blast radius (kills the whole vault load).
3. Frontmatter-stripping body extraction — `Page.source.markdown` is the full file including its original frontmatter block; Duplicate cannot reuse it as a `PageCreator` body without double-embedding frontmatter, and no such extraction utility exists yet.
4. A default-destination decision for new pages (nothing currently decides new notes land in `Inbox` or anywhere else).
5. Edit persistence (carried over from §10, still true) — will become visible the instant New Note ships, since a newly created page can be opened but typing into it still saves nowhere.

**Verdict: 8/10 for this arc's own design.** The class boundaries introduced are genuinely single-responsibility with correct dependency directions and mostly-accurate doc comments. What blocks a higher score: (a) the templates-seeding decision that was agreed but never implemented, meaning code and architecture currently disagree; (b) one doc comment overstating a class's capability; (c) a small, growing pile of previously-flagged, still-open items (`SaveCoordinator` inert since §10, no edit persistence, no ID collision policy) surviving multiple review cycles untouched. Individually minor, but the pattern of "flagged and acknowledged, never closed" is a bigger long-term risk than any single class boundary in this codebase.
