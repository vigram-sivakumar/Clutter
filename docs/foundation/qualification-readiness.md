# Qualification readiness and first experiment — R06

Revision 0.9, 2026-11-14. R06 specification prepared; experimental configuration
and acceptance are not yet ready. No target editor/host/storage/provider was built
or tested. Do not confuse preparing this pack with executing its catalogues.

## Actual evidence and availability

| Item                      | Observed state                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Repository baseline       | Foundation branch at f22a5cd; working foundation drafts preserved                                                |
| User delivery             | User reported the R05 patch done; this is application confirmation, not verified remote commit/push              |
| Remote check              | Branch still f22a5cd; main observed at c6d8d6b on 2026-11-14; no pull/merge/reset or production update performed |
| Host                      | Linux, Node v24.22.1, Python 3.12.14; not a native macOS test environment                                        |
| New evidence              | Static document/JSON/reference and patch checks only; no new core/browser/native/security/provider execution     |
| macOS hardware/runtime    | Not available in this environment; actual WKWebView, IME, VoiceOver and packaging results blocked                |
| Windows/provider accounts | No actual qualification, accounts, grants or signing configuration                                               |

[Candidate template](qualification-candidate-template.json) contains null fields
on purpose. Its repository-observed versions are provenance only, not a mandated
stack or a ready experimental configuration. Replacing every current dependency is
allowed. Do not call a candidate reproducible until its own actual lockfile, schema,
extensions/keymaps/history and packaged runtime are supplied.

[Static check evidence](evidence/r06-2026-11-14.json) records the bounded R06 checks;
it is separate from target runtime evidence.

## First R07 scope: prove editing and local coordination early

Build an isolated disposable experiment under the same branch only when R07 work is
authorized. Keep production untouched. Start with one clean structured candidate;
include another eligible architecture when it can answer a concrete comparison.
Existing Markdown/editor code is not required as a candidate or compatibility target.
Pin verified dependencies with integrity/source identities and check current relevant
advisories before installing; do not run the template as a dependency manifest.

The first slice uses W-SMALL and R02 semantic fixtures. Required initial cases:
EI-001–EI-003, EI-010, EI-014–EI-017, EI-025–EI-027, EI-029–EI-033, EI-034,
EI-040, EI-045 and EI-050–EI-052. Add EP-03, EP-08, EP-09 and EP-14. This is an
experiment subset, not a replacement for full T-01/T-02/T-03 qualification.

1. Map fixture identities to candidate schema and specify one command/history path.
   Implement two views on one accepted document with local selections/provisional
   input; no separate document copies as a synchronisation shortcut.
2. Alternate and overlap edits from both views, then exercise context undo/redo and
   a local CLI/MCP-equivalent command through the shared API. Record refused/mapped
   overlapping edits and protect pending input. Core intent injection at this stage
   is not evidence that CLI/MCP transports or native commands work.
3. Close one view, inject a failed save, restart the owner and query the uncertain
   operation. Compare protected input, durable body, identities and history.
4. Bring the same composition into packaged macOS; run immediate click/type table,
   near-focus selection, composition and native undo/menu routes. Report blocked if
   no Mac is available. Do not select an editor from Linux-only results.
5. Expand to all shared seed/timing probes, the reviewed structured/source profile,
   HQ process/security and PF storage faults, then typical/large workloads. Run
   native/accessibility/manual text-service probes with reproducible records.

Freeze concrete profile outcomes only for the experimental run. Q-01–Q-09 remain
product-review gates; an exploratory result does not silently approve them. A
required unsupported feature is a capability gap. Do not hide unresolved selective
undo behind a library history default.

## Coherent provider reconciliation proof obligation

SY-04 is separate from native editor feasibility. Compare the R05 alternatives with
an explicit reference state/ownership model. At minimum enumerate two replicas,
three notes, two tasks and histories of up to four operations including move,
note delete/restore and repeat completion; enumerate legal causality-preserving
delivery orders, duplicates and partition/rejoin schedules. Extend with seeded
longer histories. Record exact generator version and minimized failing traces.

Assert convergence, exactly one placement per surviving task, coherent note/task
body/history closure, retry-safe occurrence generation, tombstone safety and
preservation of edits to unrelated notes. Show expected outcomes for each chosen
policy before using it as an oracle. Try concurrent moves, delete-versus-move and
restore-of-a-moved-task first (SC-16–SC-19). Pending invalid packages are failure
containment, not proof of a usable resolution algorithm. Do not select whole-Space
latest-wins to make single-placement assertions pass. Real providers follow only
after the protocol algorithm and local durability properties are demonstrated.

## Entry and exit gates

| Stage                   | Entry / result needed                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exploratory R07 coding  | Concrete scoped fixture/oracle, candidate dependency/source lock, explicit unresolved policies and bounded disposable harness; no production switch |
| Native comparison       | Exact packaged build, OS/hardware/input-source/keymap, permissions, text services and event/artifact capture available                              |
| Binding acceptance      | Relevant product profiles approved, M/PS/PL/SEC gaps resolved for scope, complete required-case expansion and executable evidence                   |
| Provider enablement     | SY gaps resolved for route, coherent ownership proof, durable losing history and independent real-provider evidence                                 |
| Architecture acceptance | R08 evidence review, explicit accepted/superseding ADRs and affected current rules identified                                                       |

Remaining Q/M/PS/SY/PL/SEC decisions do not block every independent experiment.
They do block unqualified claims of complete architecture or release readiness.
Next step is R07 experiment preparation and execution within an explicitly scoped
isolated harness; do not write more broad product discovery or choose by sunk cost.

## R07 first-slice evidence

The above is the historical R06 entry record. [R07 evidence](evidence/r07-2026-11-14.json)
now records a bounded runnable slice and real Linux observations. [Findings](experiments/r07-two-view/findings.md)
block selection. Runtime evidence does not retrospectively qualify omitted native,
security, task-page/media or provider scope.

Revision 0.37 follow-up: [bounded durable-owner proof](r07-durable-authority.md)
passes18 separate Linux cases. Current next action is the R08 review package in
[START-HERE](START-HERE.md), including explicit joined-editor/native gates; earlier
results and open full-scope requirements above remain unchanged.
