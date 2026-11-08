# Clutter privacy policy

Last updated: 6 November 2026

This is the source of Clutter's published privacy policy. Publish it unchanged (the address goes in `apps/app/src/core/legalLinks.ts` and in App Store Connect; see [privacy-release.md](./privacy-release.md)). It describes what the app does today, verified against the code in [privacy-audit-2026-11-06.md](./privacy-audit-2026-11-06.md). When the app's behavior changes, change this file in the same commit and update the date.

**Before publishing:** replace `[privacy contact email, to be added before publishing]` in the last section with a real address. No contact address has been chosen yet.

## The short version

- Clutter keeps your notes on your Mac, in folders you choose. They are not sent to the developer or to any service.
- There are no accounts, no analytics, no tracking and no advertising.
- Some features contact other services: the Unsplash cover photo picker, and images that your notes or covers point to on the web. This policy explains exactly what is sent and to whom.

## Who this is from

Clutter is made by Vigram Sivakumar ("I", "Clutter"). Clutter is a notes app for the Mac. This policy applies to the Clutter app, and to the small online service the app uses to reach Unsplash (described below).

## Where your notes are stored

Clutter is local first. Your notes are plain Markdown files, and your attachments (images and PDFs) are ordinary files, in folders on your Mac that Clutter calls Spaces. You choose a Space's folder, or Clutter creates one in your Documents folder after you ask it to. Each Space also holds a hidden `.clutter` folder with Clutter's own data for that Space (for example your tags, archive, collections and the Space's name and picture).

Clutter can only open folders you give it access to, through the standard macOS file panel, and it keeps that access between launches with the system's folder-access mechanism so you don't have to choose the folder every time. It does not read other folders.

I don't receive your notes, your attachments, your Space names or your folder paths. Clutter has no server that stores them.

## What Clutter does not do

- There are no accounts or sign-in. Clutter has no way to identify you.
- There is no analytics, telemetry, crash reporting, advertising or behavioral tracking, in the app or in any component it uses.
- Clutter does not check for updates by itself. Updates come through the Mac App Store.
- Clutter does not sync. See "Cloud-synced folders" below.

## Information that leaves your device

Clutter does not claim that nothing leaves your device. These are the cases.

### Unsplash cover photos

When you open the Unsplash tab of the cover picker, search for a photo, paste a link to an Unsplash photo, or pick or save a photo, Clutter contacts Unsplash through a small online service that I run on Cloudflare (a "proxy"). The proxy holds Clutter's Unsplash access key so that the key is not in the app. It sends Unsplash only what is needed:

- the text you search for, the page of results and the photo shape (landscape, portrait or square);
- the photo's identifier, when you paste a photo link, pick a photo, or save one (Unsplash asks apps to report these actions, and Clutter does);
- Clutter's access key.

It does not send your notes, your Space names, your folder paths or anything that identifies you. Unsplash sees the proxy's address, not yours.

**What the proxy keeps.** Nothing. It doesn't store your searches or your IP address, and it doesn't write them to any log. It uses your IP address only for a moment to limit how many requests one address can make per minute. Cloudflare, which hosts the proxy, handles every request on its network, so it sees the request address (including your search text and IP address) while serving it, and it may keep operational information under its own privacy policy. I can't see that information.

**What Unsplash keeps.** Unsplash's API terms say Unsplash may track views, downloads and searches of its images in apps that use its service. How long it keeps search terms isn't stated in its terms. Unsplash's own privacy policy applies to what it receives.

### Photos and images shown from the web

Images are loaded directly by the app from the website that hosts them, the way a web page loads an image. That website sees your IP address and basic details such as the app's user agent, and can record that the image was requested. Clutter does not send these requests through the proxy.

- **Unsplash photos.** A cover chosen from Unsplash is stored in the note as the photo's web address, so it loads from Unsplash's image servers whenever the note is shown. Unsplash may record each view with a random identifier and the requesting IP address. The welcome notes that Clutter installs on first launch use Unsplash photos, so this happens the first time you open them, without any action from you.
- **Images in your notes and covers.** If a note's image or a cover points to an address on another website, the app loads it from that site when the note is shown, and that site sees the request. You can avoid this by saving the image to your Space (which makes it a local file) or not using web images.
- **Saving a copy.** When you choose to download or save a web image or file, Clutter downloads it from that site at your request. If it is an Unsplash photo, Clutter also reports the download to Unsplash through the proxy.

### Links

A link in a note opens in your default browser when you click it. From then on, the site you visit has its own privacy practices. Clutter does not track which links you open.

## Data stored on your Mac by the app

Besides your Spaces, Clutter keeps these on your Mac. None of it is sent anywhere.

| What | Where | Why | When it goes away |
| --- | --- | --- | --- |
| Settings and the list of your Spaces (names and folder paths) | The app's own storage | Remember your preferences and Spaces | When you remove a Space (its entry), or reset settings, or delete the app's data |
| Folder access | The app's data folder | Reopen your Spaces without asking again | When you remove the Space |
| Recovery copies of unsaved text | The app's data folder | Restore your work after a crash or a failed save | When the note is saved or you discard them |
| A cache of parsed notes (task text, headings, properties, links) | Your Mac's cache folder | Open large Spaces faster | Rebuilt as needed; removed when it hasn't been used for 90 days, or when you delete the app's data |
| Hidden temporary files (`.clutter-tmp.*`) | Inside the Space | Save a note safely (written first, then moved into place) | Removed after each save; one may be left behind if the app is interrupted mid-save, and may hold your most recent text |
| The last set of Unsplash photos shown in the picker | The app's storage | Show photos without asking again | When you shuffle for new ones, or delete the app's data |
| Archived notes | The Space's archive folder | Let you restore deleted notes | Until you delete them permanently (or the "auto-delete archived" setting does, if you turned it on) |

The app's data folder and cache are inside your Mac's `Library` folder, in a folder named for the app (`com.vigram.clutter`).

## Retention and deletion

Clutter keeps no information about you on any server of its own, so there is nothing for me to retain or delete. On your Mac:

- **Delete a note or attachment.** Archive and then delete it permanently in Clutter, or delete the file in Finder. A permanent delete does not go to the Trash and can't be undone.
- **Remove a Space.** Choose it in Settings and remove it. Clutter forgets the folder and its access to it. The folder and your notes stay where they are, and you can delete them in Finder.
- **Remove everything the app stored.** Quit Clutter, delete the app, and delete the app's folder named `com.vigram.clutter` in `~/Library/Containers` (and the cache folder of the same name in `~/Library/Caches`, if present). Your Spaces are separate folders, so delete them separately if you want them gone.
- **Data held by others.** Unsplash and Cloudflare keep whatever they keep under their own policies. To ask about it, contact them: [Unsplash privacy policy](https://unsplash.com/privacy) and [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/).

## Cloud-synced folders

Clutter does not sync your notes. If you put a Space inside a folder managed by another service (iCloud Drive, Dropbox, OneDrive and similar), that service copies and may upload your files, including Clutter's hidden `.clutter` folder and temporary files, under its own terms and privacy policy. Clutter does not control or see that. Clutter has not been tested with every provider, so for important notes, keep your own backup.

## Children

Clutter is not directed at children and collects no personal information from anyone.

## Changes to this policy

If Clutter's behavior changes, I'll update this page and the date at the top. Changes that affect what leaves your device will be made before the change ships.

## Contact

For privacy questions, write to: [privacy contact email, to be added before publishing]
