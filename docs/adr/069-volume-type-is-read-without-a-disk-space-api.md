# ADR-069: The volume's type is read without a disk-space API

**Status: Accepted** (2026-11-06). Narrowly amends [ADR-063](./063-atomic-vault-saves.md): the safety check that refuses a volume other than APFS is unchanged; only the call that reads the volume's type name changes. No new subsystem, write path or dependency (two more features of `objc2-foundation`, already a dependency).

## Context

ADR-063 reads the destination directory's filesystem type with `fstatfs` and refuses anything that is not on `SUPPORTED_FILESYSTEMS` (`["apfs"]`). `fstatfs` is one of the APIs Apple requires an app to declare in its privacy manifest under `NSPrivacyAccessedAPICategoryDiskSpace`, and App Store Connect refuses an upload whose executable imports one without a declared reason.

Apple's current reasons for that category (read from Apple's documentation data, 2026-11-06) are: display disk space to the person (`85F4.1`), check whether there is sufficient disk space to write files or whether space is low enough to delete files, where the app behaves differently in a way users can observe (`E174.1`), include disk space in a bug report the user chooses to submit (`7D9E.1`), and health research (`B728.1`). Clutter reads only the `f_fstypename` field. It does not read free or total space and does not behave differently on it, so none of the four reasons describes the use, and declaring one would be inaccurate.

## Decision

1. `volume_type` (`atomic_replace.rs`), the single place a volume's type is read, asks the system for the volume's type-name resource value (`NSURLVolumeTypeNameKey`) of the resolved directory. The value is the same string `statfs` reports in `f_fstypename`. Compared on APFS, HFS+, exFAT and FAT32 volumes (disk images) and on the system volumes, the two agreed in every case (`apfs`, `hfs`, `exfat`, `msdos`).
2. The behavior around it is unchanged: the directory is opened first, so a missing or unreadable directory fails with the same error as before (`VolumeProbeError::Open`); a probe failure is `VolumeProbeError::Stat`; the supported list, the refusal (`UnsupportedFilesystem`) and the Space picker's early check (`check_space_filesystem`) still call the same function against the same list.
3. `fstatfs` and its `Statfs` layout remain in the test build only, as an independent oracle: a test asserts `volume_type` equals what `fstatfs` reports for several directories and for a link, and the existing tests keep their expectations. The shipped executable no longer imports `fstatfs`, `statfs`, `statvfs`, `fstatvfs` or `getattrlist`; `scripts/verify-bundle.sh` fails a bundle that does, unless the manifest declares the category.
4. The privacy manifest therefore declares file timestamps only, not disk space.

## Consequences

- The probe is path-based after the directory is opened, where `fstatfs` was bound to the open descriptor. The later steps of a save are path-based in the same canonical parent, so no new window opens in practice; it is noted here because ADR-063 prized descriptor-based checks.
- The Intel (`$INODE64`) path of the old call is gone with it.
- Not verified: the lookup inside a sandboxed, signed build (it reads only the volume's type of a folder the user granted), and on an external volume that is mounted while the app runs. Both are on the release checklist.
- If a future feature really shows or checks disk space, it declares `85F4.1` or `E174.1` at that time.

## Alternatives considered

- **Declare `E174.1` anyway**: rejected; the app does not check space or change behavior on it, so the declaration would be false.
- **`getfsstat` / `getmntinfo` and match the mount**: rejected; it returns the same disk-space structure, only avoids Apple's list by name, and needs mount matching across firmlinks.
- **Leave it undeclared**: rejected; the upload is refused.
- **`getattrlist` volume attributes**: rejected; `getattrlist` is on the same disk-space list.
