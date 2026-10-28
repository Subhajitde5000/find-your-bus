"use client";

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  Camera,
  CameraOff,
  ClipboardPaste,
  Flashlight,
  FlashlightOff,
  Info,
  MapPin,
  QrCode,
  RefreshCw,
  ScanLine,
  TriangleAlert,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isNativeApp } from "@/lib/native";
import { parseQrValue, qrFailureMessage, type QrFailure } from "@/lib/qrLinks";

/*
 * /scan — the scanner, in the browser and in the app.
 *
 * Two paths, because the two runtimes are genuinely different:
 *
 *   - inside the Android or iOS app, the native ML Kit scanner is used through the
 *     Capacitor plugin. It is fast, focuses properly in a moving bus, and its barcode
 *     model can live on the phone, so it also works with no signal.
 *   - in a browser, the camera is read with `getUserMedia` and decoded on the device:
 *     the built-in `BarcodeDetector` where the browser has one, and the bundled jsQR
 *     decoder everywhere else (notably iOS Safari). No image ever leaves the phone and
 *     nothing is uploaded, so a scan works with no signal too.
 *
 * If the native scanner is unavailable — an older Android build without the ML Kit
 * module, a phone without Google Play services — the in-app WebView falls back to the
 * same camera decoder the browser uses, rather than leaving a dead button.
 *
 * A sticker inside a bus is often in its own shadow, so the preview offers the torch
 * wherever the camera exposes one. Everything is guarded: no torch support simply means
 * no torch button.
 *
 * What it will and will not open is decided in one place, `parseQrValue`: only this
 * site's bus and bus-stop links. A QR from anywhere else is refused with a plain
 * sentence, because a sticker on a bus is trusted input.
 */

type Status = "idle" | "starting" | "scanning" | "denied" | "unsupported" | "error";

interface CapacitorBarcodeScanner {
  isSupported?: () => Promise<{ supported: boolean }>;
  checkPermissions?: () => Promise<{ camera: string }>;
  requestPermissions?: () => Promise<{ camera: string }>;
  scan: (options?: { formats?: string[]; lensFacing?: string }) => Promise<{ barcodes?: { rawValue?: string }[] }>;
}

interface CapacitorWindow {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: { BarcodeScanner?: CapacitorBarcodeScanner };
  };
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

const SCAN_INTERVAL_MS = 180;

const subscribeNothing = () => () => {};

function nativeScannerAvailable(): boolean {
  return isNativeApp() && Boolean((window as CapacitorWindow).Capacitor?.Plugins?.BarcodeScanner);
}

function ScanScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ reason: QrFailure; raw: string } | null>(null);
  const [manual, setManual] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);
  // Whether the app's own scanner can be used. Read from the browser rather than set
  // from an effect, so the pre-rendered page and the first client render agree.
  const nativeAvailable = useSyncExternalStore(subscribeNothing, nativeScannerAvailable, () => false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const decoding = useRef(false);
  const redirected = useRef(false);

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

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) for (const track of stream.getTracks()) track.stop();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    setTorchOn(false);
    setCanTorch(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // A phone call or another app pauses the camera; put it away rather than leave a
  // dead preview running in the background and draining the battery.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        stopCamera();
        setStatus((current) => (current === "scanning" ? "idle" : current));
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stopCamera]);

  const accept = useCallback(
    (raw: string) => {
      const parsed = parseQrValue(raw);
      if (!parsed.ok) {
        setRefused({ reason: parsed.reason, raw });
        return;
      }
      if (redirected.current) return;
      redirected.current = true;
      stopCamera();
      setRefused(null);
      setMessage(null);
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(40);
      } catch {
        /* a small nicety, never an error */
      }
      router.push(parsed.path);
    },
    [router, stopCamera],
  );

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((current) => !current);
    } catch {
      setCanTorch(false);
      setTorchOn(false);
    }
  }, [torchOn]);

  const startWebCamera = useCallback(async () => {
    setRefused(null);
    setMessage(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setMessage(
        window.isSecureContext === false
          ? "The camera only works over https, or on localhost. Open this page over https and try again."
          : "This browser cannot open the camera.",
      );
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStatus("scanning");

      // Not every camera has a torch; the button only appears where `torch` is offered.
      const capabilities = stream.getVideoTracks()[0]?.getCapabilities?.() as TorchCapabilities | undefined;
      setCanTorch(Boolean(capabilities?.torch));

      if (typeof window.BarcodeDetector === "function") {
        try {
          detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        } catch {
          detectorRef.current = null;
        }
      }

      timerRef.current = window.setInterval(async () => {
        const element = videoRef.current;
        const canvas = canvasRef.current;
        if (!element || !canvas || decoding.current) return;
        if (!element.videoWidth || !element.videoHeight) return;
        decoding.current = true;
        try {
          const width = Math.min(640, element.videoWidth);
          const height = Math.round((element.videoHeight / element.videoWidth) * width);
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(element, 0, 0, width, height);
          let value: string | null = null;
          if (detectorRef.current) {
            const found = await detectorRef.current.detect(canvas);
            value = found[0]?.rawValue ?? null;
          }
          if (!value) {
            // jsQR is loaded on demand: the scanner is the only screen that needs it,
            // so the rest of the app stays small.
            const { default: jsQR } = await import("jsqr");
            const image = context.getImageData(0, 0, width, height);
            const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
            value = decoded?.data ?? null;
          }
          if (value) accept(value);
        } catch {
          /* a frame that cannot be read is not an error; the next one may work */
        } finally {
          decoding.current = false;
        }
      }, SCAN_INTERVAL_MS);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("denied");
        setMessage("The camera is blocked for this site. Allow it in the browser's site settings, then try again.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setStatus("error");
        setMessage("This device did not offer a camera.");
      } else {
        setStatus("error");
        setMessage("The camera could not be started. Another app may be using it.");
      }
    }
  }, [accept]);

  const startNativeScanner = useCallback(async () => {
    const plugin = (window as CapacitorWindow).Capacitor?.Plugins?.BarcodeScanner;
    if (!plugin) return false;
    setRefused(null);
    setMessage(null);
    setStatus("starting");
    try {
      // Ask for the camera before checking the module: if ML Kit turns out to be
      // unavailable, the WebView fallback then still has the permission it needs.
      if (plugin.checkPermissions) {
        const current = await plugin.checkPermissions();
        if (current.camera !== "granted" && plugin.requestPermissions) {
          const asked = await plugin.requestPermissions();
          if (asked.camera !== "granted") {
            setStatus("denied");
            setMessage("The camera is blocked for Cholo. Allow it in the phone's settings, then try again.");
            return true;
          }
        }
      }
      const support = plugin.isSupported ? await plugin.isSupported() : { supported: true };
      if (!support?.supported) {
        setStatus("idle");
        setMessage("The phone's barcode scanner is not available here, so the camera is being used instead.");
        return false;
      }
      const result = await plugin.scan({ formats: ["QR_CODE"] });
      const raw = result?.barcodes?.[0]?.rawValue ?? null;
      setStatus("idle");
      if (raw) accept(raw);
      return true;
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      if (/cancel/i.test(text)) {
        setStatus("idle");
        return true;
      }
      // The plugin is there but could not run (no ML Kit module, no Play Services).
      // Fall through to the camera decoder rather than failing the scan.
      setStatus("idle");
      return false;
    }
  }, [accept]);

  const start = useCallback(async () => {
    redirected.current = false;
    if (isNativeApp()) {
      const handled = await startNativeScanner();
      if (handled) return;
    }
    await startWebCamera();
  }, [startNativeScanner, startWebCamera]);

  const onManual = (event: React.FormEvent) => {
    event.preventDefault();
    if (!manual.trim()) return;
    redirected.current = false;
    accept(manual.trim());
  };

  const live = status === "scanning" || status === "starting";
  const trouble = status === "denied" || status === "error" || status === "unsupported";

  return (
    <div className="ride-page scan-page">
      <header className="ride-header">
        <Link className="ride-back" href="/" aria-label="Home">
          <ArrowLeft size={17} aria-hidden="true" />
          <span className="ride-back-text">Home</span>
        </Link>
        <span className="ride-header-title">Scan a code</span>
        <span className={`ride-online ${online ? "" : "off"}`} title={online ? "Online" : "Offline — scanning still works"}>
          {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
          <span className="ride-online-text">{online ? "Online" : "Offline"}</span>
        </span>
        <ThemeToggle />
      </header>

      <main className="ride-body">
        <section className="scan-stage">
          <div className="scan-view" data-state={live ? (status === "starting" ? "starting" : "live") : "idle"}>
            <video ref={videoRef} playsInline muted aria-label="Camera preview" />
            <canvas ref={canvasRef} aria-hidden="true" />

            {!live && (
              <div className="scan-placeholder">
                <span className="scan-placeholder-ring" aria-hidden="true">
                  <ScanLine size={30} />
                </span>
                <strong>{nativeAvailable ? "Use the phone's scanner" : "Point the camera at a code"}</strong>
                <span>
                  {nativeAvailable
                    ? "Cholo uses the phone's own barcode scanner first: quicker in a moving bus, and it works with no signal."
                    : "The code is read on this phone. Nothing is uploaded, and it works with no signal."}
                </span>
              </div>
            )}

            {live && (
              <>
                <div className="scan-frame" aria-hidden="true">
                  <i className="corner tl" />
                  <i className="corner tr" />
                  <i className="corner bl" />
                  <i className="corner br" />
                  {status === "scanning" && <span className="scan-line" />}
                </div>
                <span className="scan-hint" role="status">
                  {status === "starting" ? "Opening the camera…" : "Hold steady on the code"}
                </span>
                <div className="scan-view-actions">
                  {canTorch && (
                    <button
                      type="button"
                      className={`scan-torch ${torchOn ? "on" : ""}`}
                      aria-pressed={torchOn}
                      onClick={() => void toggleTorch()}
                    >
                      {torchOn ? <FlashlightOff size={15} aria-hidden="true" /> : <Flashlight size={15} aria-hidden="true" />}
                      {torchOn ? "Torch on" : "Torch"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="scan-torch"
                    onClick={() => {
                      stopCamera();
                      setStatus("idle");
                    }}
                  >
                    <X size={15} aria-hidden="true" /> Stop
                  </button>
                </div>
              </>
            )}
          </div>

          {!live && (
            <div className="scan-actions">
              <button type="button" className="scan-primary" onClick={() => void start()}>
                <Camera size={18} aria-hidden="true" />
                {nativeAvailable ? "Open the scanner" : trouble ? "Try the camera again" : "Turn on the camera"}
              </button>
              <Link className="scan-secondary" href="/map">
                <MapPin size={15} aria-hidden="true" /> Find a stop without scanning
              </Link>
            </div>
          )}

          {message && (
            <div className={`scan-message ${trouble ? "warn" : ""}`} role="status">
              {status === "denied" ? <CameraOff size={17} aria-hidden="true" /> : <TriangleAlert size={17} aria-hidden="true" />}
              <p>{message}</p>
              {trouble && (
                <button type="button" className="scan-retry" onClick={() => void start()}>
                  <RefreshCw size={13} aria-hidden="true" /> Retry
                </button>
              )}
            </div>
          )}

          {refused && (
            <div className="scan-message bad" role="alert">
              <TriangleAlert size={17} aria-hidden="true" />
              <div>
                <strong>{qrFailureMessage(refused.reason)}</strong>
                <span className="scan-raw">It said: {refused.raw.slice(0, 160)}</span>
                <button
                  type="button"
                  className="scan-retry"
                  onClick={() => {
                    setRefused(null);
                    void start();
                  }}
                >
                  <RefreshCw size={13} aria-hidden="true" /> Scan another code
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="scan-manual">
          <header>
            <h2><ClipboardPaste size={15} aria-hidden="true" /> Or paste a link</h2>
            <p>If the camera will not focus on a sticker, the code&apos;s link works just as well typed in.</p>
          </header>
          <form onSubmit={onManual}>
            <input
              type="url"
              inputMode="url"
              value={manual}
              placeholder="https://cholo.example/on-bus?route=1"
              aria-label="Paste a Cholo QR link"
              onChange={(event) => setManual(event.target.value)}
            />
            <button type="submit" disabled={!manual.trim()}>
              Open <ArrowRight size={15} aria-hidden="true" />
            </button>
          </form>
        </section>

        <section className="scan-kinds" aria-label="What the two stickers do">
          <article>
            <span className="scan-kind-icon"><BusFront size={17} aria-hidden="true" /></span>
            <div>
              <h2>On a bus</h2>
              <p>The bus you are most likely in, your stop, and a countdown to where you get off.</p>
            </div>
          </article>
          <article>
            <span className="scan-kind-icon"><MapPin size={17} aria-hidden="true" /></span>
            <div>
              <h2>At a bus stop</h2>
              <p>The next buses from that stop, and every bus of the day behind one tap.</p>
            </div>
          </article>
        </section>

        <details className="ob-footnote">
          <summary>
            <Info size={15} aria-hidden="true" /> Scanning without a signal
          </summary>
          <ul>
            <li>
              <strong>Read on the phone.</strong> The camera image is decoded on the device. No
              photo is uploaded, and no network is needed to read a code.
            </li>
            <li>
              <strong>In the app, the phone&apos;s own scanner comes first.</strong> Where that is
              not available (an old build, no Google Play services) the app uses the camera
              decoder instead, so the button always does something.
            </li>
            <li>
              <strong>Only Cholo codes open.</strong> A QR from another website is refused rather
              than followed, and the screen shows what it said.
            </li>
            <li>
              <strong>The phone&apos;s camera app works too.</strong> The stickers are ordinary
              https links: on a phone with the app they open the app, and without it they open
              the website.
            </li>
          </ul>
        </details>

        <section className="scan-also">
          <Link href="/"><QrCode size={15} aria-hidden="true" /> Search a journey instead</Link>
        </section>
      </main>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="ride-page"><div className="ride-loading">Opening the scanner…</div></div>}>
      <ScanScreen />
    </Suspense>
  );
}
