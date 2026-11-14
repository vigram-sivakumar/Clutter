# Run the native Mac checks

This builds a separate **Clutter R07 Lab.app** using AppKit and WKWebView. It does
not open Clutter or your Spaces. It uses the same isolated web candidates; no
production source is imported. Use synthetic content only: exported reports include
fixture snapshots and your notes. Nothing is uploaded automatically.

## Start on your Mac

Apply experiment patches 01–05 in order (04 fixes compilation; 05 updates tables). Quit the old lab before rebuilding. From the repository root:

```bash
cd docs/foundation/experiments/r07-two-view
npm ci --ignore-scripts --workspaces=false
npm run native:check
npm run native:mac
```

Requires Node 22+, macOS 12+ and Xcode Command Line Tools. If the check reports
missing Apple tools, run `xcode-select --install`, finish installation and rerun.
There is no Rust, Tauri, certificate account or cloud configuration requirement.
The script builds web assets, compiles Swift into a separate app bundle, signs it
locally with an ad-hoc signature, and serves fixed assets on an ephemeral loopback
port while the app runs. This is a repository-backed local test host, not a
redistributable signed/notarized release. Keep the terminal running.

**The Linux host cannot compile AppKit.** The user has now reported a successful
Mac build/launch after patch 04 and four step-candidate fixture passes. These are
recorded in [native progress](../../../NATIVE-TEST-PROGRESS.md); the revised table
profile in patch 05 still needs its own native retest. Build/fixture success does
not establish keyboard/IME/accessibility acceptance.

## What you do

1. Two candidate windows open. In each, click **Fixture checks (resets)** first.
   This automates four model/view checks in WKWebView; it does not mark native
   input cases passed.
2. Choose a case from the native dropdown. Follow its steps; record **Pass**,
   **Fail** or **Blocked**, with useful notes. Test IME, actual Edit menu routes,
   clipboard and VoiceOver yourself. Record the physical key chord and input source.
3. Use **Experiment** to switch candidates or open raw/adapted minimal controls.
   The A/B panes within one window share content; different candidate windows have
   independent authorities. Do not interpret them as shared-document OS windows.
4. Quit with **Command-Q**. The terminal prints the JSON report path. Share that
   file here. **Experiment → Reveal saved JSON report** opens it in Finder too.

There are nine bounded manual cases (eight apply to both candidates; save-failure
protection applies only to the step candidate). They are a first native pass,
not the full editor matrix. Repeat available IME languages and record unavailable
ones as blocked in Notes. Do not mark something passed because a browser test did.

Reports save automatically after verdicts/fixture checks and at quit. Rerun attempts
are retained; an observed failure stays failing for that case in the same build/
session even if a later retry passes. Keep the report from a failing run.

## What is automatic versus manual

| Automatic                                                       | Needs your native observation                               |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Tool discovery, web build and native compilation on Mac         | Physical keyboard/selection and immediate input             |
| Separate app and bounded, fixed-route local asset server        | Native Edit menu Undo/Redo and focus return                 |
| Fixture/view equality and mapped background selection checks    | Real IME composition, cancellation and candidate navigation |
| OS/build/source fingerprints, bounded event trace and snapshots | Native clipboard and paste styles                           |
| Local JSON report/checkpoint creation                           | VoiceOver names, roles and keyboard escape paths            |

Native menu items use AppKit's responder chain. They do **not** directly call JS
undo to manufacture a pass. If a menu command is disabled or routes incorrectly,
mark it failed/blocked and describe it. The trace avoids raw key characters and
clipboard reads, but fixture snapshots contain any text you type: keep it synthetic.

## Scope and recovery

WKWebView website data is deliberately nonpersistent/in-memory. The **Protect &
restart** page button tests the step candidate's in-session browser adapter;
quitting/relaunching this host is **not** a native on-disk durability/crash test.
The origin comparison still lacks persistence/CLI/MCP parity. Do not infer those
features from another candidate's tests. No provider/network collaboration is added.

If launch fails, share `artifacts/native-setup-result.json` and the compiler error
from the terminal. `artifacts/native-preflight.json` records unavailable tools.
If the app loads but a case fails, mark it and share the timestamped `artifacts/native-*.json`
report. You need not inspect raw logs to perform the checklist. Generated bundles,
logs and reports are ignored by git. Stop with Command-Q; Ctrl-C terminates the
child if needed, preserving checkpoints already written.

## Primary platform references checked 2026-11-14

- [Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)
- [Apple nonpersistent website store](https://developer.apple.com/documentation/webkit/wkwebsitedatastore)
- [Apple local networking ATS key](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking)

This host has a distinct bundle identifier and no app sandbox/release qualification.
It tests native web input integration, not a final desktop framework choice.

## Resume the current native run

[Native progress](../../../NATIVE-TEST-PROGRESS.md) is the live handoff. Start the
revised NM-01 one variation at a time; the old final-Tab-new-row result is superseded.
Original raw/adapted minimal controls preserve legacy keys and have no current
manual table cases. Use the two main candidates for confirmed-policy acceptance.
The native report now embeds the exact manual case catalogue as well as its hash.

NM-09 isolates triple-click text selection from cell selection. The first uploaded
07 report is retained as historical evidence: correct source/build hashes and
passing fixture repetitions, but all manual statuses not-run and no attempts.
An initial Capture API not ready entry is not proof that later capture is broken;
verify a fresh manual mark and capture after load. Keep conversation reports distinct.
