# Phone apps (Android and iOS)

The apps are the website shipped inside a native shell ([Capacitor](https://capacitorjs.com)).
Same code, same screens, no server: everything is inside the app, so it works with no signal.

| | |
|---|---|
| `capacitor.config.ts` | App name, app id, and `webDir: ../fontend/out` (the website's static export) |
| `scripts/build-mobile-web.mjs` | Builds the lightweight mobile bundle (`NEXT_PUBLIC_MOBILE_APP=1`), omitting website-only hero, tips, heads-up, and promo sections |
| `android/`, `ios/` | The native projects Capacitor generated. Open them in Android Studio / Xcode |
| `resources/` | The 1024 px icon and the splash source. `npm run icons` makes every size from them |
| `../fontend/src/lib/native.ts` | `isNativeApp()` / `IS_MOBILE_APP_BUILD`: true inside the mobile app; hides website-only sections and skips the service worker |
| `../fontend/src/lib/keepAwake.ts` | Keeps the screen on while Set on bus follows the bus |

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

## Known limits

- Set on bus uses the phone's GPS **while the app is open**. The screen is kept on so the phone does not lock.
  It does not keep tracking if the app is closed or the phone is locked. That needs a background-location plugin
  and extra store review (not added).
- Not yet tested on a real phone or on a bus.
