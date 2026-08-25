# Clutter — Markdown Editor Feature Matrix

What Obsidian, Notion, and Craft support, what Clutter's Lezer grammar and editor stack actually implement today, and what's left to build. This is the sequencing reference for v1 editor implementation work — not a spec and not a plan; each Category B item still needs its own pass through `docs/implementation-rules.md` before code is written.

**Method.** Clutter's current state is read directly from `markdownGrammarExtensions.ts`, `markdownLanguage.ts`, `tokenizeCompactMarkdown.ts`, the `codemirror/` decoration modules, and `docs/editor-architecture-decisions.md` — not assumed from the grammar's presence alone. Competitor columns reflect each product's core feature set, not third-party plugins (e.g. Obsidian community plugins are excluded).

**Categories.** A — already implemented. B — missing, should build for v1. C — competitor feature, not appropriate for Clutter. D — future / intentionally out of scope.

**"Implemented" (Category A) means the source code exists** (grammar, decoration, resolution, etc.) — it does **not** by itself mean the feature is currently rendering in the running app. As of commit `58c7d9d7` ("Reset Markdown editor keyboard behavior to CodeMirror defaults") and `b2dd1327`, every Live Preview *decoration* extension in `MarkdownEditor.tsx` except `emphasisLivePreview()` (Bold/Italic) is commented out — implemented in source, tested, but not currently wired into the editor. Rows below are annotated **"— currently disabled"** where this applies; a row with no such annotation is both implemented and currently wired. Non-decoration behaviors (click/mouse handlers, autocomplete) are unaffected by this and are called out separately where relevant. See `docs/editor-architecture-decisions.md`'s "Live-preview rendering architecture" section for which extensions are disabled and why, and for the fact that no order for re-enabling the rest is currently decided.

**Last verified:** 2026-08-24, against commit `76e657ee` (branch `markdown`). Superseded parts of the original audit are marked "**Updated**" below.

---

## Inline formatting (15 items)

Character-level marks and spans — the things that live inside a line of text.

| Feature | Obsidian | Notion | Craft | Clutter | Cat. | Layer (if B) |
|---|---|---|---|---|---|---|
| Bold `**text**` | ✓ | ✓ | ✓ | **Updated — Live Preview implemented and currently wired**: merged with Italic into one `emphasisLivePreview` plugin (one syntax-tree traversal over `Emphasis`/`StrongEmphasis`; retires the earlier separate `boldLivePreview`/`italicLivePreview` slices), commit `76e657ee`. The only decoration family currently enabled in `MarkdownEditor.tsx` — see `docs/editor-architecture-decisions.md` | A | — |
| Italic `*text*` | ✓ | ✓ | ✓ | **Updated — Live Preview implemented and currently wired**: see Bold row above, same `emphasisLivePreview` plugin, commit `76e657ee` | A | — |
| Strikethrough `~~text~~` | ✓ | ✓ | ✓ | GFM extension + marker decoration + compact renderer — currently disabled (`strikethroughMarkerDecoration()` commented out in `MarkdownEditor.tsx`) | A | — |
| Inline code `` `code` `` | ✓ | ✓ | ✓ | Implemented — currently disabled (`inlineCodeMarkerDecoration()` commented out in `MarkdownEditor.tsx`) | A | — |
| Plain link `[text](url)` | ✓ | ✓ | ✓ | Ordinary Live Preview mark, deliberately not a semantic token (Locked) | A | — |
| Autolink `<url>`, bare URL | ✓ | ✓ | ✓ | GFM Autolink enabled; used as ordering anchor for `@`-family | A | — |
| Image `![alt](url)` | ✓ | ✓ | ✓ | Native, in the semantic-token family (Locked) | A | — |
| WikiLink `[[Page]]`, `[[Page\|alias]]` | ✓ | – | – | Full grammar, resolution, autocomplete, widget, compact rendering — decoration/widget currently disabled (`wikiLinkDecorations()`/`wikiLinkMarkerDecorations()` commented out); click activation and autocomplete remain wired (`wikiLinkMouseHandlers()`, `wikiLinkAutocomplete()`) | A | — |
| Tag `#tag` | ✓ | – | – | Full grammar, resolution, autocomplete, widget — decoration currently disabled (`tagDecorations()` commented out); click activation remains wired (`tagMouseHandlers()`) | A | — |
| Date `@2026-08-21` | plugin | – | – | Clutter-specific `@`-family token, full lifecycle — decoration currently disabled (`dateDecorations()` commented out); click activation remains wired (`dateMouseHandlers()`) | A | — |
| Highlight `==text==` | ✓ | bg color | ✓ | **Updated — now implemented**: `highlightSyntax` grammar node + `highlightMarkerDecoration` + compact renderer (commit `9932a06e`) — currently disabled (`highlightMarkerDecoration()` commented out in `MarkdownEditor.tsx`) | A | — |
| Embed / transclusion `![[Page]]` | ✓ | sub-page | link block | Grammar precedent already named (before: "Image" + continuation check) but not built | B | Lezer grammar, widget, decoration, activation, tests |
| Mention `@Person` | – | ✓ | limited | Explicitly named as the next `@`-family kind, not yet registered | B | Lezer grammar, semantic token, resolution, autocomplete, tests |
| Inline property `@due:2026-01-01` | plugin | – | – | `PropertyToken` named in the architecture log, deliberately deferred | B | Lezer grammar, semantic token, validate, tests |
| Subscript / superscript `~sub~` `^sup^` | ✓ | ✓ | – | Not present; low authoring frequency in note-taking use cases | D | Revisit if a concrete use case appears |
| Footnotes `[^1]` | ✓ | – | – | No footnote extension shipped in `@lezer/markdown` core; would need an external/custom parser | D | Reconsider post-v1 if long-form writing becomes a priority |
| Inline comment `%%hidden%%` | ✓ | – | – | Niche; Notion/Craft solve "hidden text" with page comments instead, a different concept | D | — |
| Per-character text/background color | plugin | ✓ | ✓ | Not representable in portable Markdown without non-standard syntax or inline HTML spans | C | Conflicts with "Markdown is the sole canonical source" (Locked) |
| Emoji shortcode `:smile:` | plugin | ✓ | ✓ | Not core CommonMark/GFM; inconsistent across competitors' own core products | C | Users can already type Unicode emoji directly |

