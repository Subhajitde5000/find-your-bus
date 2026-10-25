"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BusFront, ScanLine, Wifi, WifiOff } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

/*
 * The compact header shared by the QR screens and the scanner, so a scanned link lands
 * on a page that looks like the rest of the site rather than a bare utility screen.
 * Same shape as the ride screen and the stop map: back link, title, connection chip,
 * theme.
 */

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

interface Props {
  title: string;
  backHref?: string;
  backLabel?: string;
  /** Show the "Scan" shortcut in the header. Off on the scanner itself. */
  scanLink?: boolean;
  /** A right-side action, before the theme switch. */
  action?: ReactNode;
}

export function QrHeader({ title, backHref = "/", backLabel = "Home", scanLink = true, action }: Props) {
  const online = useOnline();
  return (
    <header className="ride-header">
      <Link className="ride-back" href={backHref}>
        <ArrowLeft size={17} aria-hidden="true" /> {backLabel}
      </Link>
      <span className="ride-header-title">{title}</span>
      {action}
      {scanLink && (
        <Link className="qr-scan-link" href="/scan" aria-label="Scan a Cholo QR code" title="Scan a QR code">
          <ScanLine size={16} aria-hidden="true" />
          <span>Scan</span>
        </Link>
      )}
      <span
        className={`ride-online ${online ? "" : "off"}`}
        title={online ? "You are online, but these screens do not need it" : "Offline — these screens still work"}
      >
        {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
        {online ? "Online" : "Offline"}
      </span>
      <ThemeToggle />
    </header>
  );
}

/** The brand line the printed stickers and the admin preview use, reused on screen. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size / 3.4 }} aria-hidden="true">
      <BusFront size={size * 0.55} strokeWidth={2.1} />
    </span>
  );
}
