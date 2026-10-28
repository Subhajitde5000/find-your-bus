"use client";

import { useState, useSyncExternalStore } from "react";
import { Smartphone, X } from "lucide-react";
import { isNativeApp } from "@/lib/native";

/*
 * "Open this in the app", for the gap between printing a sticker and App Links being
 * verified on every phone.
 *
 * App Links (Android) and Universal Links (iOS) open a sticker inside the app once the
 * domain serves the association files and the phone has fetched them. Until that has
 * happened — a freshly installed build, a new domain, a phone that has not refreshed —
 * scanning opens this website in the browser.
 *
 * On Android this can be bridged from the page itself with an intent:// URL: the
 * browser asks the app to open the same https link, and falls back to staying on this
 * page if the app is not installed. iOS has no equivalent that respects the user, so
 * nothing is shown there. Inside the app, and once the user dismisses it, it is hidden.
 */

const APP_PACKAGE = "in.cholo.kolkatabus";
const DISMISS_KEY = "cholo:open-in-app-dismissed";

/**
 * The intent URL, or null when the hint does not apply.
 *
 * Read through `useSyncExternalStore` rather than set from an effect: the browser is an
 * external system, the server has no snapshot of it, and this is the hook built for
 * that. It also keeps the pre-rendered HTML and the first client render identical.
 */
function intentHref(): string | null {
  if (isNativeApp()) return null;
  if (!/Android/i.test(navigator.userAgent)) return null;
  try {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return null;
  } catch {
    /* storage can be blocked; the hint is optional */
  }
  const path = `${window.location.pathname}${window.location.search}`;
  const https = `https://${window.location.host}${path}`;
  return `intent://${window.location.host}${path}#Intent;scheme=https;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(https)};end`;
}

const subscribeNothing = () => () => {};

export function OpenInApp() {
  const href = useSyncExternalStore(subscribeNothing, intentHref, () => null);
  const [dismissed, setDismissed] = useState(false);

  if (!href || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* nothing to do */
    }
  };

  return (
    <aside className="qr-open-in-app" aria-label="Open in the app">
      <Smartphone size={16} aria-hidden="true" />
      <span>Have the Cholo app? Open this page in it.</span>
      <a href={href}>Open in app</a>
      <button type="button" onClick={dismiss} aria-label="Dismiss">
        <X size={13} aria-hidden="true" />
      </button>
    </aside>
  );
}
