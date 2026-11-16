# I1b editor integration contract — implementation26

2026-11-16. F009 disposable scope only. This contract precedes implementation26.
The existing production app/save path and main remain untouched.

Extend the same runtime catalogue/PageOperations with editor.open, editor.apply,
editor.protect and editor.recovery. Core composes ephemeral context grants bound
to a trusted peer/page/context; the transport supplies peer identity, never a
request field. Same operation + trusted peer replays its durable outcome before
current-epoch grant checks, so lost acknowledgements survive a service restart.
A different peer cannot replay or retrieve private outcomes/protected work.

Open returns the accepted opaque page root, head/revision, context grant and service
epoch. Raw editor updates may change only the supported body schema, never title,
properties, links or other pages. They must have a known accepted base root and
complete Y dependencies. Validate on that base and on latest canonical state,
then commit once through the existing Vault transaction port. Stale context updates
merge through the engine; semantic full-body API writes keep optimistic guards.

ContextSession owns a provisional replica, pending exact request, generation,
acknowledged base and history lifetime. Views own selection/focus/scroll and can
mount/destroy without destroying the context. Remote updates are outside its undo
origin. Unknown replies retain exact operations; newer typing cannot be cleared by
an older acknowledgement. Notifications are hints; explicit resume/open reconciles
from authoritative roots. Restart/recovery clears interactive history explicitly.

Protection commits an immutable validated draft root plus the pending exact editor
request and generation, separate from accepted page heads. A dirty context closes
only if its current generation is acknowledged or protected successfully. Failed
protection keeps it live. Recovery is explicit, peer-bound and preserves the original
pending request; it never rolls canonical heads back. Protected snapshots remain
retained in this slice; automatic retention/release/GC is not implemented or claimed.

SQLite schema2 is disposable-only, not a production format or automatic migration.
Older I1 temporary stores are refused and left in place. No real vault is admitted.

Use actual ProseMirror EditorViews/Y replicas with the qualified engine/history via
an explicit composition adapter. Runtime modules import no experiments. DOM tests
run in existing locked jsdom; they qualify actual view/model/lifecycle integration,
not browser geometry, native keystrokes, IME, accessibility or Mac flush. Preserve
older keyboard/manual results. New native/browser acceptance remains gated.

Immutable-media API integration remains the next named I1b slice after the editor
route; prior media proofs are not automatically a pass of new runtime modules.

## Explicit protective conflicts

If a foreign structural replacement would hide a locally changed block or delete
foreign work, shared engine/replica admission refuses EDITOR_REBASE_CONFLICT before
mutating the live replica or accepted root. The draft stays visible/protectable.
Recovery against a changed canonical base refuses RECOVERY_CONFLICT unless the
protected root is already current. No silent rebase/overwrite; the immutable
protected snapshot remains available. A full conflict-resolution UI is still gated.
