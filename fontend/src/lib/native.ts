/*
 * Is this page running inside the Android or iOS app (Capacitor) rather than a browser?
 * Capacitor puts a `Capacitor` object on `window`; a browser never has one. No import is
 * needed, so the website bundle does not carry any app code.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof capacitor?.isNativePlatform === "function" && capacitor.isNativePlatform() === true;
}
