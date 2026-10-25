"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BusFront,
  Camera,
  CircleHelp,
  Info,
  MapPin,
  ScanLine,
  Ticket,
  TriangleAlert,
  X,
} from "lucide-react";
import { QrHeader } from "@/components/QrHeader";
import { QrScanner } from "@/components/QrScanner";
import { isNativeApp } from "@/lib/native";
import { canScanNatively, scanWithNativeApp } from "@/lib/scanner";
import { qrHref, resolveQrInput, shortCodeFor, type QrTarget } from "@/lib/qr";

/*
 * /scan — scan a sticker with this phone.
 *
 * Inside the app the camera is read by the native ML Kit scanner, which works with no
 * signal. In a browser the built-in BarcodeDetector is used where it exists. Either way
 * the code is resolved locally against the bundled directory, and manual entry is always
 * there: a scratched sticker, a cracked lens or an old browser must not be a dead end.
 */

const RECENT_KEY = "cholo.qr.recent";

interface RecentScan {
  href: string;
  label: string;
  code: string;
  at: number;
}

function readRecent(): RecentScan[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentScan[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.href === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function describe(target: QrTarget): string {
  return target.kind === "bus" ? `Bus ${target.route}` : target.stop;
}

export default function ScanPage() {
  const router = useRouter();
  const native = canScanNatively();
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Read after mount: the prerendered HTML has no storage, so filling the list during
    // the first render would be a hydration mismatch. A task is enough.
    const timer = window.setTimeout(() => setRecent(readRecent()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const open = useCallback(
    (raw: string) => {
      const target = resolveQrInput(raw);
      if (!target) {
        setScanning(false);
        setMessage(
          "That code is not a Cholo sticker. Stickers contain a cholo.in link, or the short code printed under the QR (for example “BUS 230” or “STOP Esplanade”).",
        );
        return;
      }
      const href = qrHref(target);
      const entry: RecentScan = { href, label: describe(target), code: shortCodeFor(target), at: Date.now() };
      const next = [entry, ...readRecent().filter((item) => item.href !== href)].slice(0, 5);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // private mode: the scan still works, it is just not remembered
      }
      setRecent(next);
      setMessage(null);
      setScanning(false);
      router.push(href);
    },
    [router],
  );

  const startNativeScan = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    const outcome = await scanWithNativeApp();
    setBusy(false);
    if (outcome.status === "ok") open(outcome.value);
    else if (outcome.status === "cancelled") return;
    else if (outcome.status === "unavailable" || outcome.status === "denied") {
      setMessage(`${outcome.message} You can type the code under the sticker instead.`);
    } else if (outcome.status === "error") {
      setMessage(`The scanner could not open (${outcome.message}). Type the code under the sticker instead.`);
    }
  }, [open]);

  const submitManual = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const value = manual.trim();
      if (!value) return;
      open(value);
    },
    [manual, open],
  );

  return (
    <div className="ride-page">
      <QrHeader title="Scan a sticker" scanLink={false} />

      <main className="ride-body qr-body">
        <section className="ride-status" data-state="waiting">
          <span className="ride-status-icon"><ScanLine size={22} /></span>
          <div className="ride-status-text">
            <h1>Scan the sticker on the bus or at the stop</h1>
            <p>
              A sticker inside the bus opens that route and works out which stop and bus you are on.
              A sticker at the stop opens the times for that stop. Both work with no signal.
            </p>
          </div>
          <div className="ride-status-actions">
            {native ? (
              <button type="button" className="ride-primary" onClick={startNativeScan} disabled={busy}>
                <Camera size={16} aria-hidden="true" /> {busy ? "Opening camera…" : "Open camera"}
              </button>
            ) : (
              <button type="button" className="ride-primary" onClick={() => { setScanning((value) => !value); setMessage(null); }}>
                {scanning ? <X size={16} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
                {scanning ? "Close camera" : "Open camera"}
              </button>
            )}
          </div>
        </section>

        {message && (
          <div className="qr-hint" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{message}</span>
            <button type="button" className="qr-hint-dismiss" onClick={() => setMessage(null)} aria-label="Dismiss">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {!native && scanning && <QrScanner active={scanning} onResult={open} />}

        <section className="qr-panel">
          <h2><Ticket size={16} aria-hidden="true" /> No camera? Type the code</h2>
          <p className="qr-panel-note">
            Every sticker prints a short code under the QR. A route code also opens from the web
            address bar, and a stop code is just <em>stop</em> and the stop name.
          </p>
          <form className="qr-manual" onSubmit={submitManual}>
            <label className="qr-field">
              <ScanLine size={15} aria-hidden="true" />
              <input
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                placeholder="BUS 230  ·  STOP Esplanade  ·  or paste a link"
                aria-label="Sticker code or link"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button type="submit" className="ride-primary">
              Open <ArrowRight size={15} aria-hidden="true" />
            </button>
          </form>
        </section>

        {recent.length > 0 && (
          <section className="qr-panel">
            <h2>Recently scanned</h2>
            <ul className="qr-recent">
              {recent.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>
                    <span className="qr-recent-icon">
                      {item.href.startsWith("/qr/stop") ? <MapPin size={15} aria-hidden="true" /> : <BusFront size={15} aria-hidden="true" />}
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <em>{item.code}</em>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="ride-footnote">
          <h2><CircleHelp size={15} aria-hidden="true" /> Where the stickers are</h2>
          <ul>
            <li><strong>On bus:</strong> one per route, inside the bus. It opens that route and identifies your stop from the phone&apos;s own position.</li>
            <li><strong>At bus stop:</strong> one per stop, on the shelter. It opens today&apos;s passes from that stop, next two hours first and the whole day a tap away.</li>
            <li><strong>Installed app:</strong> scanning with any camera app opens the same screen inside the app. Without the app, the same link opens this website.</li>
            <li><strong>Offline:</strong> decoding happens on the phone and the timetable is already downloaded, so both work with no signal.</li>
          </ul>
          <p className="ride-footnote-sign">
            <Info size={12} aria-hidden="true" /> Scanning reads the code only. Nothing is uploaded, and no
            location is taken until a screen needs it.
          </p>
        </section>

        {isNativeApp() && (
          <p className="qr-panel-note">
            This is the installed app, so the camera reader is the phone&apos;s own offline scanner.
          </p>
        )}
      </main>
    </div>
  );
}
