# R07 first-slice findings

Date: 2026-11-14. Candidate R07-PM-LOCAL-01. Exploratory Linux/Chromium evidence,
not architecture acceptance. The existing editor was not used or modified.

## Blocking observation 1: history depends on input granularity

Start `Alpha beta`. A inserts `abcd` as one text transaction. B inserts `FOREIGN`
between `ab` and `cd`. Both contexts converge to `abFOREIGNcdAlpha beta`.
Raw context A undo produces `Alpha beta`: it removes B's contribution too.
The core diagnostic preserves this exact result; it passes only as a reproduction
of a failed product requirement, not as an acceptance test.

A separate guard candidate refuses the unsafe inverse and retains the complete
current state. Granular character-by-character browser input can instead produce
inverses that preserve `FOREIGN`; that route passes independently. Keyboard input,
paste/batched insertion and composition must not be treated as equivalent tests.

The guard checks replayed position provenance, and conservatively refuses opaque
foreign formatting/attribute changes. It is not a complete semantic undo design,
not optimized, and not justification to select this architecture. It is a bounded
proof that unsafe inverses can be refused without collateral deletion. A final
solution must qualify origin semantics, useful history UX and performance.

## Blocking observation 2: immediate last-cell navigation

Click inside the final table cell `Four`; press End, immediately Tab, then type.
BR-14 expects exactly one new row and typing in its first cell. It observes two
rows instead. The keydown trace has native text `Four`, offset 4, but engine
selection `from=1` for both End and Tab. Native caret and editor model are briefly
inconsistent at the command boundary. This is not acceptable keyboard behaviour.

CT-01 repeats the failure with the same schema/table command in one raw editor,
without authority, collab plugin or client backup. This narrows the cause beyond
our multi-view coordination but does not prove a universal upstream defect or its
root cause. A diagnostic pause between input steps made a separate probe work;
we did not add that pause to the qualification test. Keep this case red until an
actual fix or a different candidate satisfies it on real input paths.

## What this run establishes

The bounded Node suite checks mapped selections and concurrent input, disjoint
context undo, guarded unsafe undo/redo, stale admission, duplicate receipts across
restart, task-title/body preservation, table edits and real filesystem checkpoint/
rescue handling. CLI/MCP run in subprocesses against one marked synthetic store.
Live-owner exclusion and a SIGKILL after acknowledged publication are exercised;
the leftover lock fails closed. This is not safe takeover or power-failure proof.

The browser checks exercise pointer/key input, backward selection, focused history,
table click/type and redo, toolbar focus, shared-API updates, close/reopen, failed
save protection, read-only embed content and delayed delivery. These checks use
browser input automation and synthetic fixtures, not native OS services. Browser
and Node stores are different adapters; no live IPC from CLI into the browser exists.

## Unqualified scope and next experiment

No macOS/WKWebView/IME/VoiceOver/native-menu run, Windows/provider qualification,
performance benchmark, full task-page/lifecycle/media support, schema migration,
secure IPC/grants, broker election or production replacement was performed.
Original embed navigation is explicitly unsupported. Interactive history across
host restart is not implemented; content/receipts and protected input are separate.
R02's complete 72-case catalogue is not marked passed from these partial probes.

Next: isolate the immediate cell-selection/keydown failure with minimized source
and a genuine fix/control comparison, or compare another clean editor candidate.
Keep raw versus guarded history results separate. Then bring viable candidates
into a packaged macOS harness for native input evidence before architecture review.
Do not rebuild production, hide the failing tests or choose by current investment.
