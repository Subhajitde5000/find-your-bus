/*
 * Is this page running inside the Android or iOS app (Capacitor) rather than a browser?
 *
 * Two checks work together:
 * 1. Build-time (`NEXT_PUBLIC_MOBILE_APP=1`, set by `mobile/scripts/build-mobile-web.mjs`
 *    when building the Android and iOS bundle from `mobile/`): strips website-only
 *    marketing/editorial sections out of the static mobile export at compile time.
 * 2. Runtime (`window.Capacitor?.isNativePlatform()`): detects Capacitor's native shell
 *    even if a standard website build was synced into the native project.
 */
export const IS_MOBILE_APP_BUILD =
  process.env.NEXT_PUBLIC_MOBILE_APP === "1" || process.env.NEXT_PUBLIC_MOBILE_APP === "true";

export const NATIVE_BOOTSTRAP = `(function(){try{var c=window.Capacitor;var b=window.PathsathiNativeBars;if(${IS_MOBILE_APP_BUILD ? "true" : "false"}||b||(c&&typeof c.isNativePlatform==="function"&&c.isNativePlatform()===true)){document.documentElement.dataset.native="true";if(b&&typeof b.setDarkTheme==="function"){b.setDarkTheme(document.documentElement.getAttribute("data-theme")==="dark");}}}catch(e){}})();`;

export function isNativeApp(): boolean {
  if (IS_MOBILE_APP_BUILD) return true;
  if (typeof window === "undefined") return false;
  const win = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
    PathsathiNativeBars?: unknown;
  };
  if (win.PathsathiNativeBars) return true;
  return typeof win.Capacitor?.isNativePlatform === "function" && win.Capacitor.isNativePlatform() === true;
}

