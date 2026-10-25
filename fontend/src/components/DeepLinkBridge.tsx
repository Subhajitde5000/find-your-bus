"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseQrValue } from "@/lib/qrLinks";
import { isNativeApp } from "@/lib/native";

/*
 * Deep links inside the app.
 *
 * A sticker is an https link. On a phone with the app installed, Android App Links
 * and iOS Universal Links hand that link to the app — but the app itself is a WebView
 * that always starts at "/". Nothing navigates the WebView to the path the sticker
 * asked for unless the app does it.
 *
 * `@capacitor/app` reports the launch URL (the app was cold-started by a scan) and
 * raises `appUrlOpen` (the app was already open). Both are turned into an in-app
 * navigation here, through the same strict parser the scanner uses, so a link from
 * another site can never steer the app.
 *
 * In a browser this component does nothing at all.
 */

interface AppPlugin {
  getLaunchUrl?: () => Promise<{ url?: string } | null | undefined>;
  addListener?: (
    event: "appUrlOpen",
    listener: (data: { url?: string }) => void,
  ) => Promise<{ remove: () => Promise<void> | void }> | { remove: () => Promise<void> | void };
}

interface CapacitorWindow {
  Capacitor?: {
    Plugins?: { App?: AppPlugin };
  };
}

export function DeepLinkBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    const plugin = (window as CapacitorWindow).Capacitor?.Plugins?.App;
    if (!plugin) return;

    let disposed = false;
    let handle: { remove: () => Promise<void> | void } | null = null;

    const open = (url?: string | null) => {
      if (disposed || !url) return;
      const parsed = parseQrValue(url);
      if (!parsed.ok) return;
      const here = `${window.location.pathname}${window.location.search}`;
      if (here === parsed.path) return;
      router.push(parsed.path);
    };

    plugin.getLaunchUrl?.().then((launch) => open(launch?.url)).catch(() => undefined);
    const subscribed = plugin.addListener?.("appUrlOpen", (data) => open(data?.url));
    if (subscribed && typeof (subscribed as Promise<unknown>).then === "function") {
      (subscribed as Promise<{ remove: () => Promise<void> | void }>)
        .then((listener) => {
          if (disposed) void listener.remove();
          else handle = listener;
        })
        .catch(() => undefined);
    } else {
      handle = subscribed as { remove: () => Promise<void> | void };
    }

    return () => {
      disposed = true;
      void handle?.remove();
    };
  }, [router]);

  return null;
}
