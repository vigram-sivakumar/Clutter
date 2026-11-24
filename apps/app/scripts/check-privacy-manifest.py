#!/usr/bin/env python3
"""Checks Clutter's privacy manifest, and (given a built executable) that it matches what the executable uses.

usage: check-privacy-manifest.py <PrivacyInfo.xcprivacy> [<executable>]

Structure: every key, data type, purpose, API category and reason code must be one Apple defines. The lists below were
read from Apple's documentation data for NSPrivacyAccessedAPIType, NSPrivacyAccessedAPITypeReasons,
NSPrivacyCollectedDataType and NSPrivacyCollectedDataTypePurposes on 2026-11-06; update them when Apple changes them.

Executable (optional): the required-reason APIs Apple lists (file timestamps, disk space, system boot time) are looked
for among the executable's imported symbols and strings. A category used but not declared fails (App Store Connect
refuses the upload); a category declared but not used also fails (no speculative declarations).
Exit 0 when everything passes, 1 otherwise.
"""
import plistlib
import re
import subprocess
import sys

REASONS = {
    "NSPrivacyAccessedAPICategoryFileTimestamp": {"DDA9.1", "C617.1", "3B52.1", "0A2A.1"},
    "NSPrivacyAccessedAPICategorySystemBootTime": {"35F9.1", "8FFB.1", "3D61.1"},
    "NSPrivacyAccessedAPICategoryDiskSpace": {"85F4.1", "E174.1", "7D9E.1", "B728.1"},
    "NSPrivacyAccessedAPICategoryActiveKeyboards": {"3EC4.1", "54BD.1"},
    "NSPrivacyAccessedAPICategoryUserDefaults": {"CA92.1", "1C8F.1", "C56D.1", "AC6B.1"},
}
DATA_TYPES = {
    "NSPrivacyCollectedDataType" + name
    for name in (
        "AdvertisingData AudioData BrowsingHistory CoarseLocation Contacts CrashData CreditInfo CustomerSupport "
        "DeviceID EmailAddress EmailsOrTextMessages EnvironmentScanning Fitness GameplayContent Hands Head Health "
        "Name OtherDataTypes OtherDiagnosticData OtherFinancialInfo OtherUsageData OtherUserContactInfo "
        "OtherUserContent PaymentInfo PerformanceData PhoneNumber PhotosorVideos PhysicalAddress PreciseLocation "
        "ProductInteraction PurchaseHistory SearchHistory SensitiveInfo UserID"
    ).split()
}
PURPOSES = {
    "NSPrivacyCollectedDataTypePurpose" + name
    for name in "Analytics AppFunctionality DeveloperAdvertising Other ProductPersonalization ThirdPartyAdvertising".split()
}
TOP_KEYS = {"NSPrivacyTracking", "NSPrivacyTrackingDomains", "NSPrivacyCollectedDataTypes", "NSPrivacyAccessedAPITypes"}

# Imported symbols (leading underscore and any `$...` suffix removed) that put an API category in force.
SYMBOLS = {
    "NSPrivacyAccessedAPICategoryFileTimestamp": {
        "stat", "fstat", "lstat", "fstatat", "getattrlist", "fgetattrlist", "getattrlistbulk", "getattrlistat",
    },
    "NSPrivacyAccessedAPICategoryDiskSpace": {
        "statfs", "fstatfs", "statvfs", "fstatvfs", "getattrlist", "fgetattrlist", "getattrlistat",
    },
    "NSPrivacyAccessedAPICategorySystemBootTime": {"mach_absolute_time"},
}
# Strings that put a category in force (Objective-C and Swift API names Apple lists).
STRINGS = {
    "NSPrivacyAccessedAPICategorySystemBootTime": [b"systemUptime"],
    "NSPrivacyAccessedAPICategoryDiskSpace": [
        b"NSURLVolumeAvailableCapacity", b"NSURLVolumeTotalCapacityKey", b"NSFileSystemFreeSize", b"NSFileSystemSize",
    ],
    "NSPrivacyAccessedAPICategoryUserDefaults": [b"NSUserDefaults", b"CFPreferencesCopyAppValue"],
    "NSPrivacyAccessedAPICategoryActiveKeyboards": [b"activeInputModes"],
    "NSPrivacyAccessedAPICategoryFileTimestamp": [
        b"NSFileCreationDate", b"NSFileModificationDate", b"NSURLContentModificationDateKey", b"NSURLCreationDateKey",
    ],
}

