#!/usr/bin/env python3
"""Add at most one verified delta from the immediately preceding universal release.

The previous public appcast is the source of truth, not a mutable local build.
The first universal release deliberately has no delta from the old ARM-only app.
"""
import pathlib
import plistlib
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"
CLUTTER = "https://clutter-updates.vigram-sivakumar.workers.dev/ns"
def tag(name):
    return f"{{{NS}}}{name}"

def run(*args):
    return subprocess.check_output([str(a) for a in args], text=True).strip()

def tool(sdk, name):
    return next(p for p in sdk.rglob(name) if p.is_file())

def download(url, path):
    subprocess.run(["curl", "--fail", "--silent", "--show-error", "--max-time", "180",
                    "--proto", "=https", url, "-o", str(path)], check=True)

def main():
    stage, app, sdk, account, key, base, build = sys.argv[1:]
    stage, app, sdk = map(pathlib.Path, (stage, app, sdk))
    build = int(build)
    # Use the same HTTPS transport as the release publisher. Distinguish
    # a missing feed from denied access or transport failure; never treat
    # those errors as permission to publish against an unknown base.
    with tempfile.TemporaryDirectory(prefix="clutter-appcast-") as temp:
        feed = pathlib.Path(temp) / "appcast.xml"
        status = run("curl", "--silent", "--show-error", "--max-time", "30",
                     "--proto", "=https", "--output", feed,
                     "--write-out", "%{http_code}", base + "/appcast.xml")
        if status == "404":
            print("No published release; full archive only.")
            return
        if status != "200":
            raise SystemExit(f"Cannot read previous appcast (HTTP {status}); check update endpoint access before retrying.")
        old = ET.parse(feed).getroot().find("channel")
        if old is None:
            raise SystemExit("Previous appcast is missing its channel")
    if old.findtext(f"{{{CLUTTER}}}signingPublicKey") != key:
        raise SystemExit("Previous feed signing identity differs")
    item = max(old.findall("item"), key=lambda i: int(i.findtext(tag("version"))))
    previous = int(item.findtext(tag("version")))
    current_channel = ET.parse(stage / "appcast.xml").getroot().find("channel")
    if old.findtext(f"{{{CLUTTER}}}codeSigning", "adhoc") != current_channel.findtext(f"{{{CLUTTER}}}codeSigning"):
        print("Code signing transition; full archive only.")
        return
    if previous >= build:
        raise SystemExit("Release must be newer than the published version")
    enclosure = item.find("enclosure")
    url = enclosure.attrib["url"]
    if not re.fullmatch(re.escape(base) + r"/releases/Clutter_[0-9]+\.[0-9]+\.[0-9]+_universal\.zip", url):
        print("Previous release is not universal; full migration archive only.")
        return
    signer = tool(sdk, "sign_update")
    binary_delta = tool(sdk, "BinaryDelta")
    with tempfile.TemporaryDirectory(prefix="clutter-delta-") as temp:
        temp = pathlib.Path(temp)
        archive = temp / "previous.zip"
        download(url, archive)
        if archive.stat().st_size != int(enclosure.attrib["length"]):
            raise SystemExit("Previous archive size mismatch")
        # Ed25519 signatures are deterministic. Re-sign with the pinned Keychain
        # identity and compare before extracting any bytes from the network.
        if run(signer, "--account", account, "-p", archive) != enclosure.attrib[tag("edSignature")]:
            raise SystemExit("Previous archive signature mismatch")
        subprocess.run(["ditto", "-x", "-k", str(archive), str(temp / "old")], check=True)
        old_app = temp / "old" / "Clutter.app"
        with (old_app / "Contents/Info.plist").open("rb") as f:
            info = plistlib.load(f)
        if int(info["CFBundleVersion"]) != previous or info["SUPublicEDKey"] != key:
            raise SystemExit("Previous app identity/version mismatch")
        if set(run("lipo", "-archs", old_app / "Contents/MacOS" / info["CFBundleExecutable"]).split()) != {"arm64", "x86_64"}:
            raise SystemExit("Previous universal archive contains non-universal executable")
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(old_app)], check=True)
        delta = stage / f"Clutter_{previous}_to_{build}_universal.delta"
        subprocess.run([str(binary_delta), "create", "--version=4", str(old_app), str(app), str(delta)], check=True)
        tree = ET.parse(stage / "appcast.xml")
        current = tree.getroot().find("channel/item")
        full = current.find("enclosure")
        if delta.stat().st_size >= int(full.attrib["length"]):
            delta.unlink()
            print("Delta is not smaller than full archive; publishing full archive only.")
            return
        patched = temp / "Clutter.app"
        subprocess.run([str(binary_delta), "apply", str(old_app), str(patched), str(delta)], check=True)
        subprocess.run(["codesign", "--verify", "--deep", "--strict", str(patched)], check=True)
        # Compare bundle contents and symlink targets; BinaryDelta itself also verifies the resulting tree hash.
        subprocess.run(["diff", "-qr", str(app), str(patched)], check=True)
        signature = run(signer, "--account", account, "-p", delta)
        if not re.fullmatch(r"[A-Za-z0-9+/]{86}==", signature):
            raise SystemExit("Invalid delta signature")
        ET.register_namespace("sparkle", NS)
        ET.register_namespace("clutter", CLUTTER)
        deltas = ET.SubElement(current, tag("deltas"))
        ET.SubElement(deltas, "enclosure", {
            "url": base + "/releases/" + delta.name,
            "length": str(delta.stat().st_size),
            "type": "application/octet-stream",
            tag("deltaFrom"): str(previous),
            tag("edSignature"): signature,
        })
        tree.write(stage / "appcast.xml", encoding="utf-8", xml_declaration=True)
        print(f"Verified delta {previous} → {build}: {delta.stat().st_size} bytes vs {full.attrib['length']} full bytes")

if __name__ == "__main__":
    main()
