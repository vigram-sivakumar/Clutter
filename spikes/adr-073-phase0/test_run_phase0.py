import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run_phase0


class RunnerContracts(unittest.TestCase):
    def complete_listing(self):
        return "\n".join(f"experiments::{module}::case_{n}: test"
                         for module, count in run_phase0.REQUIRED_MODULES.items() for n in range(count))

    def test_empty_or_wrong_filter_cannot_pass(self):
        for listing in ["", "model::tests::one: test", "0 tests, 0 benchmarks"]:
            coverage = run_phase0.collect_coverage(listing)
            self.assertFalse(run_phase0.outcome("quick", 0, coverage)["native_subset_passed"])
            self.assertNotEqual(run_phase0.outcome("quick", 0, coverage)["exit_code"], 0)

    def test_missing_module_is_reported(self):
        listing = "\n".join(line for line in self.complete_listing().splitlines() if "e3_recovery" not in line)
        self.assertEqual(run_phase0.collect_coverage(listing)["missing_modules"], ["e3_recovery"])

    def test_quick_success_is_explicitly_only_a_subset(self):
        summary = run_phase0.outcome("quick", 0, run_phase0.collect_coverage(self.complete_listing()))
        self.assertTrue(summary["native_subset_passed"])
        self.assertFalse(summary["phase0_complete"])
        self.assertFalse(summary["native_window_matrix_passed"])
        self.assertEqual(summary["exit_code"], 0)

    def test_full_cannot_pass_phase0_with_known_missing_gates(self):
        summary = run_phase0.outcome("full", 0, run_phase0.collect_coverage(self.complete_listing()))
        self.assertTrue(summary["native_subset_passed"])
        self.assertEqual(summary["exit_code"], 2)
        self.assertTrue(summary["pending_gates"])

    def test_native_failure_remains_a_failure(self):
        summary = run_phase0.outcome("quick", 101, run_phase0.collect_coverage(self.complete_listing()))
        self.assertFalse(summary["native_subset_passed"])
        self.assertEqual(summary["exit_code"], 101)

    def test_wrong_host_never_invokes_native_commands(self):
        with patch.object(run_phase0.sys, "platform", "linux"), patch.object(run_phase0.subprocess, "Popen") as popen:
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(run_phase0.main([]), 2)
            popen.assert_not_called()

    def test_worker_path_comes_from_cargo_instead_of_guessing_the_target_directory(self):
        log = 'warning: ignored\n{"reason":"compiler-artifact","target":{"name":"crash_worker"},"executable":"/custom/target/release/crash_worker"}'
        self.assertEqual(run_phase0.worker_from_build(log), Path("/custom/target/release/crash_worker"))
        self.assertIsNone(run_phase0.worker_from_build("Finished build without an artifact"))
        self.assertIsNone(run_phase0.worker_from_build("[]"))

    def test_successful_exit_with_zero_executed_tests_cannot_pass(self):
        for log in ["", "test result: ok. 0 passed; 0 failed; 36 ignored; 0 measured; 0 filtered out;"]:
            self.assertFalse(run_phase0.execution_passed("quick", log))
            self.assertFalse(run_phase0.execution_passed("full", log))

    def test_full_profile_requires_the_long_tests_to_actually_run(self):
        quick = "test result: ok. 33 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out;"
        full = "test result: ok. 36 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out;"
        self.assertTrue(run_phase0.execution_passed("quick", quick))
        self.assertFalse(run_phase0.execution_passed("full", quick))
        self.assertTrue(run_phase0.execution_passed("full", full))

    def test_crash_profile_requires_all_e2_tests_and_is_not_a_full_gate(self):
        self.assertTrue(run_phase0.execution_passed("crash", "test result: ok. 7 passed; 0 failed; 0 ignored;"))
        self.assertFalse(run_phase0.execution_passed("crash", "test result: ok. 6 passed; 0 failed; 1 ignored;"))
        summary = run_phase0.outcome("crash", 0, run_phase0.collect_coverage(self.complete_listing()))
        self.assertEqual(summary["exit_code"], 0)
        self.assertIn("E2", summary["scope"])
        self.assertFalse(summary["phase0_complete"])

    def test_a_timed_out_process_is_stopped_and_never_reported_as_a_pass(self):
        with tempfile.TemporaryDirectory() as temporary, contextlib.redirect_stdout(io.StringIO()):
            log = Path(temporary) / "timeout.log"
            code = run_phase0.run_logged([sys.executable, "-c", "import time; time.sleep(2)"], log, os.environ.copy(), 0.05)
            self.assertEqual(code, 124)
            self.assertIn("did not pass", log.read_text())


if __name__ == "__main__":
    unittest.main()