failed = False


def ok(message):
    print(f"ok:   {message}")


def fail(message):
    global failed
    failed = True
    print(f"FAIL: {message}")


def check_structure(manifest):
    unknown = set(manifest) - TOP_KEYS
    unknown and fail(f"unknown top-level keys: {sorted(unknown)}")
    isinstance(manifest.get("NSPrivacyTracking"), bool) or fail("NSPrivacyTracking must be a boolean")
    domains = manifest.get("NSPrivacyTrackingDomains")
    isinstance(domains, list) or fail("NSPrivacyTrackingDomains must be an array")
    if manifest.get("NSPrivacyTracking") is False and domains:
        fail("tracking domains are listed although NSPrivacyTracking is false")

    for entry in manifest.get("NSPrivacyCollectedDataTypes", []):
        name = entry.get("NSPrivacyCollectedDataType")
        name in DATA_TYPES or fail(f"unknown collected data type {name!r}")
        isinstance(entry.get("NSPrivacyCollectedDataTypeLinked"), bool) or fail(f"{name}: Linked must be a boolean")
        isinstance(entry.get("NSPrivacyCollectedDataTypeTracking"), bool) or fail(f"{name}: Tracking must be a boolean")
        purposes = entry.get("NSPrivacyCollectedDataTypePurposes")
        if not purposes or not set(purposes) <= PURPOSES:
            fail(f"{name}: purposes missing or unknown: {purposes!r}")
        if manifest.get("NSPrivacyTracking") is False and entry.get("NSPrivacyCollectedDataTypeTracking"):
            fail(f"{name}: used for tracking, but NSPrivacyTracking is false")

    seen = set()
    for entry in manifest.get("NSPrivacyAccessedAPITypes", []):
        category = entry.get("NSPrivacyAccessedAPIType")
        reasons = entry.get("NSPrivacyAccessedAPITypeReasons") or []
        if category not in REASONS:
            fail(f"unknown API category {category!r}")
            continue
        category in seen and fail(f"{category} is declared twice")
        seen.add(category)
        if not reasons or not set(reasons) <= REASONS[category]:
            fail(f"{category}: reasons missing or not valid for this category: {reasons!r}")
    return seen


def executable_use(path):
    symbols = set()
    names = subprocess.run(["nm", "-arch", "all", "-u", path], capture_output=True, text=True, check=True).stdout.split()
    for token in names:
        symbols.add(re.sub(r"\$.*$", "", token.lstrip("_")))
    data = open(path, "rb").read()
    used = set()
    for category, wanted in SYMBOLS.items():
        if symbols & wanted:
            used.add(category)
    for category, needles in STRINGS.items():
        if any(needle in data for needle in needles):
            used.add(category)
    return used, symbols


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    with open(sys.argv[1], "rb") as handle:
        manifest = plistlib.load(handle)
    declared = check_structure(manifest)
    not failed and ok("manifest structure: keys, data types, purposes, API categories and reason codes are Apple's")
    if len(sys.argv) > 2:
        used, symbols = executable_use(sys.argv[2])
        for category in sorted(used - declared):
            fail(f"the executable uses {category} APIs but the manifest does not declare them")
        for category in sorted(declared - used):
            fail(f"the manifest declares {category} but the executable shows no use of it (no speculative declarations)")
        if used == declared:
            ok("declared required-reason categories match the executable's imports: " + ", ".join(sorted(c.replace("NSPrivacyAccessedAPICategory", "") for c in used)))
    print("RESULT: " + ("FAIL" if failed else "pass"))
    return 1 if failed else 0


sys.exit(main())
