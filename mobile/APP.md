# Phone apps (Android and iOS)

The apps are the website shipped inside a native shell ([Capacitor](https://capacitorjs.com)).
Same code, same screens, no server: everything is inside the app, so it works with no signal.

| | |
|---|---|
| `capacitor.config.ts` | App name, app id, `webDir: ../fontend/out`, transparent WebView background, and `SystemBars.insetsHandling: "disable"` for edge-to-edge system bars |
| `scripts/build-mobile-web.mjs` | Builds the lightweight mobile bundle (`NEXT_PUBLIC_MOBILE_APP=1`), omitting website-only hero, tips, heads-up, and promo sections |
| `android/`, `ios/` | The native projects (`MainActivity.java`, `styles.xml`, `SceneDelegate.swift`) configured with transparent status and navigation bars and safe-area CSS insets |
| `resources/` | The 1024 px icon and the splash source. `npm run icons` makes every size from them |
| `../fontend/src/lib/native.ts` | `isNativeApp()` / `IS_MOBILE_APP_BUILD`: true inside the mobile app; hides website-only sections and skips the service worker |
| `../fontend/src/lib/keepAwake.ts` | Keeps the screen on while Set on bus follows the bus |
| `../fontend/src/components/DeepLinkBridge.tsx` | Turns a scanned sticker link into an in-app navigation (`@capacitor/app`) |
| `../fontend/src/app/scan/ScanScreen.tsx` | The scanner: ML Kit through `@capacitor-mlkit/barcode-scanning` first, the camera decoder as a fallback |
| `../fontend/public/.well-known/` | `assetlinks.json` and `apple-app-site-association`, so a sticker opens the app instead of a browser tab |

## Build and run

The website lives in `fontend/` and is not changed by the apps. This folder (`mobile/`) holds only the
app side, and reads the finished website from `../fontend/out`.

```bash
cd fontend && npm install && cd ..     # once: the website's packages
cd mobile && npm install               # once: the app's packages
npm run sync        # builds the website, copies it into android/ and ios/
npm run android     # opens Android Studio  -> Run
npm run ios         # opens Xcode (Mac only) -> Run
```

Run `npm run sync` again after every change to the site or its data.
Run `npm run icons` after changing `resources/icon.png`.

No Android Studio? The **Build Android test app** workflow in GitHub Actions builds a test APK for you.

## Before you publish

1. **Change the app id** in `capacitor.config.ts` (`in.cholo.kolkatabus` is a placeholder; use a domain you own,
   reversed). It cannot be changed after the first release. Then run `npx cap sync`, and change the
   `namespace` and `applicationId` in `android/app/build.gradle` and the bundle id in Xcode to match.
2. **Version**: `versionCode` / `versionName` in `android/app/build.gradle`; Version and Build in Xcode.
3. **Privacy policy page** (a public URL). Both stores need one because the app asks for location.
   It can say: location is used only on the phone, nothing is sent or stored.
4. **Store listing**: screenshots, short and long description, category (Maps and Navigation / Travel).

## Publish

- **Google Play**: a Google Play Developer account (one-time fee, about USD 25). In Android Studio:
  Build > Generate Signed App Bundle (`.aab`), keep the signing key safe, upload in Play Console.
  New personal accounts must run a closed test with testers for a period before production.
- **Apple App Store**: an Apple Developer account (USD 99 a year) and a **Mac with Xcode** (or a cloud Mac build
  service). In Xcode: Product > Archive > Distribute App > App Store Connect, then submit for review in
  App Store Connect.

## QR codes, deep links and the camera

The QR stickers printed for buses and bus stops are ordinary `https` links (see the main
README). For a scan to open **the app** rather than a browser tab, three things have to
line up, and all three are wired here:

1. **The native app claims the links.**
   - Android: the `autoVerify` intent filter in
     `android/app/src/main/AndroidManifest.xml` for `/on-bus`, `/stop` and `/scan`.
   - iOS: `com.apple.developer.associated-domains` (`applinks:…`) in
     `ios/App/App/App.entitlements`, already referenced by `CODE_SIGN_ENTITLEMENTS` in the
     Xcode project.
2. **The domain proves it owns the app.** `../fontend/public/.well-known/assetlinks.json`
   needs the **signing certificate's SHA-256** and
   `apple-app-site-association` needs the **Apple Team ID**. Both are placeholders until
   filled in.
3. **The app navigates to the path.** The app is a WebView that always starts at `/`, so
   `DeepLinkBridge` reads `App.getLaunchUrl()` on a cold start and listens for
   `appUrlOpen` afterwards, then routes inside the bundled site. A link from another
   website is ignored.

Set the domain, the fingerprint and the Team ID in one go, from the repository root:

```bash
node scripts/set_qr_domain.mjs https://your-domain --sha256 "AA:BB:…" --team-id ABCDE12345
cd mobile && npm run sync        # then rebuild the app
```

Until the association files are live and verified, an Android browser shows a dismissible
"Open in app" hint on the QR screens (an `intent://` link); iOS has no equivalent, so
nothing is shown there and the website is used instead.

### Scanning

`npm run sync` installs `@capacitor-mlkit/barcode-scanning` into the native projects.
The manifest declares `CAMERA` and pre-downloads the barcode model
(`com.google.mlkit.vision.DEPENDENCIES=barcode`), so scanning works with no signal. iOS
needs the `NSCameraUsageDescription` string that is already in `Info.plist`.

If the ML Kit module cannot run (no Google Play services, an old build), the app falls
back to the WebView's own camera decoder, so the scan button always responds. That
fallback needs the WebView camera permission as well; Capacitor prompts for it the first
time the page asks for the camera.

## Known limits

- Set on bus uses the phone's GPS **while the app is open**. The screen is kept on so the phone does not lock.
  It does not keep tracking if the app is closed or the phone is locked. That needs a background-location plugin
  and extra store review (not added).
- Not yet tested on a real phone or on a bus.
- Scanning needs a camera and a bright sticker. A scuffed or sun-faded code will not read;
  the scanner screen offers pasting the link by hand as the fallback.
- The App Link / Universal Link proof depends on the site being served over https at the
  permanent domain with `/.well-known/` reachable, and on the association files carrying
  the real certificate fingerprint and Team ID.