---

## Block formatting (13 items)

Structural, line- or paragraph-level constructs.

| Feature | Obsidian | Notion | Craft | Clutter | Cat. | Layer (if B) |
|---|---|---|---|---|---|---|
| ATX headings `# … ######` | ✓ | ✓ | ✓ | Native grammar + dedicated marker decoration | A | — |
| Paragraphs, hard breaks, horizontal rule | ✓ | ✓ | ✓ | Native CommonMark `---`/`***`/`___`, plus Clutter's own `~---~`/`=---=`/`.---.` variants — `horizontalRuleDecoration()` wired in `MarkdownEditor.tsx` | A | — |
| Blockquote `> text` | ✓ | ✓ | ✓ | **Updated — now implemented**: `blockquoteMarkerDecoration` (commit `f8111f61`) — currently disabled (`blockquoteMarkerDecoration()` commented out in `MarkdownEditor.tsx`) | A | — |
| Bullet / ordered lists | ✓ | ✓ | ✓ | **Updated — now implemented**: `listMarkerDecoration` + `ListBulletWidget` render resting markers as a styled glyph (commits `f8111f61`, `824b3b66`, `809a9909`) — currently disabled (`listMarkerDecoration()`, `listLineDecoration()`, `listIndentWhitespaceDecoration()` all commented out in `MarkdownEditor.tsx`) | A | — |
| Task checkbox `- [ ]` / `- [x]` | ✓ | ✓ | ✓ | **Updated — now implemented**: GFM `TaskList` node + `TaskCheckboxWidget`, interactive/clickable in-editor, wired to the Tasks feature (commits `7d2a22b7`, `dbac5aa1`) — the checkbox *widget decoration* is currently disabled, but its click-toggle behavior remains wired (`taskCheckboxMouseHandlers()`), since it reads the syntax tree directly rather than depending on the rendered widget | A | — |
| Fenced / indented code block | ✓ | ✓ | ✓ | Parses natively; no per-language syntax highlighting inside the block | B | decoration, language data, CSS |
| Tables (GFM pipe tables) | ✓ | ✓ | ✓ | Explicitly disabled in `markdownLanguage.ts` pending this roadmap | B | Lezer grammar, decoration/widget, CSS, compact renderer, tests |
| Callouts `> [!note]` | ✓ | callout block | highlight block | Not present; needs a custom block parser extending Blockquote | B | block parser, widget, CSS, autocomplete, tests |
| Foldable headings / lists | ✓ | ✓ | ✓ | No `foldService` wired; CM6 supports this natively but it isn't configured | B | editor keymap/interaction, decoration, CSS |
| Math `$inline$` / `$$block$$` | ✓ | ✓ | limited | Needs a rendering engine (KaTeX) and custom parser — substantial standalone effort | D | Strong v2 candidate given Obsidian + Notion both support it; not a v1-scope fit |
| Block reference `^blockid` | ✓ | – | – | Niche; no concrete need identified yet | D | Revisit only if block-level backlink granularity is requested |
| Definition lists | plugin | – | – | Not core to any of the three competitors | C | — |
| External embeds (video, PDF, web bookmark) | ✓ | ✓ | ✓ | Distinct from note transclusion above; needs its own fetch/render/security model | D | Out of scope until an embed-fetching trust model is designed |

