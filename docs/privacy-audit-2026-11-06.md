# Privacy and data collection audit (2026-11-06)

A repository-wide audit done before Mac App Store submission. It extends [privacy-and-app-store.md](./privacy-and-app-store.md) (the first audit and the privacy manifest) and feeds [mac-app-store-release-checklist.md](./mac-app-store-release-checklist.md). It does not replace the first audit; where the two differ, this one is newer.

Method: code and built-bundle inspection, the deployed Worker's response headers (`/health` and one invalid request), and current official pages. **Confirmed** means observed in code or build output. **External confirmation** means it cannot be settled from this repository. Nothing here is legal advice, and the privacy policy is not drafted yet.

**Update:** the follow-up work is recorded in [privacy-release.md](./privacy-release.md) (Apple's reason-code tables were later read from Apple's documentation data, the `fstatfs` call was removed, the manifest now declares Search History and Product Interaction, and the Worker deployment was checked). Where it differs from this audit, it is newer.

Not retrieved at the time of this audit: the text of Apple's required-reason API reason-code tables and Guideline 5.2.2 (those pages returned only titles or a summary), and Cloudflare's retention figures for customer logs. Treat anything that depends on them as unconfirmed.

## Summary

| Intended statement | Result |
| --- | --- |
| No accounts | Confirmed. No sign-in, identifier or account code in source, `package.json`, `Cargo.toml` or `Cargo.lock` |
| No analytics, telemetry or crash reporting; no update checks | Confirmed |
| No cloud sync | Confirmed for Clutter. A Space in a cloud-synced folder is synced by that provider |
| Notes and attachments stay local | Confirmed. No code sends note text anywhere |
| No user content uploaded to our servers | Confirmed. The Worker receives only a search term, page, orientation, photo id or `ixid` |
| No user data collection | **Qualified.** Search terms and the device IP reach Cloudflare and Unsplash during normal use |

Three qualifications: search terms go through the Worker to Unsplash, whose API Terms (§6) say it may track "views, downloads, searches and likes" made in apps; images load directly from Unsplash's image servers (and any host in a note), so the host sees the IP address; and there is no in-app privacy policy link, which Apple's Guideline 5.1.1(i) requires.

**"Data Not Collected" is defensible only on a narrow reading, and is not recommended.** Apple defines "collect" as transmitting data off the device so that you or your third-party partners can access it for longer than needed to service the request in real time. It defines third-party partners as "analytics tools, advertising networks, third-party SDKs, or other external vendors whose code you've added to your app". Unsplash is not code in the app, which supports "not collected", but Unsplash's own terms say it may retain searches. **Recommended label: Search History, not linked to the user, no tracking, purpose App Functionality.** The decision is the owner's.

## Data flows

| Flow | Path | Data | Evidence |
| --- | --- | --- | --- |
| Cover search | App, Worker, Unsplash | Search text (1 to 100 characters), page, orientation | `core/integrations/unsplash/UnsplashApi.ts` `searchPhotos`; Worker `upstreamUrl` |
| Default photos feed | App, Worker, Unsplash | Page number; result cached in `localStorage` (`clutter-unsplash-editorial`) | `editorialCache.ts` |
| Photo lookup (pasted Unsplash link) | App, Worker, Unsplash | Photo id | `getPhoto` |
| Download tracking | App, Worker, Unsplash | Photo id, `ixid` | `trackPhotoDownload` |
| Image display | WebView, Unsplash image servers | Ordinary image GET (IP, user agent) | `Page.Cover.tsx`, picker, cards |
| Remote images in notes | WebView, any HTTPS host | Ordinary image GET | `ImageWidget.ts`, `Application.resolveCoverImageForDisplay` |
| Save or download a remote image | Rust HTTP client, the URL's host | GET, user-initiated, 50 MB and 30 s limits | `shared/helpers/appFetch.ts`, `downloadRemoteImage.ts` |
| Open a link | Default browser | URL, on user click | `shared/helpers/openExternalUrl.ts` |

I found no `XMLHttpRequest`, `WebSocket`, CDN or remote font. Fonts, the PDF worker and emoji data are bundled.

## External network destinations

