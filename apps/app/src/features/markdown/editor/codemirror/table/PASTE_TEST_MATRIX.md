# Paste/Table Validation — Test Plan (pre-implementation)

Investigation only. No production code or existing tests were modified to produce this document.

---

## 1. Existing paste architecture

### 1.1 Component map

| Component | File | Mechanism | Fires on |
|---|---|---|---|
| `tableCreatePaste()` | `tableCreatePaste.ts` | `EditorView.domEventHandlers({ paste })`, root view | Any `paste` event on root, when no `range` `TableSelection` is active |
| `tablePaste()` | `tablePaste.ts` | `EditorView.domEventHandlers({ paste })`, root view | Any `paste` event on root, only when a `range` `TableSelection` **is** active |
| `tableCellPaste()` | `tablePaste.ts` | `EditorView.domEventHandlers({ paste })`, **nested** cell view | Any `paste` event on the active cell's nested editor |
| `readClipboardTable()` | `tablePaste.ts` | plain function, shared by all three paste handlers above | Called by whichever handler didn't already decline |
| `tableActivationNormalization()` | `tableActivationNormalization.ts` | `EditorState.transactionFilter` | **Every** doc-changing transaction, regardless of source (keystroke, paste, programmatic) |
| `tableRectangularNormalization()` | `tableRectangularNormalization.ts` | `EditorState.transactionFilter` | Every doc-changing transaction touching a table's row range |
| `tableRootSelectionSnap()` | `tableRootSelectionSnap.ts` | `EditorState.transactionFilter`, registered first (runs **last**) | Every transaction, doc-changing or not |
| `tableLazyAbsorptionGuard` | `tableLazyAbsorptionGuard.ts` | `@lezer/markdown` `endLeaf` predicate (parser-level, not CM6 extension) | Parsing only — decides whether a bare, pipe-less line ends an established table's leaf |
| `tableRangeClipboard()` | `tableRangeClipboard.ts` | `EditorView.domEventHandlers({ copy, cut })` | Copy/Cut while a `range` `TableSelection` is active — **paste is explicitly out of this module's scope** |
| `TableActiveCellController.forwardToRoot` | `tableActiveCellController.ts` | nested-view `updateListener` | Every doc change in the active cell's nested editor (typing **and** any paste CM6 default-handled there) |

### 1.2 Decision flow for a `paste` event

```
paste event (DOM) on root or nested cell view
 │
 ├─ range TableSelection active? ── yes ─→ tablePaste() → readClipboardTable()
 │                                            │             ├─ internal MIME (application/x-clutter-table) → grid
 │                                            │             ├─ text/html has <table> → grid (textContent, formatting LOST)
 │                                            │             ├─ text/plain contains \t → TSV grid
 │                                            │             └─ else → null → return false (CM6 default paste on root)
 │                                            └─ grid → buildPasteChanges() → one transaction (replace/expand rectangle)
 │
 ├─ active cell (no range selection)? ── yes ─→ tableCellPaste() → readClipboardTable() (same priority as above)
 │                                                 └─ grid → pasteGridIntoTable() → root transaction + nested resync
 │                                                 └─ null → CM6 default paste on the NESTED editor
 │                                                            → forwardToRoot() (newlines now collapsed to spaces)
 │
 └─ neither (plain root caret/selection) ── tableCreatePaste() → readClipboardTable() (same priority)
                                               ├─ grid → buildTableMarkdown() → one transaction, brand-new table text
                                               └─ null → return false → CM6 default paste on root
                                                          → this inserted text is now an ordinary doc-changing
                                                            transaction and goes through the transactionFilter chain:
```

### 1.3 The transactionFilter chain (every doc-changing transaction, table-paste-intercepted or not)

Registered order in `buildEditorExtensions.ts` (CM6 runs filters in **reverse** registration order, so first-registered runs **last**):

```
1st registered → tableRootSelectionSnap()            → runs LAST  (sees fully-shaped doc)
2nd            → markdownEnterKeymap / IndentKeymap   (keymaps, not filters — skip)
                orderedListStructuralNormalization()
                tableActivationNormalization()         → can turn plain pasted text that merely
                                                          *looks* like a Markdown table (header + a
                                                          line satisfying FIRST_CELL_COMPLETE) into a
                                                          real, width-normalized, activated table —
                                                          entirely independent of readClipboardTable()
                tableRectangularNormalization()        → pads any ragged row post-edit
last registered → tableCreatePaste()                   → runs FIRST (rawest transaction)
```

**This is the single most important, non-obvious architectural fact for this matrix:**
**"Markdown table syntax" pasted as plain text (no literal tab character) is *never* seen by
`readClipboardTable()`/`tableCreatePaste.ts`/`tablePaste.ts` at all.** It is declined by all three
paste handlers (no tab ⇒ `readClipboardTable` returns `null`), inserted verbatim by CM6's own
default paste, and *then* either:
- recognized directly by Lezer's own GFM `Table` parser if it's already well-formed (leading/trailing
  pipes optional, column counts match) — no active intervention needed, or
- fixed up by `tableActivationNormalization()`'s textual `FIRST_CELL_COMPLETE` heuristic if the
  delimiter row is present but the table isn't fully Lezer-recognizable yet (this heuristic is
  **source-agnostic** — it doesn't know or care whether the transaction came from typing or pasting), or
- left as **inert plain text** if neither condition is met (e.g. dashes without any pipe, or a
  genuinely malformed delimiter row).

So "Markdown table paste" is architecturally a *third, separate* code path from "TSV paste" /
"HTML table paste" / "internal clipboard paste" — it shares no code with `readClipboardTable()`.
Any bug specific to Markdown-table-paste must be chased in `tableActivationNormalization.ts` +
`tableLazyAbsorptionGuard.ts` + Lezer's bundled `Table` extension, not in `tablePaste.ts`.

### 1.4 `readClipboardTable()` clipboard-format priority (shared by all three interceptors)

1. `application/x-clutter-table` (internal MIME) — exact raw Markdown round-trip, never re-escaped.
2. `text/html` containing a real `<table>` element — `parseHtmlTableGrid()` uses `cell.textContent.trim()`,
   which **silently discards all inline formatting** (bold, links, code) from a pasted external HTML
   table. Only Clutter's own internal MIME preserves formatting.
3. `text/plain` containing a `\t` (as of the classification fix) — split into rows/cols.
4. Otherwise `null` — every interceptor declines, CM6 default paste proceeds.

### 1.5 `TableSelection` kinds and paste coverage

