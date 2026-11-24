# Privacy release status and answer sheet

The working record of Clutter's privacy readiness for the Mac App Store, as of 2026-11-06. It consolidates [privacy-audit-2026-11-06.md](./privacy-audit-2026-11-06.md) (the evidence) with what was then implemented, and is the document to read before filling in App Store Connect. The published texts are [privacy-policy.md](./privacy-policy.md) and [support.md](./support.md).

Where something could not be verified from the repository or this machine, it says so. Nothing here is legal advice.

## Final privacy position

Clutter has no accounts, analytics, telemetry, tracking, advertising or sync, and keeps notes and attachments in folders the user chooses. Notes are never transmitted. What leaves the device is:

1. **Cover search through Clutter's own proxy**: the search text, page, orientation and photo ids reach Unsplash through a Cloudflare Worker that holds the API key and keeps nothing.
2. **Direct image requests**: Unsplash photos, and any image address in a note or cover, load straight from the host that serves them, which sees the device's IP address.
3. **User actions**: saving a remote image or file (downloaded at the user's request) and opening a link in the browser.

The policy states all of this and does not claim that nothing leaves the device.

## Third-party services

| Service | Role | Receives | Verified |
| --- | --- | --- | --- |
| Cloudflare Workers (`unsplash-proxy.clutterapp.workers.dev`) | Hosts the proxy | Request URL (search text, page, photo id), client IP, headers, while serving | Deployment, settings and bundle checked below |
| Unsplash API (`api.unsplash.com`) | Photo search and download tracking | Query, page, orientation, photo id, `ixid`, from the proxy's address with Clutter's key | Request flow in code; live search returns results |
| Unsplash image servers (`images.unsplash.com`, `plus.unsplash.com`) | Photo display | Image GET from the device (IP, user agent); view tracking by `ixid` | In code; live traffic not captured |
| Any other host in a note or cover, or one the user saves from | Image display or download | Image GET from the device | In code |

No analytics, crash-reporting, advertising or update service is used.

## Network destinations

The full table (initiator, trigger, data) is in the [audit](./privacy-audit-2026-11-06.md#external-network-destinations). Unchanged by this work: no destination was added, and none removed.

## App Privacy declaration (App Store Connect answer sheet)

Basis: Apple defines "collect" as transmitting data off the device so that you or your third-party partners can access it for longer than needed to service the request in real time, and says on-device processing is not collection ([App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)).

**Decision.** Declare two data types, both **not linked to the user**, **not used for tracking**, with purpose **App Functionality**: **Search History** and **Product Interaction**. Do not choose "Data Not Collected".

Why not "Data Not Collected": the search text and the report that a photo was picked or saved pass through Clutter's own Worker to Unsplash. The Worker keeps neither (code and settings checked). But whether Cloudflare keeps the request's URL beyond serving it is not established (Cloudflare gives no retention period for customer request data), and Unsplash's API terms say it may track searches and records downloads. Apple's definition names partners "whose code you've added to your app", which Unsplash is not, so "not collected" has a literal defense. The user's rule for unestablished third-party retention is the conservative declaration, so it is declared.

Why not more: image requests to Unsplash's image servers and to other websites are made by the web view directly, the way any web page loads an image. Clutter's code transmits nothing in them and Clutter's infrastructure is not involved, so they are described in the privacy policy rather than declared. IP addresses are not a data type in Apple's list. If App Review or Apple Developer Support says Unsplash's view tracking must be declared, add Product Interaction purposes accordingly; it is already declared.

### Data type by data type

| Data type | Collected | Linked | Tracking | Purpose | Retained beyond real-time processing |
| --- | --- | --- | --- | --- | --- |
| Search History | **Yes** (cover search text) | No | No | App Functionality | By Clutter: no. By Cloudflare or Unsplash: not established, so declared |
| Product Interaction | **Yes** (photo picked or saved, reported to Unsplash) | No | No | App Functionality | By Clutter: no. By Unsplash: yes, it records downloads |
| User Content (notes, attachments, photos) | No: processed on the device only | n/a | n/a | n/a | n/a |
| Contact info, health, financial, precise or coarse location, sensitive info, contacts | No | n/a | n/a | n/a | n/a |
| Browsing History | No (links open in the user's browser; Clutter sees none) | n/a | n/a | n/a | n/a |
| Identifiers (User ID, Device ID) | No: no account, no identifier, none sent | n/a | n/a | n/a | n/a |
| Purchases | No | n/a | n/a | n/a | n/a |
| Usage Data: Advertising Data, Other Usage Data | No | n/a | n/a | n/a | n/a |
| Diagnostics (crash, performance, other) | No: no crash or performance reporting | n/a | n/a | n/a | n/a |
| Surroundings, Body, Other Data | No | n/a | n/a | n/a | n/a |

### What to select in App Store Connect

1. App Privacy, "Do you or your third-party partners collect data from this app?": **Yes**.
2. Select **Search History** and, under Usage Data, **Product Interaction**. Select nothing else.
3. For each: linked to the user's identity? **No**. Used for tracking? **No**. Purpose: **App Functionality** only.
4. Privacy policy URL: the published address of [privacy-policy.md](./privacy-policy.md). Privacy choices URL: leave empty. Support URL: the published address of [support.md](./support.md).

Keep the label, the privacy manifest's `NSPrivacyCollectedDataTypes` and the policy identical. The label is the owner's attestation to Apple; if Cloudflare's or Unsplash's retention is later established as nil, it can be reduced.

## Privacy manifest

[PrivacyInfo.xcprivacy](../apps/app/src-tauri/PrivacyInfo.xcprivacy), placed in `Contents/Resources` by `tauri.conf.json`.

| Key | Value |
| --- | --- |
| `NSPrivacyTracking` | false; `NSPrivacyTrackingDomains` empty |
| `NSPrivacyCollectedDataTypes` | Search History and Product Interaction, each not linked, not tracking, App Functionality (matches the sheet above) |
| `NSPrivacyAccessedAPITypes` | File timestamp only: `3B52.1` (files the user granted access to), `C617.1` (files in the app container), `DDA9.1` (shown to the user) |

Reason codes and API lists were read from Apple's documentation data on 2026-11-06 ([required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)). Findings that changed the manifest work:

- **Disk space (`fstatfs`).** Apple's disk-space reasons are displaying free space, checking there is enough space to write or delete files (with observably different behavior), a user-submitted bug report, and health research. Clutter only read the filesystem *name*, which none describes, so declaring one would have been false. The call was removed instead: the volume type is now read through the system's volume type-name value ([ADR-069](./adr/069-volume-type-is-read-without-a-disk-space-api.md)), with identical results on APFS, HFS+, exFAT and FAT32 volumes. The shipped executable imports no `statfs`, `fstatfs`, `statvfs`, `fstatvfs` or `getattrlist`.
- **`clock_gettime`.** Apple's system-boot-time list names `mach_absolute_time` (and `systemUptime`); `clock_gettime` is not on it, and the executable does not import `mach_absolute_time`. No declaration.
- **Other categories.** User defaults, active keyboards: no use found (symbols and strings). Third-party SDK manifests: Apple's list of SDKs that need a manifest and signature names no Rust, Tauri or WebKit component; the executable's own manifest covers the APIs its statically linked crates use. `ring` derives from BoringSSL, which is on the list; reading of "repackaged" SDKs is unconfirmed.

Checks, run by `npm run check:privacy` (structure only) and by `verify:bundle` on a built bundle (structure and a match with the executable's imports; an undeclared category or a declared-but-unused one fails): see `apps/app/scripts/check-privacy-manifest.py`. **Not done:** Apple's own validation, which needs an upload with an Apple account (Transporter or `altool`). Apple's validator remains the last word.

## Cloudflare Worker: configuration and status

Verified on 2026-11-06 against the account `wrangler` is logged in to (read-only calls).

| Question | Finding | Basis |
| --- | --- | --- |
| Deployed Worker matches the repository | **Yes.** The deployed `index.js` is identical to the bundle built from the repository (same length and hash after whitespace normalization) | Cloudflare API script content versus `wrangler deploy --dry-run` |
| Latest deployment | 2026-11-02 | `wrangler deployments list` |
| Request logging (Workers Logs) | **Off.** `observability` is not configured on the deployed Worker (`null`) | Script settings API |
| Logpush / tail consumers | Off / none | Script settings API |
| `console.warn` output when observability is off | Not persisted by Workers Logs, which Cloudflare documents as written only when the observability setting is enabled; visible live only to someone running `wrangler tail`. The lines carry an event name and status, never a query, id, IP or key | Cloudflare Workers Logs documentation; `log()` in `src/index.ts` |
| Client IPs recorded or retained by our code | No. `CF-Connecting-IP` is passed to the rate limiter as its key and nowhere else | `src/index.ts` |
| Rate-limit counters | Per key, per Cloudflare location, local and eventually consistent; Cloudflare doesn't state whether or how long they persist. Nothing in our code stores them | Rate limiting binding documentation |
| Cloudflare keeping request metadata independently | Yes, as a hosting provider: it sees the URL and IP while serving and keeps operational metrics (aggregate counters, up to three months) and may keep other data under its privacy policy. It gives no retention figure for customer request data. This is why the declaration is conservative | Cloudflare documentation and privacy policy |
| Subdomain and previews | `workers.dev` enabled, version previews disabled | Subdomain API |
| Suitable for production | Workable, not ideal. Cloudflare says `workers.dev` is "intended for personal or hobby projects that aren't business-critical" and recommends a custom domain. Moving needs a domain you own and a change in the app (below) | Cloudflare `workers.dev` documentation |

Changed in the repository (not deployed: the settings are identical in effect): `wrangler.toml` states `logpush = false` explicitly and documents the verified state; `test/config.test.ts` fails if Workers Logs, Logpush or a tail consumer is ever turned on. The live check also confirmed the response headers (`cache-control: no-store`, `nosniff`, no CORS for a foreign origin).

**If the Worker moves to a custom domain** (recommended before wide release, optional for submission): add the domain's route in `wrangler.toml`, change `DEFAULT_UNSPLASH_PROXY_URL` in `UnsplashApi.ts` and the origin in `connect-src` in `tauri.conf.json` together (`unsplashNoKeyInApp.test.ts` checks them), update the privacy policy's wording if the host name is quoted, deploy, and update `ALLOWED_ORIGINS` only if the app's origin changed.

### External account actions for Cloudflare

1. **Accept the Customer DPA** on the Cloudflare account that hosts the Worker (Cloudflare dashboard, Account home, Configurations or Legal; the DPA is at <https://www.cloudflare.com/cloudflare-customer-dpa/>, version 6.4 at the time of writing). Its status could not be read through the API token available here (`workers` scopes only). Confirm it is in force, and keep a copy.
2. **Dashboard check (once):** Workers & Pages, `unsplash-proxy`, Settings, Observability: confirm Workers Logs shows Disabled, and Logpush shows no jobs. The API already reports this; the dashboard is the owner's confirmation.
3. **Optional:** put the Worker on a custom domain (above).

## Unsplash production configuration

| Question | Finding |
| --- | --- |
| Worker uses a key stored as a secret | Yes: `UNSPLASH_ACCESS_KEY`, type `secret_text` (listed by `wrangler secret list`; the value is not readable) |
| It is the approved production key | **Cannot be read from here.** The Worker accepts the key (a live search returns 30 results; an unknown photo id returns 404, where a rejected key would return 502). Whether it is the production-tier key needs the check below |
| The app contains no key | Yes: no `Client-ID`, `UNSPLASH_ACCESS_KEY` or `client_id` in `dist/` or in the built bundle; `unsplashNoKeyInApp.test.ts` guards the source |
| Download tracking and hotlinking | Unchanged: `trackPhotoDownload` still sends the photo id and `ixid` through the Worker on pick or save; covers still use `images.unsplash.com` URLs with only `w` raised. A live download call for an unknown id returns 404 `not_found`, so no real download was recorded during the checks |
| Production rate limit and the per-client limit | Per-client limit stays 60 requests per 60 seconds per IP, from the Worker settings. It protects against one client hammering the Worker, not the shared hourly quota: Workers rate limits count per location and in 10 or 60 second windows, so no limit can enforce an hourly total. When Unsplash's hourly quota is used up, it answers 403 or 429, the Worker returns `429 rate_limited`, and the picker shows its "request limit reached" message while everything else works. Watch usage in the Unsplash dashboard |
| Shared key exposure | The Worker is public (CORS is not authentication), so anyone can spend the shared quota. Unsplash's guidelines explicitly allow a proxy that signs requests for all users with one key. The key itself is never returned. Mitigations in place: validated inputs, no passthrough, per-IP limit |

### External actions for Unsplash

1. **Confirm the deployed key is the production key.** With the production access key in your shell (not in a file), run `curl -s -D - -o /dev/null -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY" "https://api.unsplash.com/photos?per_page=1" | grep -i x-ratelimit-limit`. A production key shows the production hourly limit; a demo key shows 50. If it shows a demo limit or you are unsure the Worker has the same key, set it again with `cd workers/unsplash-proxy && npx wrangler secret put UNSPLASH_ACCESS_KEY`, paste the production key, and check a search still works.
2. **Keep Unsplash's production approval** (the email) with the submission records; App Review can ask for permission to use a third-party service (Guideline 5.2.2).
3. Confirm that `utm_source=clutter` (`UNSPLASH_REFERRAL_SOURCE`) is the application name registered with Unsplash.

## Privacy policy and support access

- **Published texts (source):** [privacy-policy.md](./privacy-policy.md), [support.md](./support.md). Each has one placeholder for a contact email, because no real contact address exists in the repository.
- **In the app:** Settings, Preferences, **Privacy and support** group, between Data & storage and Reset: a Privacy policy entry and a Support entry, each with an Open button that opens the published page in the default browser. Code: `features/settings/legal-links/LegalLinks.tsx`; the two addresses are in `core/legalLinks.ts`.
- **Until the pages are published**, both addresses are `null` and the group is not shown, so the app never points at a page that does not exist. `npm run check:legal-links` fails until both are set, and `npm run build:appstore` runs it, so a submission build cannot be made without them.

### External actions to publish

1. **Choose where to host the two pages**, at a public https address you control. I did not invent one. Options: GitHub Pages for this repository (the repository is publicly visible, so check that is what you want), a personal site, or any static host. Render `privacy-policy.md` and `support.md` as web pages without changing their text.
2. **Add a real contact email** to both files (replace the placeholders), then publish.
3. **Set both addresses** in `apps/app/src/core/legalLinks.ts`, run `npm run check:legal-links`, and enter the same addresses in App Store Connect (Privacy Policy URL, Support URL).

## Other items from the audit (status)

| Item | Status |
| --- | --- |
| In-app privacy policy link (Guideline 5.1.1(i)) | Built; shows once the address is set |
| `fstatfs` disk-space declaration | Resolved by removing the call (ADR-069); not yet confirmed by Apple's validator or in a sandboxed run |
| Attribution gaps (list and table thumbnails; `Inline styles.md` welcome cover with no `coverCredit`; `utm_source`) | Open, not part of this task |
| Encryption (export compliance) answer | Open; unchanged by this task |
| Parsed-note cache outliving a removed Space | Documented in the policy; no code change |
