#!/usr/bin/env python3
"""Portable regression checks for release bundle comparison."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("compare-bundles.py")


class CompareBundlesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.original = Path(self.temp.name) / "Original.app"
        self.copy = Path(self.temp.name) / "Copy.app"
        versions = self.original / "Contents" / "Framework" / "Versions"
        (versions / "B").mkdir(parents=True)
        (versions / "B" / "data").write_bytes(b"original")
        (versions / "Current").symlink_to("B")
        (versions / "B" / "cycle").symlink_to("..")
        (versions / "B" / "missing").symlink_to("not-present")
        shutil.copytree(self.original, self.copy, symlinks=True)
        self.entries = self.copy / "Contents" / "Framework" / "Versions" / "B"

    def run_compare(self):
        return subprocess.run(
            [sys.executable, "-I", str(SCRIPT), str(self.original), str(self.copy)],
            capture_output=True, text=True, timeout=10,
        )

    def assert_rejected(self, message):
        result = self.run_compare()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn(message, result.stderr)

    def test_identical_bytes_and_cyclic_and_dangling_symlinks(self):
        result = self.run_compare()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Verified app bundle bytes and symlink targets", result.stdout)

    def test_changed_file_same_size(self):
        (self.entries / "data").write_bytes(b"modified")
        self.assert_rejected("Bundle file mismatch")

    def test_changed_symlink_target(self):
        link = self.entries / "cycle"
        link.unlink()
        link.symlink_to("../Current/..")
        self.assert_rejected("Bundle symlink mismatch")

    def test_missing_entry(self):
        (self.entries / "missing").unlink()
        self.assert_rejected("Bundle directory entries mismatch")

    def test_extra_entry(self):
        (self.entries / "extra").touch()
        self.assert_rejected("Bundle directory entries mismatch")

    def test_changed_entry_type(self):
        file = self.entries / "data"
        file.unlink()
        file.symlink_to("other")
        self.assert_rejected("Bundle entry type mismatch")


if __name__ == "__main__":
    unittest.main(verbosity=2)
