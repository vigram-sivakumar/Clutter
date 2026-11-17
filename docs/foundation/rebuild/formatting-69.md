# Shared body formatting69

17 November2026. Implements agreed F01–F07 after actual Mac client acceptance68 PASS.
One capability; Ctrl+A/marquee/tasks/images/tables and deferred AI app integration
are not bundled into formatting. Native visual check remains pending.

| Action | Stored scope |
| --- | --- |
| Bold, Italic, Underline, Strikethrough | Selected body text marks; same shortcut executor |
| Link | Selected body text; validated http/https/mailto, Remove link supported |
| Text colour | Selected body text, preset ID |
| Text highlight | Selected body text background, preset ID |
| Block background | Every body text block touched by selected range, preset ID/null |

Toolbar appears above selected BODY text. Input/select controls keep the mapped range;
formatting returns focus to the same retained editor and leaves selection unchanged.
Escape dismisses toolbar while retaining text range. No toolbar for title/object/
collapsed selection or inactive/read-only view. Cmd/Ctrl+B/I/U, Shift+Cmd/Ctrl+X use
one shared executor; caret shortcuts can set typing marks. No OS-specific feature code.

Palette: Gray, Red, Orange, Yellow, Green, Blue, Purple plus Default (clear that
colour only). No custom CSS/hex input. Background/text shades are fixed shared values,
stored as names; final visual component polish remains reviewable. Link editor stays
inside shared toolbar, no OS prompt. Unsafe/invalid links show a validation message.
Reference/date/break atoms retain semantic metadata; text formatting applies around
them without adding unsupported atom marks. Title keeps existing plain-looking/link
semantics and cannot acquire body styles through UI/CLI/MCP or raw editor updates.

## Architecture and completion review

formatting-spec owns names/presets/link checks; schema and JSON/raw-Y accepted validation
share those rules. Unknown marks, unexpected fields, custom colour tokens and title
styles are rejected instead of being silently erased by PM parsing. Existing JSON
format/schema2 is extended with supported marks and nullable body-text background;
old synthetic bundles/sessions stay separate, no migration/shipping claim.

formatting.mjs owns selection scope, one transaction executor, keyboard adaptation
and geometry/lifecycle bridge. UI formatting-toolbar.mjs is React chrome only, no
body mirror or save path. Existing replica dispatcher groups toolbar/shortcuts and
insertion on the same context Undo manager; Core/SQLite/commands/grants/conflicts/
protection are unchanged. Background survives text conversion/list outdent. No
superseded formatting handler exists; old strict link-only raw/JSON validation was
replaced by shared rules, not left as a second incompatible parser.

Native/Rust/runtime source/dependencies/locks unchanged. Shared controls support
Mac/Windows modifiers; Windows native integration and actual pointer/pixel positioning
still require their own platform tests. Ignore rules target only reported generated
paths and local secrets/state; no user Mac file was deleted or inspected for secrets.
Active-app/current-note AI integration is recorded as deferred in rebuild/README.md.

## Scoped Mac acceptance

Apply69 over68, build `npm run desktop -- --new`. No npm install. Use the new synthetic
Space, since prior app bundles are immutable and do not load changed source.

1. Type **Alpha beta gamma** in a body paragraph. Select **Alpha**. Toolbar appears
   directly above the selection. Click Bold: only Alpha becomes bold, selection
   remains on Alpha and the caret/range does not jump. This is the FIRST check.
2. Same range: Italic/Underline/Strikethrough, text colour and highlight. Block background
   affects the whole paragraph. Default clears only the chosen colour/background.
3. Link opens toolbar URL field; valid URL applies to same range, invalid javascript
   link is refused; Remove link clears link only. Title selection never gets toolbar.
4. Undo/Redo, Save, close/reopen retain accepted formatting/content and stable editor
   behavior. Later select a range across paragraph/heading/list to check containing
   block background and range scope; no old list/selection/host research replay.

Record scoped result one step at a time. Then next already-agreed capability is3C
body block selection/Ctrl+A; do not add an independent temporary select-all path.

## Verification69

209 full Linux tests PASS;15 focused formatting tests PASS; strict Core/runtime TS
and54-source dependency boundary checks PASS. Tests exercise every format independently
with unchanged selection, Undo/Redo/save, body-only shortcuts, mixed block backgrounds,
conversion/outdent retention, semantic atoms, invalid JSON and raw-Y formats, actual
CLI/MCP write/read/peer history and production React/PM toolbar controls/link field,
selection/focus/save/context reopen. Linux geometry assertions do not establish native
pixels; Mac toolbar placement/pointer check remains the next scoped user action.

Review found one stored-format vocabulary, one transaction executor, one React toolbar
adapter and the existing context/Core/SQLite paths. Targeted ignore verification covers
reported generated output/secrets only; worker source and active editor source remain
visible. No user credentials read, deleted or embedded. Completed68 terminal and visual
reopen evidence is recorded with its actual window-only scope, not owner restart.