`TableSelection` (`tableSelection.ts`) has three kinds: `'column'`, `'row'`, `'range'`. **Only `'range'`
is ever checked by any paste interceptor** (`tablePaste()` explicitly declines for anything other than
`kind === 'range'`; `tableCreatePaste()` also declines whenever *any* `range` selection is active but
has no special-case for `'row'`/`'column'`). **Pasting while a whole row or whole column is selected
(via the row/column handle) is not covered by any table-paste-specific logic at all** — it falls through
entirely to CM6's default paste plus the generic transactionFilter chain. This is a real, load-bearing
gap (see §7).

### 1.6 Root selection vs. table boundaries (`tableRootSelectionSnap.ts`)

The root selection may never have an endpoint strictly inside `[table.from, table.to)` — `table.from`
itself counts as "inside" (a block-replace widget has no ordinary caret position at its own start).
**But** a selection is allowed to have one endpoint *before* a table and the other *after* it — e.g. a
drag-select or `Cmd+A` that spans clean over the table without either endpoint landing inside it. This
is explicitly, intentionally untouched by `tableRootSelectionSnap()`. **Pasting while such a selection
is active is not specially handled anywhere** — `tableCreatePaste()`'s handler just takes
`view.state.selection.main.{from,to}` and replaces that whole range, which would delete an entire table
sitting inside the selection as a side effect of an unrelated paste. See §7.

### 1.7 `TableActiveCellController.forwardToRoot` — cell content sanitization

