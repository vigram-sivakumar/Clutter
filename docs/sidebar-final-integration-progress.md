# Final sidebar integration and test runner — progress

## 2026-11-28 — isolated combined candidate

Base development/table-editor 352fe0e8af229ef29469970e49b28b4274cda9da. Owner approved all three scopes and requested one combined regression gate rather than redundant separate full-suite runs. Sort focused test 57/57 (15.66s, corrected checkpoint ab906ddc); native Settings focused test 8/8 (1.05s, owner console shows checkout of testing/native-settings-subscription and up-to-date remote); owner subsequently reported "all passed" in response to native Settings checklist and request to confirm sidebar sorting native verification. Interpreted as acceptance of both native checklists; no claim of independent native execution or separate build/complete affected-suite acceptance. Forks eight-worker CLI benchmark passed 17,999/17,999 in 220.47s, but transcript lacked exact SHA; configured runner not independently verified. Earlier archive readOnly failure passed focused rerun; combined full run still required.

Source checkpoints:
- Sort b2ee9ea5ca0591903bee29bf47deb2a11c80bbfb
- Settings 9be1a0ee28636c70cae21a12dfa5c20ea63e0db6
- Runner 79a0a533b5c1c5a6e2524daf3042622cbcd66c1c

PRs #19 and #20 merged exclusively into testing/sidebar-final-integration. Runtime/test/config tree 805b60a552667056719c32cb736bcc7dcccf4700. All three checkpoints ancestors; exact union of eight changed paths against development; each of eight blobs verified identical to owning source. No conflict resolution or new runtime edits. All original architecture constraints and coverage retained. This remains an unverified isolated candidate under rulebook §7, not a shared milestone. Combined full app suite covers affected subsystem suites, so no duplicate targeted run required; build and full regression still mandatory. Use standard npm run test:run with no override to exercise the configuration. Confirm native behaviours together on this revision, including menu availability, sorting across sidebar and collection, persistence and manual drag ordering. No native requirement for test-only configuration itself. Record exact SHA, counts, errors and duration, plus build and native outcome; obtain explicit promotion approval before fast-forward to development/table-editor. Main and release unchanged; Phase 2 audit follows acceptance.
