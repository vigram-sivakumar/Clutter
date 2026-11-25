# Clutter direct-update signing key: backup and recovery

Private maintainer runbook. Keep in the private source repository, not on the public policy site or in distributed application resources.

## Status

On 25 November 2026, the release owner reported successful encrypted offline backup and isolated recovery on a personal Mac. The read-only restore matched the published public key, produced a signature that independently verified on a disposable file, removed the temporary Keychain entry and ejected the encrypted image. The production identity was preserved. The portable drill used a unique temporary account label. The replacement-machine procedure below retains the production account label for an intentional migration.

## What to keep

- Primary signing key in the release user's macOS login Keychain.
- Encrypted, unmounted read/write DMG containing the exported key, preferably with independent offline and off-site copies. No ZIP or additional encryption is necessary if the image is already encrypted with a strong password. Keep the password separately in a password manager; never store it with the image.
- This runbook and the existing release tooling. The DMG is a backup of the Sparkle key, not the entire development environment, Cloudflare credentials, Apple certificates or user data.

Do not commit or upload the raw private key, include it in a transfer kit, display its contents, or paste it into a chat. An encrypted image can be copied to restricted personal cloud storage if permitted by applicable device/organization policies. Unmount before copying; compare SHA-256 of the encrypted images locally to check copy integrity. Keep the production account and pin unchanged.

## Recovery on a replacement Mac

These instructions do not depend on the original machine, its temporary drill script or the external drive's volume name.

### 1. Prepare trusted tools while online

Use a fresh macOS login on a compatible Mac with Xcode command-line tools, Git and the normal Clutter build prerequisites. Clone the trusted private repository; use the release branch until consolidation, or its successor once merged. From the repository root, run the following commands in one Terminal session. Do not run a release command yet: the direct builder can initialize a new key when no pin exists.

```bash
set +x
umask 077
WORK="$(mktemp -d "${TMPDIR:-/tmp}/clutter-key-recovery.XXXXXXXX")"
bash apps/app/scripts/prepare-sparkle-sdk.sh "$WORK/cache" "$WORK/sdk"
KEY_TOOL="$WORK/sdk/bin/generate_keys"
SIGN_TOOL="$WORK/sdk/bin/sign_update"
ACCOUNT=com.vigram.clutter.sparkle.beta
EXPECTED='ykd7n6b2j4O9A3NelN6uQyABnobGQsZvZc1pyZ5OBXc='
```

Stop if SDK preparation fails. The helper verifies the pinned upstream SDK digest and framework signature before use. The expected public key above matches the pin in `workers/updates/src/installer.ts` at the time of writing. It is not secret. Independently corroborate it against a previously trusted production Clutter app (not a localhost fixture or an app newly built from the backup):

```bash
/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' '/Applications/Clutter.app/Contents/Info.plist'
```

Adjust the app path if necessary. If an intentional future key rotation occurs, use the trusted release identity and matching backup for that generation; do not blindly overwrite a pin. If a Keychain item for the production account or a different existing pin is already present, stop and inspect the public identity only. Do not overwrite or delete an existing key.

### 2. Mount and restore offline

Disconnect networking for the restore. In Finder open the encrypted DMG, preferably mount read-only using `hdiutil attach -readonly` followed by the quoted DMG path. Enter the password into the macOS prompt, never as a command-line argument. Identify the exported key file within the mounted encrypted volume by its filename. The exact filename from the original local drill must be confirmed by the owner; do not guess or open it to inspect its contents.

Use the Sparkle import option (not the default key-generation operation). Set KEY_FILE to the exported file's path on the mounted image. Keep the import output suppressed because an invalid input can cause Sparkle to include it in an error message.

```bash
KEY_FILE='/Volumes/ENCRYPTED_VOLUME/Clutter-Sparkle-Recovery.key'
"$KEY_TOOL" --account "$ACCOUNT" -f "$KEY_FILE" >/dev/null 2>&1
```