As of the classification fix, embedded `\r?\n` in the nested cell buffer is collapsed to a space before
being written back to root (also resynced into the nested editor's own display). This covers **any**
route content reaches the nested buffer — typed (blocked earlier, by the `Enter` keymap, so this rarely
fires for typing) or pasted (declined-interception fallthrough, the actual trigger). No other
sanitization happens on cell-forwarded content — a literal, unescaped `|` typed or pasted into a cell
is written verbatim (a pre-existing, documented, out-of-scope gap — see `tablePaste.ts`'s own top doc
comment).

---

## 2. Existing test coverage inventory

| File | What it covers |
|---|---|
| `tableCreatePaste.test.ts` | TSV/plain-text → new table (incl. seeded blank row rules, uneven rows, multi-column, pipe escaping); classification declines (empty/single-word/single-line+newline/multiline+/-trailing newline); clipboard-format priority (internal > html > text) for the *outside-table* path; placement/adjacency (blank-line insertion before/after existing tables, exact regression case for the terminal-newline-adjacency bug); undo/redo; root-selection-never-inside-table invariant; range-selection-present ⇒ declines |
| `tablePaste.test.ts` | Active-cell paste (1x1 … NxM, smaller/larger expanding rows and/or columns, empty-cell clearing, Markdown preserved, pipe preservation); range-selection paste (dimension/selection-resizing rules, drag-direction-independent top-left anchor); safety (alignment preserved on widen, rectangular invariant after expansion, undo/redo, root-selection safety, nested-cell deactivation); clipboard-format priority for the *inside-table* path (internal > html > tab-plain-text); non-tabular decline (falls through to default paste) for both active-cell and "no active cell/no range" cases; newly added: multiline-no-tab and trailing-newline-into-active-cell (no new rows, no corruption) |
| `tableRangeClipboard.test.ts` | Copy/Cut only — TSV/HTML/internal MIME representations, ragged-row-as-empty-field, formatting preserved for internal/plain vs. flattened for HTML-render, scoping to `range`-kind selection only (`row`/`column`-kind and no-selection all decline), doesn't touch the document on Copy, undo/redo on Cut. **No paste coverage** (by design — paste for these payloads is exercised via `tablePaste.test.ts`/`tableCreatePaste.test.ts` instead, since the MIME formats are the same). |
| `tableActivationNormalization.test.ts` | Table creation via **typing** and via **single-shot transaction insert simulating paste** (`dispatchEdit` with one `ChangeSpec`, not a real DOM `paste` event) — first-separator-cell trigger point, cursor safety, column-count independence, alignment-colon preservation, already-canonical-input idempotence (incl. "pasted in one transaction" cases), no re-trigger on subsequent edits, fenced-code guard, terminal-table trailing-newline guarantee across typed/pasted/deleted-after scenarios. **This is the actual coverage for "Markdown table paste," and it never dispatches a real `paste` DOM event** — every "paste" scenario here is simulated via a raw `dispatchEdit`, not through `tableCreatePaste()`'s domEventHandler. |
| `tableRectangularNormalization.test.ts` | Ragged-row padding as a transaction filter (paste of "already-complete-but-ragged" table in one transaction is explicitly covered), column insertion/deletion interaction, undo/redo, cross-table isolation. |
| `tableLazyAbsorptionGuard.test.ts` | Parser-level: bare non-pipe line after an established table ends the table's leaf instead of being absorbed as a ragged row — this governs whether prose *typed or pasted* immediately after a table (no blank line) becomes part of the table or its own paragraph. Worth checking directly for paste-specific coverage (see gap list). |
| `tableActiveCellController.test.ts` | Nested-editor lifecycle, `forwardToRoot`, reconciliation — general, not paste-specific, though the paste-driven newline-sanitization interacts with this file's assumptions. |

---

## 3. Structured test matrix

Legend for the outcome columns:
- **Classify** — which of {declines→CM6 default, TSV grid, HTML grid, internal grid, Markdown-table-via-activation} applies
- **Table created?** — Y/N/Depends
- **Existing structure changes?** — Y/N/N-A (no existing table in scope)
- **Row/col count changes?** — Y/N
- **Falls through to CM6 default?** — Y/N
- **Verification tier** — Unit / Integration / Browser

### 3.1 PLAIN TEXT clipboard × destination

Plain text never contains a `\t`, so `readClipboardTable()` always returns `null` for every subcase
below **except** where noted (pipes/dashes can coincidentally look like Markdown table syntax, which is
a *different* mechanism — §1.3 — not `readClipboardTable`). Default classification: **decline → CM6
default paste**, then the transactionFilter chain runs on the resulting transaction.

| # | Plain-text subcase | Destination | Classify | Table created? | Structure changes? | Row/col Δ? | Falls through? | Tier |
|---|---|---|---|---|---|---|---|---|
| P1 | empty string | empty document | decline | N | N-A | N | Y (no-op) | Unit |
| P2 | one character | empty paragraph | decline | N | N-A | N | Y | Unit |
| P3 | one word | beginning of paragraph | decline | N | N-A | N | Y | Unit |
| P4 | one word | middle of paragraph | decline | N | N-A | N | Y | Unit |
| P5 | one word | end of paragraph | decline | N | N-A | N | Y | Unit |
| P6 | sentence | between paragraphs (blank line) | decline | N | N-A | N | Y | Unit |
| P7 | sentence | immediately before existing table (caret at `table.from`-adjacent line, no blank line) | decline | N | **maybe** — see `tableLazyAbsorptionGuard` interaction: inserted prose could itself become a ragged row if it ends up *above* the table and pipe-free heuristics misfire; more realistically N | N | Y | Integration (needs real table fixture) |
| P8 | sentence | immediately after existing table (no blank line, i.e. right after the terminal safety newline) | decline | N | **possible**: if the pasted text has no pipe, `tableLazyAbsorptionGuard` should keep it out of the table (this is exactly what that guard exists for) — assert it stays a separate paragraph | N | Y | Integration — **this is the guard's own core scenario, verify a real paste (not just `dispatchEdit`) exercises it** |
| P9 | multiline (2 lines, no trailing \n) | empty document | decline | N | N-A | N | Y | Unit (already covered) |
| P10 | multiline with trailing \n | empty document | decline | N | N-A | N | Y | Unit (already covered) |
| P11 | leading newline (`"\nHello"`) | empty document | decline (no `\t`) | N | N-A | N | Y | **Gap — not covered.** Leading newline alone shouldn't matter post-fix, but assert explicitly since the classification regex's old form was symmetric on leading/trailing. |
| P12 | multiple newlines (`"a\n\n\nb"`) | empty document | decline | N | N-A | N | Y — but the double blank line becomes real empty paragraphs; assert no table, and assert paragraph count | **Gap** |
| P13 | blank lines only (`"\n\n\n"`) | empty document | decline | N | N-A | N | Y | **Gap** |
| P14 | CRLF multiline (`"a\r\nb"`) | empty document | decline (no `\t`; CRLF has no tab either) | N | N-A | N | Y — CM6 normalizes CRLF→LF on insert (verify) | **Gap — not covered at all for the outside-table path.** `normalizeGrid` explicitly strips `\r\n`→`\n` for the *tabular* path, but plain-text CRLF never reaches that code, so verify CM6's own default paste handles it correctly on its own. |
| P15 | Unicode/emoji (`"héllo 🎉"`) | empty document, and inside a cell | decline | N | N-A (outside) / N (inside, if pasted into active cell) | N | Y | Unit — cheap, should be parameterized in with P2-P5 |
| P16 | Markdown-looking text, no pipes, just `**bold**`/`# heading` | empty document | decline (readClipboardTable) | N (readClipboardTable's business) — but **could** become a real heading/emphasis via ordinary Markdown parsing, which is correct/expected and orthogonal to tables | N-A | N | Y | Unit (sanity only) |
| P17 | pipes, no valid delimiter row (e.g. `"a \| b \| c"` single line) | empty document | decline (no tab) | **Depends** — a single line with pipes but no second delimiter-row line can never satisfy `tableActivationNormalization`'s trigger (which needs the *line above* plus a delimiter-shaped *this* line) — should stay plain text | N | N-A | N | Y | **Gap — not directly tested as a paste.** `tableActivationNormalization.test.ts` covers "does not activate while the first cell has no closing pipe yet" via typing, not via a single-shot paste of exactly this shape. |
| P18 | pipes forming a **plausible but incomplete** delimiter row (`"Name \| Role\n-\|-"` — malformed dashes) | empty document | decline (readClipboardTable) → activation heuristic may or may not fire | **Depends — needs a decision**, see §7 | — | — | Y | **Gap, and a real product ambiguity** |
| P19 | dashes only, no pipes (`"---"`, `"- - -"`) | empty document, and immediately below a plausible header line | decline | N (no pipe ⇒ `FIRST_CELL_COMPLETE` can't match, `hasUnescapedPipe` fails) — should never create a table, must not be confused with a horizontal rule (`---` alone is also valid GFM thematic-break syntax!) | N-A | N | Y | **Gap — real ambiguity with `---` as a horizontal-rule construct, not just tables. Needs explicit coverage that pasting a bare `---` does NOT anywhere along this pipeline get misread as a table delimiter row (it has no pipe, so it shouldn't, but this is exactly the kind of textual-heuristic edge worth pinning down given `FIRST_CELL_COMPLETE`/`tableDelimiterRow` are separate regexes in two different files with slightly different shapes).** |
| P20 | URLs (`"https://example.com/a?b=1&c=2"`) | empty document, inside a cell | decline | N | N | N | Y | Unit — no `\t`/pipe collision expected, but verify a URL containing no special chars doesn't trip anything downstream (link-autolink detection is a separate, unrelated inline construct — just confirm no interaction) |
| P21 | code-like text (`` "if (x) { return `a\|b`; }" `` — contains a literal pipe inside backticks) | empty document | decline (no tab) | N — but verify the literal `\|` inside inline code doesn't get misread by `tableLazyAbsorptionGuard`'s `hasUnescapedPipe` scan if pasted immediately below an existing table (no blank line) | N | N | Y | **Gap — deliberately adversarial case for `hasUnescapedPipe`, which is *not* Markdown-inline-code-aware; it's a raw character scan. A code snippet with a pipe inside backticks pasted right after a table could be wrongly absorbed as a continuation row.** |
| P22 | plain text into **inside a table cell** (all cell-position subcases) | see §3.6 below | — | — | — | — | — | — |

### 3.2 TSV clipboard × destination

All TSV subcases assume `text/plain` with at least one `\t` somewhere (post-fix classification trigger).

| # | TSV shape | Destination | Classify | Table created? | Structure changes? | Row/col Δ? | Falls through? | Tier |
|---|---|---|---|---|---|---|---|---|
| T1 | 1x1 (`"a"` — **no tab, not actually TSV**) | empty document | decline (this is plain text, not TSV — listed here only to mark the boundary) | N | N-A | N | Y | Already covered (`tableCreatePaste.test.ts`'s "single plain-text cell") |
| T2 | 1x2 (`"a\tb"`) | empty document | TSV grid | Y | N-A | N-A | N | Covered |
| T3 | 2x1 (`"a\nb"` — **no tab** at all, two lines) | empty document | decline (no `\t` anywhere) — **this is the exact P9/P10 case, correctly NOT tabular post-fix** | N | N-A | N | Y | Covered (regression tests just added) |
| T4 | 2x1 with a tab only on one line (`"a\tx\nb"`, ragged) | empty document | TSV grid, ragged→padded | Y | N-A | N-A | N | **Gap** — mixed-raggedness where only some lines have tabs isn't directly tested for the outside-table path (uneven-rows test uses `tsv()` helper where every row has the same tab count minus one column, not a row with *zero* tabs mixed with rows that have some) |
| T5 | 2x2 | empty document, into active cell (replace exact size), into active cell (smaller existing table, expands) | grid | Y / N (existing) / N (existing) | N-A / Y / Y | N-A / N / Y | N | Covered (2x2 cases exist for both paths) |
| T6 | 2x3, 3x2, 3x3 | outside table; into active cell at various positions | grid | Y / N | N-A / Y | N-A / possibly Y | N | Covered for a subset (2x2, header+1 row, uneven); **3x3 and 3x2 not explicitly parameterized — should be, see §5** |
| T7 | empty cells mid-grid (`"a\t\tb"`) | outside table | grid, empty cell preserved | Y | N-A | N-A | N | Covered (`preserves empty cells`) |
| T8 | empty cells mid-grid | into active cell | grid, empty cell **clears** the corresponding cell | N (existing) | Y | N | N | Covered (`empty clipboard cells clear the corresponding table cells`) |
| T9 | uneven rows (ragged TSV) | outside table | grid, `normalizeGrid` pads to widest row | Y | N-A | N-A | N | Covered |
| T10 | uneven rows | into active cell, expanding column count | grid | N (existing) | Y | Y (cols) | N | Covered (`larger paste expands columns`) |
| T11 | leading tab (`"\ta\tb"` → empty first cell) | outside table, into active cell | grid, first column empty | Y / N | — / Y | — | N | **Gap — not explicitly tested; `normalizeGrid`'s `split('\t')` on a leading tab produces `['', 'a', 'b']`, should just work, but pin it down given it's an easy off-by-one to regress** |
| T12 | trailing tab (`"a\tb\t"` → empty last cell) | outside table | grid, trailing empty column | Y | N-A | N-A | N | **Gap** |
| T13 | consecutive tabs (`"a\t\t\tb"` → two empty cells between) | outside table | grid, 4 columns, 2 empty | Y | N-A | N-A | N | **Gap — distinguish from T7 (single empty cell); consecutive tabs is a common real-world Excel/Sheets artifact for merged cells and deserves its own case** |
| T14 | trailing newline (`"a\tb\n"`) | outside table | grid, trailing newline stripped by `.replace(/\n$/, '')` before split | Y, one row only | N-A | N-A | N | **Gap — not explicitly tested for the TSV (tab-bearing) case; only tested for the plain-text no-tab case.** Verify a TSV row + trailing `\n` doesn't produce a spurious second, empty row. |
| T15 | multiple trailing newlines (`"a\tb\n\n\n"`) | outside table | Only **one** trailing `\n` is stripped (`.replace(/\n$/, '')`, not global/greedy across multiple) — the remaining `"\n\n"` after strip would become **two extra empty rows** in the grid! | Y, likely 3 rows (1 real + 2 empty-string rows from the leftover blank lines) | N-A | N-A | N | **Gap — this looks like a real, currently-untested bug surface: `text.replace(/\r\n/g, '\n').replace(/\n$/, '')` only strips exactly one trailing newline. Multiple trailing newlines from clipboard (plausible from a "copy multiple lines" source) would each become a spurious empty TSV row. Needs a dedicated test to confirm actual behavior before deciding if it's a defect.** |
| T16 | CRLF TSV (`"a\tb\r\nc\td"`) | outside table, into active cell | grid, CRLF normalized to LF before split | Y / N (existing) | N-A / Y | N-A / maybe | N | **Gap — not explicitly tested; `readClipboardTable`'s own `.replace(/\r\n/g, '\n')` should handle it, but no test pins this down for either path** |
| T17 | Unicode/emoji in cells | outside table, into active cell | grid | Y / N | N-A / Y | N | N | **Gap — not tested at all for the tabular formats; cheap to parameterize alongside existing cases** |
| T18 | Markdown formatting inside TSV cells (`"**bold**\t_em_"`) | outside table (needs escaping since `source !== 'internal'`) | grid, escaped only for `\|`, Markdown syntax chars otherwise untouched (by design — `escapeTableCellText` only escapes `\|`) | Y | N-A | N-A | N | Partially covered (`preserves Markdown formatting inside pasted cells` exists for the **active-cell** path only, via internal MIME, not for the outside-table TSV path). **Gap: outside-table TSV path with Markdown-looking cell content isn't tested — verify `**bold**` inside a TSV cell survives into the new table's Markdown source untouched (not escaped, not stripped).** |

### 3.3 MARKDOWN TABLE (raw pipe syntax) clipboard × destination

**Critical:** none of these ever reach `readClipboardTable()` (no tab). All go through §1.3's
Lezer-parse-or-`tableActivationNormalization` path. Existing tests in `tableActivationNormalization.test.ts`
simulate these via `dispatchEdit()` (one `ChangeSpec`), **not** via a real DOM `paste` event through
`tableCreatePaste()`'s declined-then-CM6-default-paste route. This distinction matters because a real
`paste` event and a synthetic `dispatchEdit` are not guaranteed to produce byte-identical transactions
(selection handling, `userEvent` annotation, scroll behavior) even though both ultimately hit the same
`transactionFilter` chain.

| # | Markdown-table subcase | Destination | Mechanism | Table created? | Tier |
|---|---|---|---|---|---|
| M1 | leading+trailing pipes, well-formed (`\| a \| b \|\n\| --- \| --- \|\n\| c \| d \|`) | empty document | Lezer recognizes directly; `tableActivationNormalization` just adds trailing safety line | Y | Covered via `dispatchEdit`; **not covered via a real `paste` event** |
| M2 | omitted leading/trailing pipes (`a \| b\n--- \| ---\nc \| d`) | empty document | Lezer's `Table` extension allows this (confirmed in `tableActivationNormalization.ts`'s own doc comment re: GFM's optional pipes) | Y (should be) | **Gap — not explicitly tested either via `dispatchEdit` or real paste** |
| M3 | alignment markers (`:---`, `---:`, `:---:`) | empty document | Lezer/`tableAlignment.ts` | Y, alignment preserved | Covered for typing (`alignment colons are preserved`); **not explicitly covered as a one-shot paste of a table that already has alignment** |
| M4 | escaped pipes inside cells (`\| a \\\| b \| c \|`) | empty document | Lezer counts escaped pipes correctly (should) | Y, cell content contains literal `\|` unescaped-in-display | **Gap — not tested for the raw-Markdown-paste path** (only tested for TSV-sourced escaping in `tableCreatePaste.test.ts`, which is a different code path — TSV paste generates the escape; a pasted table that already has one shouldn't double-escape or mis-split columns) |
| M5 | empty cells (`\| a \|  \|\n\| --- \| --- \|\n\| c \|  \|`) | empty document | Lezer | Y | **Gap** |
| M6 | uneven rows (fewer cells in a data row than the header) | empty document | Lezer accepts (pads at render time?) + `tableRectangularNormalization` pads the source | Y, padded | Covered generally by `tableRectangularNormalization.test.ts`'s "pasting an already-complete-but-ragged table" — **but that test also uses a single-transaction `dispatch`, not a real paste event** |
| M7 | one-row/header-only (header + delimiter, no data row) | empty document | `tableActivationNormalization`'s `hasExistingDataRow` seeds a blank row | Y, with seeded blank row | Covered via `dispatchEdit`, matches the *intended* parity with `tableCreatePaste.ts`'s own TSV single-row-seeding rule — **worth a cross-check test that both paths produce identical seeding behavior for the "single row" case**, since they're two independent implementations of the same product rule |
| M8 | multiple tables in one paste (`table A\n\nblank\n\ntable B`) | empty document | Each recognized independently; the delimiter-line-in-the-middle-of-a-multi-line-paste test partially covers "finds a candidate mid-paste" but for one table, not two | **Depends — needs verification**, likely Y for both, but **not tested for two complete tables in one paste** | **Gap** |
| M9 | table surrounded by prose (`"Before\n\n<table>\n\nAfter"`) | empty document, and appended into an existing document with existing content | Lezer + adjacency; `tableCreatePaste.ts`'s own separator-insertion logic is **irrelevant here** since this never reaches `tableCreatePaste()` at all (no tab) | Y, prose stays outside | Partially covered (`tableActivationNormalization.test.ts`'s "table followed by an existing paragraph is left completely untouched") — **the "before" side (prose immediately preceding the pasted table, no blank line) is the interrupt-a-paragraph case, and is only indirectly touched, not a dedicated test** |
| M10 | malformed dashes (`\| a \| b \|\n\|--\|--\|` — dash run of 2, valid; vs. `\|:\|:\|` — colon with no dash, invalid GFM) | empty document | Lezer's own delimiter grammar decides; a truly invalid delimiter row should leave the input as plain paragraph text (no table at all) | **Depends — needs verification of the invalid case producing NO table (not a corrupted one)** | **Gap, and worth a negative test: pasting something that looks table-ish but is invalid GFM should never leave the document in a partially-converted state** |

### 3.4 HTML TABLE clipboard × destination

| # | HTML subcase | Destination | Classify | Table created? | Tier |
|---|---|---|---|---|---|
| H1 | normal (`<table><tr><td>a</td></tr></table>`) | outside table, into active cell | HTML grid (`querySelector('table')`, first only) | Y / N (existing) | Covered for both paths (basic case) |
| H2 | empty cells (`<td></td>`) | outside table | HTML grid, empty string cell | Y | **Gap — not explicitly tested; only TSV/internal empty-cell cases exist** |
| H3 | formatted cells (`<td><b>Bold</b> and <a href="...">link</a></td>`) | outside table, into active cell | HTML grid via `textContent.trim()` — **formatting is silently discarded**, cell becomes plain `"Bold and link"` | Y / N (existing) | **Gap, and a real, likely-surprising product behavior worth an explicit test that pins down (not just implies) that HTML-table-paste loses all inline formatting** — contrast with internal-clipboard paste, which explicitly preserves it (`I3` below) |
| H4 | multiple `<table>` elements in one HTML payload | outside table | Only the **first** `<table>` (`doc.querySelector('table')`, not `querySelectorAll`) is read; the rest of the HTML (including any second table) is silently ignored | Y, only first table's data | **Gap — worth a dedicated test since this is an easy thing to regress if `parseHtmlTableGrid` is ever changed to iterate** |
| H5 | HTML with a `<table>` nested inside other wrapper markup (e.g. copied from Word/Excel/Gmail, `<div><table>...</table></div>` or a `<table>` wrapping the *whole* clipboard payload for layout, not as tabular data) | outside table, into active cell | HTML grid — **this is a realistic false-positive source**: many apps wrap arbitrary rich text in a layout `<table>` (Outlook, old Word HTML export). Pasting a formatted paragraph copied from such an app could trigger table creation even though the user intended ordinary text. | Y (arguably wrongly) | **Gap and a genuine, real-world variant of the original bug report — not covered by the classification fix at all, since the fix only touched the `text/plain` branch. The `text/html` branch's `querySelector('table')` is exactly as broad as the old `\n`-based text/plain check was.** See §7 — this may need a product decision. |
| H6 | `text/html` present but `text/plain` also present and non-tabular, `<table>` absent | outside table, into active cell | falls through to `text/plain` per priority | Y only if `text/plain` has a tab | Covered ("falls back to plain-text behavior when HTML has no `<table>`") |

### 3.5 INTERNAL TABLE CLIPBOARD (`application/x-clutter-table`) × destination

| # | Internal-clipboard subcase | Destination | Classify | Table created?/Structure changes? | Tier |
|---|---|---|---|---|---|
| I1 | whole table (copied via some future "copy whole table" affordance — currently `tableRangeClipboard()` only supports a `range` selection, so "whole table" = a range spanning the entire body) | outside table, into active cell of a **different** table | internal grid | Y / Y (replaces at target) | Partially covered (existing 1x1..NxM tests are all "range" copies of varying size — a copy sized to exactly match a whole other table isn't specifically named as its own case, but the mechanics are identical) |
| I2 | single row (`row`-kind selection) | **copy is explicitly declined for `row`-kind** (`tableRangeClipboard.test.ts`: "does not intercept copy for a row-kind TableSelection") | N-A — no internal MIME is ever written for a `row`/`column` selection, so a paste sourced from one necessarily falls back to whatever the OS captured via native drag/other means | — | Already covered as a **non-feature** (declines), but **worth an explicit paste-side test**: if a user somehow gets `row`/`column`-selection clipboard data onto the clipboard (e.g. OS-level table screenshot-to-text tools), what does paste do? Almost certainly falls through per §1.5's gap. |
| I3 | single cell | outside table, into active cell | internal grid, exact Markdown preserved (e.g. `**Bold**`) | Y / Y | Covered (`uses the internal Clutter clipboard when present, unescaped`) |
| I4 | rectangular selection (2x2, 2x3, etc.) | outside table, into active cell (same size / expanding) | internal grid | Y / Y | Covered |
| I5 | ragged selection (copy from a table where the selected rectangle partially overlaps a shorter row) | into active cell of a table that's now a different shape than the source | internal grid — copy side already handles this (`copies a range from a ragged source row — the missing cell copies as an empty field`); **paste side of a ragged-sourced internal payload isn't separately tested** — does `normalizeGrid` on the paste side correctly treat the already-padded `''` entries? | Y | **Gap — small, since `normalizeGrid` should just work on an already-rectangular grid, but the specific "round-trip a ragged copy through paste" scenario isn't named as its own test** |
| I6 | internal payload with escaped pipes already present (`"A \\| B"`) | into active cell | internal grid, **not re-escaped** (`source === 'internal'` skip) | Y | Covered (`preserves escaped pipes already present in copied Markdown content`) |
| I7 | malformed/corrupted internal JSON (e.g. manually edited clipboard, or a payload from an incompatible future format version) | outside table, into active cell | `JSON.parse` throws → caught → falls through to html/text | N (unless html/text also present) | **Gap — not tested.** `readClipboardTable`'s `try/catch` around `JSON.parse` plus the shape-check (`kind === 'clutter-table-range'`, `Array.isArray(rows)`) should degrade gracefully, but no test exercises a malformed/wrong-shape internal payload. |

### 3.6 Destination-focused matrix: pasting **inside** a table cell (any clipboard category)

This cross-cuts §3.1–3.5 by *where inside the table* the active cell/range sits — genuinely distinct
geometry concerns (`buildPasteChanges`) independent of clipboard format.

| # | Cell position | Paste shape | Structure changes? | Tier |
|---|---|---|---|---|
| C1 | inside header row, single cell (active-cell target) | 1x1 | Header cell content replaces; **column width/alignment row not otherwise touched** | **Gap — no test pastes directly into a header cell specifically** (existing tests target body rows) |
| C2 | inside header row | NxM expanding columns | Header widened (own code path, `columnsToAdd > 0 && targetRow > 0` is the *body*-row branch; targetRow === 0 is a *different* branch) — this asymmetry (header-target vs. body-target column-widening) is real and should be tested from **both** starting points | **Gap — the two branches (`targetRow > 0` widening header explicitly vs. `targetRow === 0` widening header via the main loop) are only exercised from a body-row starting point in existing tests** |
| C3 | first body row, first/middle/last column | 1x1, NxM | as generic active-cell/range cases | Covered generically, not exhaustively per column position |
| C4 | middle body row | 1x1 | as generic | Covered |
| C5 | last body row, paste expands past the last row | NxM (rows > available) | new rows appended | Covered (`larger paste expands rows`) |
| C6 | empty cell (no existing content) | 1x1, NxM | cell filled, `padCellContent` from empty | **Gap — dedicated empty-cell-as-target test doesn't exist**; `empty clipboard cells clear...` tests the *reverse* (pasting empty *into* a populated cell), not pasting *into* an empty cell |
| C7 | beginning/middle/end of existing cell content (active-cell paste at a sub-cell caret offset, not select-all-of-cell) | plain text (non-tabular, declines) | text inserted at that offset within the cell (nested-editor caret position matters) — **already indirectly covered** (`non-tabular plain text pasted into an active cell falls through... NairobiVik`, caret at start of "Vik") but **not for middle/end offsets** | **Gap — parameterize caret offset within the cell for the decline-path insertion** |
| C8 | adjacent to table boundary: caret in the **last** navigable row, at the row's own trailing edge, paste triggers `rowsToAdd` | NxM | new rows appended past table end; verify `tableRectangularNormalization`/`tableActivationNormalization`'s terminal-table-safety trailing-newline guarantee still holds when the table's *last* row moves further down via a cell-paste (not `tableCreatePaste`'s own path) | **Gap — the terminal-newline guarantee is well-tested for `tableCreatePaste`'s own new-table creation, but not for an existing table that becomes newly document-terminal as a side effect of an active-cell/range paste growing its row count** |

### 3.7 SELECTIONS × paste

| # | Selection state at paste time | Expected routing | Tier |
|---|---|---|---|
| S1 | collapsed cursor, outside table | `tableCreatePaste()` | Covered |
| S2 | collapsed cursor, active cell | `tableCellPaste()` | Covered |
| S3 | character/word selection, outside table (root text selection, non-empty, entirely outside any table) | `tableCreatePaste()` — uses `selection.main.{from,to}`, replaces the selected text | **Gap — every existing `tableCreatePaste` test pastes at a collapsed cursor (`{from: X, to: X}`); none exercise replacing a non-empty root selection** |
| S4 | entire cell selected (nested-editor select-all within the active cell) | `tableCellPaste()` — should replace the cell's whole content, not insert mid-content | **Gap — not tested; existing active-cell tests always paste at a collapsed nested caret (from `activateCell`'s own construction, caret = `from`), not after a select-all inside the cell** |
| S5 | multiple cells selected (`range`-kind `TableSelection`) | `tablePaste()` | Covered extensively |
| S6 | entire row selected (`row`-kind `TableSelection`) | **neither `tablePaste()` nor `tableCreatePaste()` claims it** — falls through to CM6 default paste on root, landing wherever root's own (collapsed, per `tableRootSelectionSnap`) selection sits | **Gap — real, see §1.5 and §7** |
| S7 | entire column selected (`column`-kind `TableSelection`) | same as S6 | **Gap — same as S6** |
| S8 | entire table selected (a `range` spanning the full header+body rectangle) | `tablePaste()`, same mechanics as any other `range`, just larger extent | Should be covered by existing "2x2 selection" style tests generalized, but **not explicitly named as "whole table" — worth one dedicated test for clarity/regression-naming** |
| S9 | selection crossing a table boundary (root selection with one endpoint before the table, one after, spanning clean over it — allowed per `tableRootSelectionSnap`, see §1.6) | `tableCreatePaste()` — `{from, to}` spans the whole table; a paste here **deletes the entire table** as a side effect | **Gap and a real product-behavior question — see §7. Not tested anywhere; plausible real user action (`Cmd+A` inside a note containing a table, then paste to "replace everything").** |

### 3.8 TABLE CREATION mechanisms × edge cases

| # | Creation trigger | Notes | Tier |
|---|---|---|---|
| K1 | typing, character by character | Covered extensively in `tableActivationNormalization.test.ts` |
| K2 | separator completion (first cell's closing pipe) | Covered — the module's whole reason for existing |
| K3 | multiple separator cells typed before completion registers | Covered ("longer dash run with no closing pipe yet") |
| K4 | incomplete separators (dash run with no pipe at all) | Covered (declines) |
| K5 | invalid separators (e.g. `\|:x:\|` — colon-letter-colon, not a valid alignment marker) | **Gap — not tested; `FIRST_CELL_COMPLETE`'s regex (`:?-+:?`) requires at least one dash, so `:x:` shouldn't match at all, but this is exactly the kind of near-miss worth pinning down explicitly** |
| K6 | code block/fenced code guards | Covered (`does not activate a "\| - \|"-shaped line inside a fenced code block`) — **only fenced code is tested; indented code blocks (`CodeBlock` node, also in `EXCLUDED_BLOCK_NODES`) are not explicitly tested** |
| K7 | TSV-driven creation | Covered via `tableCreatePaste.ts` |
| K8 | Markdown-table-driven creation | Covered via `dispatchEdit` simulation only (§3.3's core gap — no real `paste` event test) |

---

## 4. Gaps in current coverage — summary (highest-signal items)

Ranked by how likely each is to represent an actual latent defect vs. "just untested but probably fine":

1. **T15 — multiple trailing newlines in TSV paste** (`"a\tb\n\n\n"`) likely produces spurious empty rows,
   since `.replace(/\n$/, '')` strips exactly one trailing `\n`, not all of them. This is the same class
   of bug as the one just fixed, just for the TSV branch instead of the plain-text branch. **Recommend
   verifying this first**, before writing the rest of the matrix as tests.
2. **H5 — HTML table wrapping non-tabular rich text** (Outlook/Word/Gmail-style layout tables) is a live,
   realistic variant of the original bug report that the just-shipped fix does not address at all, since
   it only touched the `text/plain` branch. `parseHtmlTableGrid`'s `querySelector('table')` is exactly as
   unconditional as the old `\n`-regex was.
3. **S9 — selection spanning across a table boundary, then paste** silently deletes the whole table. Not
   exotic — a plausible `Cmd+A`-then-paste user action.
4. **S6/S7 — paste during a `row`/`column`-kind `TableSelection`** has no defined behavior at all; falls
   through to whatever CM6 default + generic filters happen to produce.
5. **P21 — literal `|` inside inline code, pasted immediately after a table** (`hasUnescapedPipe` in
   `tableLazyAbsorptionGuard.ts` is a raw character scan, not Markdown-aware) could be wrongly absorbed
   as a continuation row.
6. **M10 — invalid GFM delimiter row pasted** — needs a negative test confirming no partial/corrupted
   conversion.
7. **Every M-series (§3.3) case tested only via `dispatchEdit`, never a real `paste` DOM event** — the
   existing `tableActivationNormalization.test.ts` suite doesn't prove the real paste pipeline
   (`tableCreatePaste()` declining → CM6 default paste → transactionFilter chain) behaves identically to
   a hand-constructed single `ChangeSpec`. Worth at least a handful of real-paste-event equivalents for
   the highest-value M-cases (M1, M6, M7, M9).

---

## 5. Which cases should be parameterized

These are naturally table-driven (`it.each`) rather than one-off `it()` blocks, since the logic under
test is identical across the variants and only the input/expected-grid-shape changes:

- **Plain-text decline sanity** (P1–P5, P15, P20): one `it.each` over `['', 'x', 'word', 'a sentence', 'héllo 🎉', 'https://x.com']` asserting "never creates a table, text lands verbatim" for both the outside-table and active-cell-decline paths.
- **TSV grid shapes** (T5/T6): one `it.each` over `[[1,1],[1,2],[2,1],[2,2],[2,3],[3,2],[3,3]]` generating an `r×c` TSV grid and asserting header/row/column counts for both `tableCreatePaste` and active-cell paste.
- **TSV cell-content edge cases** (T7, T11, T12, T13): one `it.each` over `['a\t\tb', '\ta\tb', 'a\tb\t', 'a\t\t\tb']` with named expected cell arrays.
- **Line-ending variants** (T14, T15, T16, CRLF-plain-text P14): one `it.each` over trailing-newline-count × CRLF-vs-LF, since these are exactly the "how many newlines get stripped/split" family the just-found T15 gap belongs to.
- **HTML-table variants** (H2, H3, H4): one `it.each` over cell-content shapes (`plain`, `empty`, `<b>bold</b>`, two-`<table>`-payload) reusing the existing `htmlTable()` test helper, extended to accept raw cell HTML instead of only plain strings.
- **Cell-position matrix** (§3.6, C1–C6): one `it.each` over `{row: 'header'|'first'|'middle'|'last', col: 'first'|'middle'|'last'}` combinations against a fixed 3x3+ fixture table, asserting the paste lands in the right logical cell and structure changes match expectations — this is the single highest-value parameterization opportunity in the whole matrix, since the current tests hand-pick row/col indices per test rather than sweeping the position space.
- **Selection-kind routing** (S1–S9): one `it.each` over `['none', 'row', 'column', 'range', 'cross-boundary']` asserting which handler (if any) claims the paste — this doubles as the regression test for whichever product decision comes out of §7's S6/S7/S9 questions.

## 6. Cases that genuinely require browser/Tauri verification (not just unit/integration)

Unit tests here use `MockDataTransfer`/synthetic `ClipboardEvent`s dispatched via `dispatchEvent`, which
is representative for CM6's own event handling (confirmed empirically during the prior fix) but cannot
exercise:

1. **Real OS clipboard content shape** — actual `text/html` payloads from real applications (Excel,
   Google Sheets, Word, Notion, Numbers, Outlook) have their own idiosyncratic markup (H5's Outlook/Word
   layout-table concern is only meaningfully testable against a *real* copied fragment from those apps,
   not a hand-authored `<table>` string). **This category can't be fully closed by unit tests alone** —
   at minimum, manually copy-from-and-paste-into the real app from Excel/Google Sheets/Word once each and
   record the resulting Markdown, since `parseHtmlTableGrid`'s behavior against real-world HTML is the
   actual product surface, not the synthetic fixture.
2. **`navigator.clipboard` permission-gated paths** — if any future work moves off raw `paste` DOM events
   toward `navigator.clipboard.read()`, permission prompts are only observable in a real browser/webview
   (confirmed directly this session: `navigator.clipboard.writeText` is permission-denied in the
   automated Browser-pane context, unlike a real user gesture in the shipped app).
2. **Tauri webview clipboard behavior** — the desktop build runs in a system webview (not Chromium's
   exact clipboard implementation), which may differ subtly in what MIME types are actually populated for
   a given native copy source (e.g. does the Tauri webview even receive a `text/html` payload from a
   native macOS app's Cmd+C the same way Chrome does?). **Every H-series (§3.4) and the H5 concern
   specifically should be spot-checked in the actual Tauri desktop build**, not just `dev:web`.
3. **Visual/undo-stack verification of multi-step scenarios** — S9 (selection-crossing-boundary paste)
   and the terminal-newline-guarantee interactions (C8) are the kind of thing where the *document text*
   can be asserted in a unit test, but confirming the *caret actually lands somewhere sane and undo
   restores a clean single step* benefits from an actual visual pass, per this project's own established
   pattern (`git log` shows prior work already treats "verify in the real webapp" as required for
   editor/UI changes, not just passing unit tests).
4. **IME/composition-driven paste-adjacent input** — out of this matrix's explicit scope (not requested),
   flagged only because "Unicode/emoji" (P15/T17) sometimes surfaces IME-composition interactions that
   differ between synthetic `ClipboardEvent`s and real OS-level paste; worth a manual spot-check only, not
   a full sub-matrix.

## 7. Contradictory / underspecified existing behavior — needs a product decision before implementation

1. **S6/S7 — paste during a whole-row or whole-column `TableSelection`.** No component claims this paste.
   Two coherent options: (a) treat it like a `range` selection anchored at that row/column's own
   top-left — i.e. extend `tablePaste()`'s `kind !== 'range'` check to also accept `'row'`/`'column'` by
   converting them to an equivalent `range` extent before calling `pasteGridIntoTable`; or (b) explicitly
   decline (current de facto behavior) and let CM6 default-paste at wherever root's own collapsed
   selection sits, which is very likely to feel broken to a user who just selected an entire row and
   pasted, expecting it to be overwritten. **This needs a decision — the current behavior is an accident
   of no one having implemented it, not a considered choice**, so it shouldn't be treated as a locked
   contract the way `tablePaste()`'s own explicit `'range'`-only doc comment treats its actual scope.
2. **S9 — paste over a selection that spans across (not into) a table.** Should this be prevented
   (clamp the paste's effective range to stop at the table boundary, preserving the table and only
   replacing the non-table portions of the selection — genuinely complex), allowed exactly as today
   (delete the whole table as a side effect of an unrelated paste — matches naive "selection replace"
   semantics every other editor uses, but is surprising specifically because the table is a widget, not
   visible "text" the user necessarily meant to include), or should such a selection be impossible to
   construct in the first place (extend `tableRootSelectionSnap()`'s own invariant to reject/clamp a
   selection whose endpoints straddle a table, not just one landing inside it — a much bigger change to
   an already-carefully-reasoned invariant)? **This is the highest-stakes open question in this matrix** —
   it touches `tableRootSelectionSnap.ts`, a module whose own doc comment explicitly says changing its
   invariant requires re-deriving the reasoning from the CM6 source, not intuition.
3. **H5 — HTML `<table>` used as non-tabular layout markup.** Is "any HTML clipboard payload containing a
   `<table>` anywhere is tabular data" still the right heuristic, now that the equivalent `text/plain`
   heuristic was tightened specifically because "any newline anywhere" was too broad? The email/Word/Excel
   layout-table pattern is a real, non-hypothetical source of false positives, structurally identical to
   the bug just fixed. Options: require the `<table>` to not be the sole top-level element wrapping
   otherwise-unstructured content (heuristic, fragile), require more than 1 row AND more than 1 column
   (would break legitimate 1x1/1xN copies from spreadsheets, already explicitly supported), or accept this
   as a known, documented limitation for now (matches this codebase's existing pattern of writing down
   known gaps rather than silently leaving them, e.g. the pipe-escaping gap in `tablePaste.ts`'s own doc
   comment) and revisit only if it's actually reported. **Needs a decision on which of these (or leave as
   documented gap) before writing H5 tests**, since the test's own expected outcome depends on the answer.
4. **T15 — multiple trailing newlines in TSV.** Is "an extra trailing blank TSV row becomes an extra blank
   table row" acceptable (arguably harmless — an empty row is easy to delete), or should the same
   `.replace(/\n$/, '')` → `.replace(/\n+$/, '')` (strip *all* trailing newlines) fix applied here too?
   This is a much smaller, more mechanical decision than #1–#3, but it's still a behavior change and
   should be decided (and tested) deliberately rather than discovered as a side effect of an unrelated
   change later.
5. **M10/P18/P19 — where exactly is the line between "textual heuristic recognizes this as a table" and
   "Lezer's own Table grammar recognizes this," and are their edge cases actually identical?**
   `tableActivationNormalization.ts`'s `FIRST_CELL_COMPLETE` (`/^\s*\|?\s*:?-+:?\s*\|/`) and
   `tableLazyAbsorptionGuard.ts`'s `tableDelimiterRow`
   (`/^[>\s]*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/`) are two independently-written regexes for a
   related-but-not-identical concept (first-cell-complete vs. whole-row-is-a-delimiter-row) living in two
   different files. It's plausible there's an input shape where one considers a line "table-ish" and the
   other doesn't, producing inconsistent behavior depending on which code path a given paste happens to
   hit. **Worth a dedicated audit (not just individual test cases) comparing these two regexes against a
   shared list of edge-case delimiter-row strings before trusting either matrix section's "Depends" rows
   to resolve cleanly.**

---

## Suggested order of attack (once cases above are triaged/decided)

1. Close T15 (mechanical, low-risk, same bug class as the shipped fix) — confirm behavior, decide, fix + test.
2. Add the real-`paste`-event equivalents for the highest-value M-series cases (M1, M6, M7, M9) so the
   Markdown-table-paste path has *some* coverage through the actual DOM event, not only `dispatchEdit`.
3. Parameterize the cell-position matrix (§3.6) — highest test-writing leverage, no product decisions needed.
4. Get product decisions on §7 items 1–3 (S6/S7, S9, H5) before writing tests for them, since the tests'
   own expected outcomes depend on the answers — writing tests against undecided behavior would just be
   pinning down accidents as contracts.
5. Everything else in the gap list (§4) is independent and can be parallelized once the fixtures/helpers
   from steps 2–3 exist.
