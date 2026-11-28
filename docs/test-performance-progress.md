# Vitest worker tuning — progress

## Preflight — 2026-11-28

Owner approved forks with eight workers, unchanged coverage and regression rules, and resumption of the architecture simplification. Isolated branch from development 352fe0e8af229ef29469970e49b28b4274cda9da; main bb181321 unchanged. Post-migration test infrastructure configuration only, outside the twelve production subsystems. No new public API, owning facade, write path, dependency, concurrency surface, product behaviour, or specification change. Existing Vite test configuration owns runner policy; preserve environment, include, setupFiles, isolation and default timeouts, all existing assertions, scripts and CI gates. Architecture rule 14 and implementation rulebook §§1–4/7 apply; production subsystem-specific checks not applicable.

Owner's hardware: 14 logical CPUs, 48 GiB RAM. Supplied logs (checkout SHA and CLI header truncated, so worker labels inferred from preceding requested commands):
- Earlier default: 17,999/17,999 tests, 967 files, 322.43s; potential overlap with next run, not a controlled baseline.
- Threads: 17,950 passed, 7 failed, 42 skipped, 7 failed files, 240.00s; timezone assertions and source-scanning timeouts; rejected.
- Forks 8: 17,999/17,999, 967 files, 220.47s.
- Forks 10: same counts, 217.58s.
- Forks 12: same counts, 213.28s.
Single runs, not a statistical benchmark; eight workers selected for modest system headroom, not fastest observed. Fixed eight is a repository-wide default, including CI unless overridden by CLI; performance on smaller machines unmeasured. No test changes. Full default-command regression and build on exact candidate required to verify configuration; native behaviour unaffected by test-only options, native gate not applicable to this change. Pending sidebar candidates remain isolated; full verification and explicit promotion approval still required. Expected development baseline 17,998 based on independent suites, not observed combined count; do not attribute the 17,999 benchmark to exact SHA without confirmation.