Do not copy the exported key into an unencrypted temporary directory. Stop if the import exits unsuccessfully. Compare the restored public key without displaying private material:

```bash
ACTUAL="$("$KEY_TOOL" --account "$ACCOUNT" -p | tr -d '\r\n')"
if [ "$ACTUAL" = "$EXPECTED" ]; then
  echo 'PUBLIC KEY MATCH'
else
  echo 'PUBLIC KEY MISMATCH — STOP'
fi
```

Only proceed on a match. A missing account, failed command or mismatch is not permission to generate a replacement key.

### 3. Prove signing and independent verification

Create a disposable fixture (not a real update), sign using the restored Keychain account and verify the signature against the independently known public key. The following verifier uses the macOS CryptoKit Ed25519 implementation through Swift; it receives only public inputs and fixture bytes.

```bash
printf '%s\n' 'Clutter signing-key recovery fixture' > "$WORK/fixture.txt"
SIG="$("$SIGN_TOOL" --account "$ACCOUNT" -p "$WORK/fixture.txt" | tr -d '\r\n')"
swift - "$WORK/fixture.txt" "$SIG" "$EXPECTED" <<'SWIFT'
import Foundation
import CryptoKit
guard CommandLine.arguments.count == 4,
      let signature = Data(base64Encoded: CommandLine.arguments[2]),
      let publicBytes = Data(base64Encoded: CommandLine.arguments[3]) else {
    fatalError("Invalid verification inputs")
}
let bytes = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let key = try Curve25519.Signing.PublicKey(rawRepresentation: publicBytes)
guard key.isValidSignature(signature, for: bytes) else {
    fatalError("Signature verification failed")
}
print("RECOVERED KEY SIGNATURE VERIFIED")
SWIFT
```

Stop if the verifier fails. The owner verified the equivalent isolated workflow using the portable kit. Use the public-key and signature checks when restoring on a replacement release machine.

### 4. Complete the correct recovery mode

**Temporary recovery drill:** use a separate disposable local account with no preexisting production key. Once the signature verifies, use Keychain Access to remove only the imported Sparkle item matching `com.vigram.clutter.sparkle.beta` in that account's login Keychain. Confirm the account is absent using Keychain Access; do not run key generation to test absence. Do not delete the original release user's key. Eject the mounted image, then remove the temporary SDK and fixture directory. Record only pass/fail, public-key match, successful signature verification, and cleanup. If cleanup is unsuccessful, record the gate as incomplete.

**Actual replacement release machine:** keep the restored production Keychain item. After the public key and signature checks pass, create the release pin if absent, or verify the existing pin matches:

```bash
PIN="$HOME/.tauri/clutter-sparkle-beta.pub"
mkdir -p "$HOME/.tauri"
if [ -e "$PIN" ]; then
  [ "$(cat "$PIN")" = "$EXPECTED" ] && echo 'Existing pin matches' || echo 'PIN MISMATCH — STOP'
else
  (umask 077; set -C; printf '%s\n' "$EXPECTED" > "$PIN")
fi
```

Stop on any pin error or mismatch. Eject the encrypted image. Remove only the disposable work directory created for this exercise (never the mounted backup or production key). Configure normal build tooling, Cloudflare access and, for official releases, the separate Apple signing/notarization credentials according to the distribution runbook. Confirm release version monotonicity and the live feed before preparing a release. Use one publishing machine at a time. Do not publish merely to test recovery.

## Future maintenance

Test recovery after backup changes or intentional key rotation. Retain the correct public pin and backup generation. If recovery fails, keep the original production Keychain key intact, investigate or make a fresh verified backup. Do not replace the signing identity as a workaround.

Reference: [Sparkle official key export/import documentation](https://sparkle-project.org/documentation/), [distribution ODR](sparkle-updater-and-beta-distribution-odr.md), [SDK preparation script](../apps/app/scripts/prepare-sparkle-sdk.sh).
