# Clutter — mandatory instructions for all AI agents

These instructions apply across this repository, including ChatGPT, Codex, Claude, Cursor, Copilot and any other coding agent. They are standing project rules, not optional guidance. More specific instructions may add constraints but must not weaken the regression gate.

## Before any implementation

Read [docs/implementation-rules.md](docs/implementation-rules.md) in full, especially [§7: mandatory architecture and regression gate](docs/implementation-rules.md#7-mandatory-architecture-and-regression-gate-all-contributors-and-ai-agents). Also read [ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md), the relevant sections of [docs/architecture-specification.md](docs/architecture-specification.md), [docs/architecture-compliance-checklist.md](docs/architecture-compliance-checklist.md), and [CLAUDE.md](CLAUDE.md) for existing permanent project constraints (they apply regardless of agent name).

For Markdown editor work, read [docs/editor-architecture-decisions.md](docs/editor-architecture-decisions.md); for tables, also read [docs/table-rewrite-progress.md](docs/table-rewrite-progress.md) and verify its historical baseline against the current branch.

## Non-negotiable workflow

1. Identify the root cause and record the baseline.
2. Check the owning subsystem, architecture contracts, interaction dependencies and existing behaviour. State what will not change.
3. Make the smallest correct fix in the existing owner; add regression coverage.
4. Review the final diff, run type/build checks and the complete affected regression suite. For editor/table runtime changes, also run `npm run test:run`.
5. Verify actual native WebKit/Tauri behaviour when layout, focus, pointer, keyboard, clipboard, IME or selection rendering is affected.
6. Only after all required checks pass, commit/push the verified milestone and report the actual evidence and commit hash.

A failed or unavailable check is a blocker. Do not commit or push an unverified runtime candidate, falsely report a pass, skip tests, weaken tests, or bypass the rule through a remote file-editing API. Provide an uncommitted candidate or patch and disclose what remains to be verified. The same rule applies to CSS and small fixes. Documentation-only changes require a reviewed, consistent diff but not unrelated runtime tests.

Do not start new table enhancements until the stability checkpoint required by §7 is verified. Preserve the existing architecture rather than adding a new engine or selection owner. Follow the owner's branch and release instructions; merging to main requires the owner's approval.
