import type { CapacitorConfig } from "@capacitor/cli";

/*
 * The Android and iOS apps are the website, shipped inside the app.
 * `webDir` is the static export that `npm run build` writes, so there is no server and nothing
 * is fetched at run time: it works with no signal, exactly like the offline site.
 *
 * appId is the app's permanent identity in the Play Store and the App Store and CANNOT be
 * changed after the first release. Choose it before you publish (reverse of a domain you own).
 */
const config: CapacitorConfig = {
  appId: "in.cholo.kolkatabus",
  appName: "Cholo",
  webDir: "out",
  server: { androidScheme: "https" },
  backgroundColor: "#f8faf7",
};

export default config;