---

## Editor interaction & UX (7 items)

Not Markdown syntax itself, but the authoring behavior competitors are actually being compared on.

| Feature | Obsidian | Notion | Craft | Clutter | Cat. | Layer (if B) |
|---|---|---|---|---|---|---|
| Reveal-on-engagement Live Preview | ✓ | n/a — block model | n/a — block model | Locked architectural pattern, shared across all semantic tokens — currently only instantiated for the emphasis (Bold/Italic) family (`emphasisLivePreview()`); the semantic-token family (WikiLink/Tag/Date/Task) and remaining marker decorations exist in source but are not currently wired | A | — |
| Autocomplete for links/tags/dates | ✓ | ✓ | limited | Full completion sources for WikiLink, Tag, Date | A | — |
| Typing shortcuts `**` →bold, `-` →list, `>` →quote, `---` →divider | ✓ | ✓ | ✓ | **Verified 2026-08-21 in the running app, partially superseded since**: at the time of that verification, `**bold**`, list markers, and `> quote` all reveal-styled the instant the caret left them, as a direct consequence of the marker decorations shipped for those constructs. Those decorations (list/blockquote) were subsequently disabled (commit `58c7d9d7`, pending re-enablement — see `docs/editor-architecture-decisions.md`); as of `76e657ee`, only `**bold**`/`*italic*` currently reveal-style this way. Remaining real gap unchanged: no keyboard-shortcut path (Cmd/Ctrl-B, -I, -E) to *apply* bold/italic/code to a selection without hand-typing the marker pair; `---` also still only renders as a rule after the fact, no live divider-on-type | B | editor keymap/interaction, tests |
| Smart list continuation (Enter continues, Tab indents) | ✓ | ✓ | ✓ | **Verified 2026-08-21 in the running app**: Enter-continues and empty-item-exits-list already work out of the box via `@codemirror/lang-markdown`'s own `markdownKeymap` (`insertNewlineContinueMarkup`), installed by default since `markdownLanguageExtension()` never passes `addKeymap: false` — confirmed by direct testing, not assumed from the package docs. **Tab/Shift-Tab do not indent/dedent list items** — confirmed still missing, this is the actual remaining gap | B | editor keymap/interaction (Tab/Shift-Tab only), tests |
| Slash command menu | plugin | ✓ | ✓ | A real block-inserter UX, not yet designed for Clutter's plain-text model | D | Candidate to build on the existing autocomplete pattern once scoped |
| Drag-and-drop block reordering | plugin | ✓ | ✓ | Implies a structural block model layered over plain text | C | Tension with "no second document model" (Locked) — would need its own ADR before reconsidering |
| Per-block font family / size controls | – | limited | ✓ | Not representable in portable Markdown | C | Same rationale as per-character color, above |

---

## Next step

**Milestone: Smart List Continuation + Markdown typing shortcuts** — the two remaining Category B items in Editor interaction & UX, and the only ones with zero grammar/widget dependencies (pure `editor keymap/interaction` layer). Live verification narrowed both items further than the original audit assumed:

- **Smart list continuation**: Enter-continues and empty-item-exits are already delivered for free by CM6's built-in `markdownKeymap`. Only **Tab/Shift-Tab list indent/dedent** remains to build.
- **Typing shortcuts**: literal-syntax live rendering (`**`, `-`, `>`) is already delivered by the marker-decoration work already shipped. The remaining gap is a **keyboard-shortcut path** (Cmd/Ctrl-B/-I/-E) to apply bold/italic/code without hand-typing the marker pair.

Per the operational contract: read `docs/implementation-rules.md`, confirm the relevant section of `docs/architecture-specification.md`, then implement.

Everything else in Category B (embeds, mentions, properties, code block highlighting, tables, callouts, folding) remains unscheduled and unimplemented as of this matrix's last verification.
