# Clutter architecture and clean rebuild

Revision0.75,2026-11-17. Branch: architecture/clutter-foundation.

Start with [AGENTS](AGENTS.md), [START-HERE](START-HERE.md), then the active
[clean rebuild plan](rebuild/README.md). Existing layout/global visuals are reference
and candidates; the entire old CM6/Markdown architecture, editor UI and obsolete docs
may be redesigned/deleted. No compatibility or existing-user migration obligation.

F010 accepts Tauri/shared web UI/PM-Y/TypeScript Core/SQLite as implementation direction.
Basic native composition closeout passed; intermittent caret issue remains tracked.
The existing product has not been rebuilt yet. Read-only main reference is5c532f8;
no merge or main source change. Next is reproducible clean product boot/removal plan,
not more host comparison or qualification paperwork.

Confirmed [product contracts](product-contracts.md), [table interactions](table-interaction-contract.md)
and [F010](adr/F010-tauri-implementation-baseline.md) preserve behavior and ownership.
Final native format/security/durability/scale/distribution responsibilities remain
open at appropriate milestones. Older docs/proofs are historical and may be retired
as the new current architecture/product/development index replaces them. They are
not a requirement to preserve old implementation. Never infer a shipping pass.
