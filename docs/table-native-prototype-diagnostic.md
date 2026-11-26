# Native table prototype isolation — M11 blocker

Parent: exact manually tested browser prototype `e99a5e4086f8ace680791e3994daf42a430f153c`. The lab HTML, TypeScript, shared grammar, table model and dependencies are unchanged. This branch adds only a standalone Tauri example and this diagnostic protocol. It does not change the integrated M11 candidate.

The example reuses the existing native-verify crate's locked Tauri dependency, but does not execute its filesystem scenario runner or register any of its commands/plugins. It clears the configured window and opens a different label, table-lab, with the original page served by Vite. The native menu is the default Tauri menu. No vault, document session or autosave. The prototype still has its historical resize feature; do not exercise it in this comparison.

From the current production worktree, after stopping the previous native app:

```sh
git fetch origin
git worktree add --detach ../table-native-prototype origin/diagnostic/table-native-prototype
cd ../table-native-prototype
npm ci
VITE_PORT=5176 npm run dev:web
```

Keep Vite running. In another terminal:

```sh
cd "$HOME/Documents/ChatGPT/Clutter Git/table-native-prototype"
git rev-parse --short HEAD
cargo run --locked --manifest-path apps/native-verify/Cargo.toml --example table_lab
```

Check that the actual native window is titled "Clutter — original table prototype (native)" and the page says "Nested CodeMirror". The exact root Markdown and Undo/Redo counters are visible. Do not use real notes. Reset between sequences, use actual Cmd+Z/Cmd+Shift+Z and the on-page Undo/Redo buttons separately, and compare each source revision and selection. Record initial source, operation sequence, first wrong source, counter changes and whether a click is needed to regain focus. Test Tab repeatedly, mixed cell edits and Add row/Add column, keyboard undo/redo with a highlighted cell and with a live caret. If keyboard fails but buttons pass, isolate native history routing; if both fail, isolate projection/history reconciliation. If the native prototype passes, the next comparison is the integrated projection versus the original isolation guarantees (atomicRanges, full widget event isolation, deferred selection restoration), then extension stack and document synchronisation. Do not merge/promote M11 based on this diagnostic alone.

Native launcher and results still need owner verification. The wrapper uses the same Tauri crate family and actual WKWebView, not the production app's full startup, window chrome, custom menu or persistence. A passing result is evidence for the isolated case, not certification of the integrated app.
