"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNativeApp } from "@/lib/native";

/*
 * Makes a scanned link open the right screen inside the installed app.
 *
 * The website is what sits inside the Android and iOS shells, so an App Link such as
 * https://<domain>/qr/bus?r=230 either starts the app (cold launch) or brings it forward
 * (warm launch) -- but the app itself still has to navigate to that screen. Capacitor
 * tells us the URL in both cases: `getLaunchUrl()` for the launch that started the app,
 * `appUrlOpen` for one that arrives while it is running.
 *
 * Only paths that belong to this site are followed. Anything else stays untouched, so a
 * link the operating system handed us by mistake cannot strand the user on a blank page.
 */

/** Pages inside the app that a scanned link is allowed to open. */
const ALLOWED_PREFIXES = ["/qr/", "/ride", "/scan", "/map"];

function internalHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || "/";
    if (path !== "/" && !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
    return `${path}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function DeepLinkBridge() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeApp()) return;
    let disposed = false;
    let remove: (() => void) | null = null;

    const go = (url: string | null | undefined) => {
      if (disposed || !url) return;
      const href = internalHref(url);
      if (!href) return;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (href === current) return;
      router.push(href);
    };

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const launch = await App.getLaunchUrl();
        go(launch?.url);
        const listener = await App.addListener("appUrlOpen", (event) => go(event.url));
        if (disposed) {
          await listener.remove();
          return;
        }
        remove = () => {
          void listener.remove();
        };
      } catch {
        // A browser build, or a native build without the plugin: nothing to bridge.
      }
    })();

    return () => {
      disposed = true;
      remove?.();
    };
  }, [router, pathname]);

  return null;
}
