# Confirmed greenfield scope

User clarification, 2026-11-16: Clutter has no existing users and no existing user
or application data that this rebuild must migrate. This is the current scope,
superseding earlier active-roadmap migration/cutover blockers.

- No legacy-vault converter, user/account migration, staged user rollout, dual-write
  period, compatibility facade or old format/API preservation is required for launch.
- Select the clean target architecture freely; old implementation and experimental
  schemas are evidence, not compatibility constraints. No effort/migration score
  should preserve an inferior component or add an unnecessary fallback.
- Define a sound INITIAL format/codec/schema and one canonical write path. Keep
  version envelopes, validation and safe unknown-format refusal. Future app/schema
  upgrades need a design seam, not an implementation project to move nonexistent
  current users/data. Build upgrade conversion only when an actual supported format
  transition is introduced.
- Backup/recovery, version history, retention, export/import and crash-safe writes
  remain product/reliability requirements. Generic import/export is portability,
  not mandatory conversion of the current app's notes into the new architecture.
- Installed runtime/security/lifecycle, native durability, representative budgets
  and correct feature contracts still need qualification. No old/new data cutover
  or production rollback migration gate is added to that work.

This scope clarification does not change the native build/measurement cases,
framework pins or artifact bytes. Frozen H01-v1 and prior evidence remain historical
and hash-stable after the successful completed build36; their references to migrating
existing vaults are superseded by this user-directed scope. No candidate rebuild is
needed merely to update this planning requirement. Future software-update/version-
skew checks still protect new users after first release; they are not user migration.

Preserve existing repository work, raw evidence and old qualification artifacts as
instructed. Greenfield scope is not an instruction to delete files or alter main.
