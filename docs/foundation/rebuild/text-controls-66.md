# Shared text controls66

17 November2026. Implements the latest approved conversion UX and body-wide indent.

| Action | Behavior |
| --- | --- |
| Text command in empty or filled text block | Convert in place; remove only /command; preserve remaining inline content, ID, indent, parentage and mapped caret; focus ready to type |
| Tab / Shift+Tab in paragraph, H1–H6, ordered/unordered item | One shared transform moves explicit subtree; preserves type/text/selection; root Shift+Tab does nothing |
| Title / separator / objects | Do not initiate body indentation; table mode keeps separate contract |
| Separator command |63: above empty / below filled, retain current block and caret |

block-definitions.mjs defaults text to convert/convert/inserted. insertionPolicies
still supports convert/before/after plus inserted/retain, validated against supported
types. createInsertionTransaction is the sole executor; replica dispatcher owns
focus/history boundaries. Shared block-indentation.mjs replaces list-only Tab logic;
block-structure.mjs owns graph selectors. No compatibility alias or second indent
state. List Enter/Backspace behavior is unchanged. UI/CLI/MCP keep one accepted Core,
SQLite, revision/conflict/save path and per-context interactive history.

C01 source fix removes paragraph's margin shorthand overriding shared margin-left.
Canonical indent attrs and --block-indent remain authoritative. Automated DOM/style
metadata checks cannot establish native pixels: source fixed, Mac visual pending.

184 full Linux tests PASS, strict Core/runtime TS PASS,49-source boundaries PASS.
Final scoped production UI test PASS after replacing an invalid jsdom computed-pixel
assertion with accurate metadata checks. Real CLI/MCP test writes indented heading,
UI outdents/converts to list, CLI reads accepted result. Existing real peer save,
conflict/history regressions pass. Ownership review removed old list-only indentation,
found one conversion/indentation path; no native/OS code, Core schema/contracts,
dependencies/locks or runtime ownership changed. No Mac/Windows/IME/shipping pass.

## Scoped Mac acceptance

Apply over65; `npm run desktop -- --new` builds changed source in a fresh synthetic
Space. No install. Prior sessions keep their original bundles.

1. Type text in a body paragraph; Tab twice, use /h2. Same text/block becomes H2 at
   the same indent; caret ready. Shift+Tab twice visibly returns it to left edge.
2. Convert filled heading using /ol then /ul. Preserve text and indent; type directly.
   Undo/Redo and Save/reopen preserve accepted type/content/indent.
3. C01: indent ordered AND unordered items, Backspace at start. Paragraph must visibly
   retain that indent; further Backspaces visibly outdent one level each.
4. Separator63 remains unchanged; title does not receive body indentation. Continue
   outstanding list key checks without claiming a whole list pass from one case.

NEXT after editor check: dedicated real Mac CLI/MCP read/write/conflict/save/reopen
acceptance before formatting. Ctrl+A/body block selection stays queued3C.
Mandatory every-change architecture/client review is in ../AGENTS.md and root AGENTS.
