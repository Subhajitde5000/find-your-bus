import { isNativeApp } from "./native";

/*
 * Keeps the screen on while the ride screen follows the bus, so the phone does not lock and
 * stop the GPS. In the phone apps this uses the native plugin; in a browser it uses the Wake
 * Lock API where there is one. Anywhere else it does nothing. Returns the function that lets
 * the screen sleep again.
 */
export function keepScreenAwake(): () => void {
  let released = false;

  if (isNativeApp()) {
    const ready = import("@capacitor-community/keep-awake")
      .then(({ KeepAwake }) => KeepAwake.keepAwake())
      .catch(() => undefined);
    return () => {
      released = true;
      void ready.then(() => import("@capacitor-community/keep-awake")).then(({ KeepAwake }) => KeepAwake.allowSleep()).catch(() => undefined);
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