| Domain | Purpose | Initiator | Trigger | Can identify the user |
| --- | --- | --- | --- | --- |
| `clutter-unsplash-proxy.vigram-sivakumar.workers.dev` | Search, feed, lookup, download tracking | `UnsplashApi.ts` | Opening the picker, typing a search, picking or saving | IP only |
| `api.unsplash.com` | Same, server to server | The Worker | As above | No (the Worker's IP) |
| `images.unsplash.com`, `plus.unsplash.com` | Photo display | WebView image loads | Automatic on render, including welcome covers on first launch | IP, user agent; Unsplash tracks views by `ixid` |
| Any HTTPS host in a note or cover | Remote images | `ImageWidget.ts`, `Page.Cover.tsx` | Automatic when the note renders | IP, user agent |
| Any host the user names | Save or download | `appFetch` (reqwest, rustls) | User action | IP, user agent |
| Default browser, any URL | Links | `openExternalUrl` | User click | Whatever the site does |
| `localhost:1421`, `1422`, `5173` | Development servers | `devCsp` | Development builds only | n/a |

The built `dist/` contains `api.unsplash.com`, `unsplash.com` and `images.unsplash.com` strings (welcome content and guards), no analytics host and no key. Live traffic was not captured, so cookies and `Referer` behavior toward Unsplash are unverified.

## Unsplash compliance

Sources: [Developers](https://unsplash.com/developers), [API Guidelines](https://help.unsplash.com/en/collections/1451694-api-guidelines), [Documentation](https://unsplash.com/documentation), [API Terms](https://unsplash.com/api-terms), [Privacy](https://unsplash.com/privacy). The documentation page's last section was read as a summary, not verbatim.

| Requirement (source) | Clutter | Status |
| --- | --- | --- |
| Proxy allowed, key confidential (Guideline 4 "may require using a proxy"; usage guideline 6 "allowing them to all share a single API key") | Worker holds `UNSPLASH_ACCESS_KEY` as a secret binding; `dist/` has no key; `unsplashNoKeyInApp.test.ts` guards the source | Compliant in design. The secret itself is outside the repo: external confirmation |
| Hotlink returned `photo.urls` (Guideline 1; Terms §6) | Cover saves `urls.regular` with only `w` raised to 4800 (`unsplashCoverUrl`), `ixid` kept; `w` is a documented parameter | Compliant |
| A saved local copy (the Hotlinking article says the rule "applies to all uses of the image") | "Save to vault" downloads a copy and the cover then shows the local file, so views are no longer reported (ADR-054 section 5) | **Needs confirmation from Unsplash** |
| Download tracking on download-like actions (Guideline 2; Terms §6) | Fired on pick (`ImagePicker.Unsplash.tsx:138`, `ImagePicker.Link.tsx:59`) and on Download or Save (`Application.reportUnsplashDownload`), via the Worker with `ixid` | Compliant |
| Welcome-note covers | Five Unsplash covers ship pre-picked; no download event on install | Low risk (views tracked by hotlink; no user chooses them) |
| Attribution: photographer, Unsplash, links, `utm_source=<app>&utm_medium=referral` (Guideline 3; Terms §9) | `unsplashAttribution.ts`, `components/cover-attribution/CoverAttribution.tsx`; `utm_source=clutter` | Partly: see gaps |
| Production approval | Not applied for, as far as the repo shows | **Required in practice** |

**Attribution gaps:** list rows and table cells show the credit only as a tooltip (ADR-054 says so); `src/welcome-content/.../Inline styles.md` has an Unsplash cover with no `coverCredit` (the cover is hidden, so nothing shows today); a cover with no credit shows only "Unsplash"; and `utm_source` must equal the registered application name (cannot be verified here).

**Production approval:** the documentation says demo mode is 50 requests per hour, rising to 1000 after approval. The Developers page says 1,000, so the official figures conflict. The FAQ says apps "consumed by the public" should apply for production, and lists screenshots, accurate information, and guideline compliance including hotlink view reporting and download tracking. No explicit pre-distribution gate and nothing Mac App Store specific was found. Unsplash may revoke access "with or without notice" (Terms §11).

**Terms obligations:** §5 requires a published privacy policy for the app; §7 says you represent you may pass user data (the IP address) to Unsplash with notice and consent; §2 forbids sharing credentials with third parties. Apple Guideline 5.2.2 (third-party services) was not retrieved; keep Unsplash's written approval.

## Cloudflare Worker

Source: `workers/unsplash-proxy/src/index.ts`, `wrangler.toml`. The deployed Worker's headers matched the source (`cache-control: no-store`, `nosniff`, no CORS for a foreign origin); that shows behavior, not that the deployed code is identical.

- **Receives:** the full request URL (search text included), the client IP and headers. Cloudflare's edge sees all of it.
- **Forwards:** only a validated path and query plus `Authorization: Client-ID` and `Accept-Version`. No client header, cookie or body. Unsplash sees the Worker's IP, not the user's.
- **Logs:** `console.warn` of event name, route kind, status and key-shape facts; never a query, id, IP or key. `observability.enabled = false`.
- **Stores:** nothing persistent in code. The rate-limit binding keeps per-IP counters keyed by `CF-Connecting-IP`.
- **Cloudflare documentation:** Logpush defaults to off. Workers metrics are aggregate counters kept up to three months. Cloudflare's privacy policy makes it a processor of "Customer Logs" and a controller of its own "Network Data", with no numeric retention for customer log content. Its rate-limit page advises against IP keys and does not say whether counters persist.
- **Not found:** whether `console.warn` output is retained when observability is off, and whether the client IP appears in any default log. External confirmation.
- **workers.dev:** Cloudflare calls it "intended for personal or hobby projects that aren't business-critical" and recommends a custom domain for production. The subdomain is baked into the app and its CSP.
- **Shared quota:** the limit is 60 requests per minute per IP. One client could use a 1,000-per-hour production quota in under 17 minutes. The endpoint is public; CORS is not protection.
- **Obligations:** disclose the Worker and Cloudflare in the privacy policy; accept Cloudflare's customer DPA on the account.

## Local data

| Data | Location | Leaves device | Personal content | Removed on delete |
| --- | --- | --- | --- | --- |
| Notes, assets, `.clutter/` state | User's Space folders | No | Yes | By the user (archive, then permanent delete) |
| Space registry (`clutter.spaces.v1`) and about 30 preference keys | WebView `localStorage` | No | Folder paths | Registry on Space removal; preferences persist |
| Folder bookmarks (`space-access.json`) | App data | No | Folder paths | Forgotten on Space removal |
| Recovery records | App data `recovery/` | No | Unsaved note text | When the note is clean |
| Parsed-note cache | `~/Library/Caches/<id>/parse-cache/` | No | Task text, headings, frontmatter, links | Not on Space removal; pruned after 90 days unused, capped at 64 MB |
| Unsplash feed cache | `localStorage` | No | Photo names and links | Overwritten on shuffle |
| Temp files (`.clutter-tmp.*`) | In the Space | No | May hold newer note text | Not auto-cleaned (ADR-063) |
| Logs | None in release builds | n/a | n/a | n/a |

The parse cache holds fragments of note content outside the Space and survives Space removal. It is local only, but the policy's deletion statement should mention it.

## Permissions

Entitlements: App Sandbox, user-selected read-write, app-scope bookmarks, network client. The built `Info.plist` has no usage-description strings, and there is no Keychain, Contacts, Calendar, Photos, camera, microphone or location code. Whether `$HOME/**` resolves to the container under the sandbox needs a sandboxed run. `http:default` allows `https://*` and `http://*`, and `openExternalUrl` passes any scheme to the opener (user click only): optional narrowing, not an Apple requirement.

## Dependencies

Network-capable at runtime: `tauri-plugin-http` (reqwest, rustls, ring) and `tauri-plugin-opener`. No analytics, crash-reporting, updater or telemetry crate in `Cargo.lock` (`tracing` and `log` are logging libraries). `tauri-plugin-log` is compiled in but registered only under `debug_assertions` (`lib.rs`). JavaScript runtime packages (CodeMirror, React, pdf.js, emojibase-data, Prettier) are local-only; build tools (vite, vitest, wrangler, wdio) are not shipped. `wrangler` and the Tauri CLI's own telemetry settings were not checked.

## Privacy manifest

[PrivacyInfo.xcprivacy](../apps/app/src-tauri/PrivacyInfo.xcprivacy) is valid and bundled: no tracking, no tracking domains, no collected data, FileTimestamp reasons 3B52.1, C617.1 and DDA9.1.

- **Disk space missing:** the executable imports `fstatfs` (used at `atomic_replace.rs:881`), which I understand belongs to Apple's disk-space category. It is not declared. The likeliest upload rejection.
- **Reason codes unverified:** Apple's reason-code tables were not retrieved. Treat the declared codes as unconfirmed until Apple's validator accepts an upload.
- **Clock API:** `clock_gettime` is imported; whether Apple flags it under system boot time is not established.
- **Collected-data list:** if Search History is declared, add the matching entry, so the manifest, the label and the policy agree. Apple says Xcode builds its privacy report from these entries.
- **Third-party SDKs:** Apple's list of SDKs that need a manifest and signature does not name Rust, Tauri, Cargo crates or WebKit. Statically linked crates sit in one executable, so the app's manifest must cover the APIs they use. `ring` derives from BoringSSL, which is listed, and the page says SDKs that "repackage" a listed one are included; likely low risk, unconfirmed.

## App Privacy questionnaire (preliminary)

| Data type | Collected by Clutter | Collected through Clutter by a third party | Linked to user | Tracking | Off device | Needed for function |
| --- | --- | --- | --- | --- | --- | --- |
| Search History (cover searches) | Not retained by the Worker, per its code | Possibly: Unsplash may track searches (Terms §6) | No identifier; the IP is visible | No | Yes | Yes |
| IP address in image requests | No | Unsplash tracks views with a random id plus IP | Unsplash says the id is not linked to other personal data | No | Yes | Yes |
| Browsing history, user content, usage data, diagnostics, identifiers, contacts, location | No | No | n/a | No | No | n/a |

Notes and attachments are processed on the device and never transmitted, so User Content is not collected ("data that is processed only on device is not 'collected'"). Apple's optional-disclosure rules do not help: the search is not infrequent and is not submitted through a form. Whether the IP address needs a data type of its own (for example Device ID) was not settled by the pages retrieved; confirm with Apple.

## Documents and disclosures needed

- **Privacy policy:** a public URL in App Store Connect and an easily accessible link in the app (Guideline 5.1.1(i)). Apple also asks for data-retention and deletion information. Unsplash's API Terms §5 independently require a published policy.
- **Support URL.**
- **Disclosures:** the Worker and Cloudflare, Unsplash, remote-image loading and what it reveals, local data including the parse cache, and no sync, accounts or analytics.
- **Unsplash:** keep the written production approval; apply with screenshots.
- **Cloudflare:** accept the customer DPA on the account.

## Must fix before submission

1. Decide the privacy label; keep label, manifest and policy identical.
2. Host the privacy policy and support page; add the in-app privacy link.
3. Settle Unsplash production approval. Fallback: ship with the Unsplash tab off (an empty `VITE_UNSPLASH_PROXY_URL` turns it off).
4. Resolve the `fstatfs` disk-space declaration.
5. Close the attribution gaps: list and table surfaces, the missing `coverCredit` on the welcome cover, and confirm `utm_source`.
6. Ask Unsplash whether a user-saved local copy satisfies hotlinking.

## Can be accepted with disclosure

- Automatic loading of remote images and Unsplash covers, which reveals the device IP. A setting to defer it is optional.
- `workers.dev` hosting (a custom domain is better, not required).
- Shared-quota exposure (a tighter limit is optional).
- The broad HTTP capability and the opener's missing scheme filter.
- The parse cache outliving a removed Space, if documented.

## Recommended privacy position

"Clutter has no accounts, analytics or tracking, and keeps your notes and attachments on your Mac. The only data that leaves your device is what the Unsplash cover picker needs: your search terms, sent through Clutter's proxy to Unsplash, and image requests that Unsplash's image servers see. Images from other sites in your notes load from those sites." Declare Search History; do not claim "Data Not Collected".

## Confirmed, assumed, and unconfirmed

- **Confirmed in code or built output:** the data flows, network destinations, local data, permissions and dependency findings, the key-free bundle, and the deployed Worker's headers.
- **Assumptions:** the deployed Worker matches the repo; the Unsplash key exists only as a Worker secret.
- **External confirmation:** Unsplash approval status, application name and local-copy questions; Cloudflare log retention; Apple's treatment of disk space, the clock API and the IP address data type; Apple's reason-code wording.

## Official sources

- Unsplash: [Developers](https://unsplash.com/developers), [API Guidelines](https://help.unsplash.com/en/collections/1451694-api-guidelines), [Documentation](https://unsplash.com/documentation), [API Terms](https://unsplash.com/api-terms), [Privacy](https://unsplash.com/privacy)
- Apple: [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/), [Required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- Cloudflare: [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/), [Privacy policy](https://www.cloudflare.com/privacypolicy/), [Customer DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)
