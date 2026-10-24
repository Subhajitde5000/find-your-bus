# Phone apps (Android and iOS)

The apps are the website shipped inside a native shell ([Capacitor](https://capacitorjs.com)).
Same code, same screens, no server: everything is inside the app, so it works with no signal.

| | |
|---|---|
| `capacitor.config.ts` | App name, app id, and `webDir: out` (the static export) |
| `android/`, `ios/` | The native projects Capacitor generated. Open them in Android Studio / Xcode |
| `resources/` | The 1024 px icon and the splash source. `npm run app:icons` makes every size from them |
| `src/lib/native.ts` | `isNativeApp()`: true only inside the app. The service worker is skipped there |
| `src/lib/keepAwake.ts` | Keeps the screen on while Set on bus follows the bus |

## Build and run

```bash
cd fontend
npm install
npm run app:sync        # builds the site, copies it into android/ and ios/
npm run app:android     # opens Android Studio  -> Run
npm run app:ios         # opens Xcode (Mac only) -> Run
```

Run `npm run app:sync` again after every change to the site or its data.
Run `npm run app:icons` after changing `resources/icon.png`.

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
