# Existing trace table inspection42

User41 commit41968700: executable alias correction works, all process samples read,
trace gracefully finalizes and exports. Real TOC has79 tables/51 distinct schemas.
The earlier parser expected schema/name elements; actual TOC uses table/schema.
42 supports both, rejects DTD/entity declarations, and fixes the metadata defect.
No new recording is required to examine the saved trace.

```bash
node docs/foundation/runtime-qualification/trace42/export.mjs --capture 2026-11-16T12-25-47-726Z-be47befa
```

Tauri may be closed. Reads the saved report/TOC/trace only, verifies source binding
and hashes report/TOC, writes new Git-internal derived output. No app/owner/Space,
endpoint/token, native probe compile, permission change, recording or global install.
Uses existing xcrun xctrace export and /usr/bin/python3 standard-library XML parsing;
missing/unavailable tools are blocked, never silently installed.

Exports three fixed schema selections from run1: process-info, hitches-frame-
lifetimes, displayed-surfaces-interval. Each export is bounded15s/4MiB; each XML
analysis10s. Progress goes to stderr. Failure/size/timeout stays explicit. Original
trace and previous failures untouched. No broad all-table/OS-log dump. Raw selected
XML/OS errors are private local artifacts: do not share blindly. Safe terminal JSON
contains sanitized column mnemonics/types, first3 row SHAPES/numeric texts, typed
process PIDs/reference resolution counts and hashes. It never copies process names,
paths, formatter strings or arbitrary app/user text. XML DTD/entities are rejected.

PID references are resolved only through typed process definitions; generic integer
cells cannot identify a PID. A formatter fallback extracts a numeric trailing PID
only from a typed process element. A row mentioning target UI is not automatically
a producer/ownership relationship. Link-column availability is not proof of parent,
responsible process or coalition attribution. Numeric timestamps keep original text
with NO unit conversion: duration/clock/presentation semantics still need validation.
Empty rows/unresolved refs/lack of columns are not a latency pass.

30 Linux tests pass (6 new +24 regression), including actual Python XML parsing,
reference resolution and names/text suppression; Mac42 export pending. The tests
use a stated structural fixture, not fabricated raw Mac table data. User's observed
schema list is preserved separately. No trace table data/latency/attribution result
is invented before actual export. No repeated editor/manual/native recording tests.

Next inspect returned table structure and actual references/units to decide whether
attribution/presentation evidence is sufficient or which exact field is unavailable.
Shared-page accounting, actual input correlation, frozen HP fixtures/environment
and equivalent Electron comparison remain requirements. No meaningful host winner
from these diagnostic samples alone. Core/shared UI/platform contracts unchanged.
