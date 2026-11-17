# Resume Clutter work

## Current checkpoint — clean rebuild plan51, 2026-11-17

Bounded composition closeout is sufficient to move on: user PASS for shared edits,
A remount, text Undo/Redo, native close and same-Space reopen. Caret issue occurred
intermittently, is currently unreproduced, and user explicitly asked to move on.
Do not replay the old suite or invent a native caret pass/new fix. Baseline108
runtime tests + strict TS from50 remain scoped evidence, not shipping qualification.
No50 commit hash was supplied; verify actual Git state. Last supplied49 hash6ba91499.

User now authorizes complete deconstruction, including editor UI and documentation:
clean/stable architecture first; keep overall layout intent and useful global UI,
not old controllers or code merely for reuse. The active [clean rebuild plan](rebuild/README.md)
replaces the earlier proposal. It includes target responsibilities, component model,
keep/redesign/delete map, code/docs retirement, staged vertical slices and acceptance.
No existing-user migration or legacy compatibility requirement.

Read-only origin/main fetch succeeded at5c532f8443321c0784cb379a184ed97f13de1820
(2026-11-16 date-mention alignment change). It is the committed UI/behavior reference,
not a merge target. Foundation working branch stayed architecture/clutter-foundation.
Audit: main1080 production JS/TS files +978 test files; foundation1077/974. Static
imports show old app/layout/page/property hosts depend on legacy Core/CM6/platform
code. Buttons/input/dialog/overlay/menu/toast/icons/theme are candidates only.
One missing legacy Reference.css import is noted, not repaired. CSS/runtime/focus
and unpublished local main changes are not proven by this static inventory.

NEXT: apply/commit51 if pending, then export completed native dependency locks using
rebuild/export-native-locks.mjs and provide the ZIP. No new native build/manual test.
Export reads only four dependency files + allowlisted provenance from the successful
Git-internal native build, not session/endpoint/token/store/runtime contents. Native
locks are required to remove the runner's dependence on earlier local build caches
and make R1 independently reproducible. Node24.11 is sufficient for the export.

Then R1: real shared modules/product React entry and selected global visuals,
reproducible locked build, actual Core page query/create/edit flow, coherent old-boot
removal. The minimal Foundation demo is not the final UI or permanent parallel app.
No old Application/Vault façade to keep screens working. All legacy code/docs may
be retired when useful contracts/fixtures/current outcomes are promoted. Git history
is the archive. No main modification, automatic commit/push or user-data deletion.

## Authority

AGENTS owns evergreen working rules; rebuild/README owns the current plan and
retirement sequence; confirmed product contracts/F010 own retained behavior and
mechanism direction until consolidated under the new docs index. Older checkpoint
commands and contradictory legacy wiring instructions are historical. New chat:
provide latest branch/local commits, then read AGENTS + this file + rebuild plan.
