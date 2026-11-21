# DÙN RIGHT for iPhone (Capacitor wrapper)

This puts the existing DÙN RIGHT web app inside a real iOS app. The live app does not change.

## How it works (version 1)

- The iOS app opens the live site: `https://witty-plant-05789e010.7.azurestaticapps.net`.
- Same address as the web app, so Microsoft sign-in, OneDrive sync and the `/api` equipment service keep working with no code change.
- Every web update shows up in the iPhone app at once. No App Store review for web changes.
- Limit: the app needs signal on first open. After that the service worker caches pages, as it does in Safari.

## What you need (one time)

1. **Apple Developer Program account.** About 99 USD per year. Enrol as an organization (Dùn Construction Services or Keltic Geomatics Ltd.). You need a D-U-N-S number for an organization. Allow 1 to 2 weeks.
2. **A way to build.** Pick one:
   - A Mac with Xcode (free), or
   - The GitHub Actions macOS runner in this repo (`iOS build check` workflow). It proves the project builds. Signing for TestFlight needs a certificate and profile added as GitHub secrets (not set up yet).
3. **A 1024 x 1024 app icon** (PNG, no transparency). `resources/icon-1024-PLACEHOLDER.png` is only a placeholder. Replace it with the Dùn logo.
4. **Bundle ID.** Currently `ca.dunconstruction.dunright` in `capacitor.config.json`. You cannot change it after you register it in App Store Connect. Confirm it first.

## Steps on a Mac

```bash
git clone https://github.com/mrewenmacdonald/dun-right-app
cd dun-right-app
git checkout feature/ios-capacitor
npm install
npm run ios:add      # creates the ios/ folder and adds camera/location texts
npm run ios:open     # opens Xcode
```

In Xcode: pick the App target, Signing & Capabilities, choose your Team, then Run on your iPhone.
Put the 1024 icon in `ios/App/App/Assets.xcassets/AppIcon`.

## Share with the crew

- **TestFlight** (best for internal crews). Up to 100 internal testers by email. No public listing.
- **Unlisted app distribution** or **Apple Business Manager custom app** if you want it outside TestFlight.
- App Store review can reject apps that are only a website in a frame (guideline 4.2). TestFlight does not have this problem for internal testers. For a public listing, add native features first (for example native camera scan, push notifications).

## Things to test on a real iPhone

1. Microsoft sign-in works inside the app and returns to the app.
2. Camera opens for QR scan (needs PR #2, equipment tracking, merged).
3. Location button on the DWR form.
4. PDF export and share.
5. Open the app with no signal after one good open.

## Known risks

- The `manifest.json` points to `icons/icon-192.png` and `icons/icon-512.png`, but the `icons/` folder is not in the repo. Add these files.
- The web app login screen still shows Keltic branding, not Dùn purple and gold.
- Most app data still lives on each phone (IndexedDB). A new phone starts empty. Moving it to the cloud is a separate project.
- The GitHub Actions build check was written but not run yet. Run it from the Actions tab.
