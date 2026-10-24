import { isNativeApp } from "./native";

/*
 * Keeps the screen on while the ride screen follows the bus, so the phone does not lock and
 * stop the GPS. In the phone apps (the `mobile/` folder) this uses the app's native "KeepAwake"
 * plugin; in a browser it uses the Wake Lock API where there is one. Anywhere else it does
 * nothing. Returns the function that lets the screen sleep again.
 *
 * The native plugin is reached through the `Capacitor` object the app puts on `window`, so the
 * website bundle carries no app packages.
 */
interface NativeKeepAwake {
  keepAwake: () => Promise<void>;
  allowSleep: () => Promise<void>;
}

function nativeKeepAwake(): NativeKeepAwake | null {
  const capacitor = (window as unknown as { Capacitor?: { registerPlugin?: <T>(name: string) => T } }).Capacitor;
  return capacitor?.registerPlugin ? capacitor.registerPlugin<NativeKeepAwake>("KeepAwake") : null;
}

export function keepScreenAwake(): () => void {
  let released = false;

  if (isNativeApp()) {
    const plugin = nativeKeepAwake();
    void plugin?.keepAwake().catch(() => undefined);
    return () => {
      released = true;
      void plugin?.allowSleep().catch(() => undefined);
    };
  }

  type Sentinel = { release: () => Promise<void> };
  const wakeLock = typeof navigator !== "undefined" ? (navigator as unknown as { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } }).wakeLock : undefined;
  let sentinel: Sentinel | null = null;
  if (wakeLock) {
    wakeLock
      .request("screen")
      .then((lock) => {
        if (released) void lock.release().catch(() => undefined);
        else sentinel = lock;
      })
      .catch(() => undefined);
  }
  return () => {
    released = true;
    if (sentinel) void sentinel.release().catch(() => undefined);
  };
}
