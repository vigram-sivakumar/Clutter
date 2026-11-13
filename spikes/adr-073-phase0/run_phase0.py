#!/usr/bin/env python3
"""Run the isolated macOS coordination subset. Success is never a completed Phase 0 gate."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
import zipfile


# Minimum test counts prevent a filtered/empty suite from being reported as success.
REQUIRED_MODULES = {
    "smoke": 1, "e1_serialized": 3, "e2_durability": 7,
    "e3_recovery": 6, "e4_claims": 4, "e5_conflicts": 5,
    "e6_notices": 4, "e7_notifications": 2, "e9_legacy": 4,
}
PENDING_GATES = [
    "E4 provisioning ledger and late in-flight native writes",
    "E5 complete conflict matrix at the specified stress scale",
    "E7 real frontend reconciliation timers and Tauri event loss",
    "E8 live recovery discovery and backward-compatible recovery records",
    "E10 native rename destination claims",
    "E11 real unflushable-window transition and retry",
    "E12 development, packaged and sandboxed WKWebView/platform matrix",
]


def collect_coverage(listing):
    names = [line.removesuffix(": test") for line in listing.splitlines()
             if line.startswith("experiments::") and line.endswith(": test")]
    counts = {module: sum(name.startswith(f"experiments::{module}::") for name in names)
              for module in REQUIRED_MODULES}
    missing = [module for module, minimum in REQUIRED_MODULES.items() if counts[module] < minimum]
    return {"counts": counts, "missing_modules": missing, "native_tests": len(names)}


def outcome(profile, code, coverage):
    passed = code == 0 and not coverage["missing_modules"]
    return {
        "profile": profile, "native_subset_passed": passed,
        "scope": "E2 durability and 500-cycle crash subset" if profile == "crash" else "implemented coordination subset",
        "phase0_complete": False, "native_window_matrix_passed": False,
        "pending_gates": PENDING_GATES, "coverage": coverage,
        # Full is a gate attempt: even a passing subset must fail closed while required coverage is missing.
        "exit_code": code if code else (2 if profile == "full" or not passed else 0),
    }


def worker_from_build(log):
    for line in log.splitlines():
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if isinstance(item, dict) and item.get("reason") == "compiler-artifact" and item.get("target", {}).get("name") == "crash_worker" and item.get("executable"):
            return Path(item["executable"])
    return None


def execution_passed(profile, log):
    results = re.findall(r"test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;", log)
    if not results:
        return False
    passed, failed, ignored = map(int, results[-1])
    minimum = REQUIRED_MODULES["e2_durability"] if profile == "crash" else sum(REQUIRED_MODULES.values()) - (3 if profile == "quick" else 0)
    return passed >= minimum and failed == 0 and (profile == "quick" or ignored == 0)


def run_logged(command, log_path, env, timeout):
    print(f"Running {' '.join(map(str, command))}\nLog: {log_path}", flush=True)
    with log_path.open("w") as log:
        child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
        try:
            return child.wait(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
            log.write("\nRunner interrupted or timed out; the native subset did not pass.\n")
            return 124


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=["quick", "full", "crash"], default="quick")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if sys.platform != "darwin":
        print("Native coordination checks require macOS. Portable checks: cargo test --manifest-path spikes/adr-073-phase0/Cargo.toml --lib model::tests", file=sys.stderr)
        return 2
    if not shutil.which("cargo") or not shutil.which("rustc"):
        print("Install the Rust toolchain and Xcode Command Line Tools before running these checks.", file=sys.stderr)
        return 2

    root = Path(__file__).resolve().parents[2]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = (args.output or root / "packages/automation/reports/adr073-phase0" / f"{stamp}-{os.getpid()}").resolve()
    output.mkdir(parents=True, exist_ok=False)
    scratch = output / "scratch"
    scratch.mkdir()
    env = {**os.environ, "TMPDIR": str(scratch), "RUST_BACKTRACE": "1"}
    if args.profile in ("full", "crash"):
        # The ADR requires at least 500 kills; inherited developer overrides must not weaken the gate.
        env["E2_KILLS"] = "500"
    manifest = root / "spikes/adr-073-phase0/Cargo.toml"
    base = ["cargo", "test", "--locked", "--manifest-path", str(manifest), "--release", "--lib"]
    metadata = {"platform": platform.platform(), "macos": platform.mac_ver()[0], "machine": platform.machine(), "timestamp_utc": stamp}
    for name, command in {
        "rustc": ["rustc", "-Vv"], "cargo": ["cargo", "--version"],
        "commit": ["git", "-C", str(root), "rev-parse", "HEAD"],
        "working_tree": ["git", "-C", str(root), "status", "--short"],
    }.items():
        completed = subprocess.run(command, capture_output=True, text=True, timeout=20)
        metadata[name] = {"exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr}
    (output / "environment.json").write_text(json.dumps(metadata, indent=2))

    coverage = {"counts": {}, "missing_modules": list(REQUIRED_MODULES), "native_tests": 0}
    started = time.monotonic()
    timeout = 900 if args.profile == "quick" else 7200
    code = run_logged(["cargo", "build", "--locked", "--manifest-path", str(manifest), "--release", "--bin", "crash_worker", "--message-format=json"], output / "build.log", env, timeout)
    if code == 0:
        worker = worker_from_build((output / "build.log").read_text())
        if worker is None or not worker.is_file():
            print("Cargo did not produce the required crash_worker executable.", file=sys.stderr)
            code = 2
        else:
            env["ADR073_CRASH_WORKER"] = str(worker)
    if code == 0:
        code = run_logged(base + ["--", "--list"], output / "list.log", env, timeout)
    if code == 0:
        coverage = collect_coverage((output / "list.log").read_text())
        if coverage["missing_modules"]:
            print(f"Missing expected test coverage: {coverage['missing_modules']}", file=sys.stderr)
            code = 2
    if code == 0:
        # Filter out atomic_replace's separate destructive/volume-specific ignored tests.
        # --include-ignored is restricted to experiments::; it enables the 15,000-intent and kill stress runs.
        test_filter = "experiments::e2_durability::" if args.profile == "crash" else "experiments::"
        command = base + [test_filter, "--", "--nocapture", "--test-threads=1"]
        if args.profile in ("full", "crash"):
            command.append("--include-ignored")
        code = run_logged(command, output / "tests.log", env, timeout)
        if code == 0 and not execution_passed(args.profile, (output / "tests.log").read_text()):
            print("The native test run did not execute the required minimum; it cannot pass.", file=sys.stderr)
            code = 2
    summary = outcome(args.profile, code, coverage)
    summary["duration_seconds"] = round(time.monotonic() - started, 2)
    (output / "summary.json").write_text(json.dumps(summary, indent=2))
    report = output / "phase0-report.zip"
    with zipfile.ZipFile(report, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ["environment.json", "summary.json", "build.log", "list.log", "tests.log"]:
            if (output / name).exists():
                archive.write(output / name, name)
    print(json.dumps(summary, indent=2))
    print(f"Report: {report}\nThis subset cannot establish completed Phase 0 or native multi-window support.")
    return summary["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
