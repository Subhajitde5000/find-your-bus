"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, ScanLine } from "lucide-react";
import { hasWebBarcodeDetector } from "@/lib/scanner";

/*
 * The browser camera reader.
 *
 * `BarcodeDetector` is the only decoder that can be used without shipping a whole QR
 * library to the page, and it is not in every browser (Safari on iOS has none). So this
 * component either works properly or says plainly that it cannot, and the page always
 * offers the short code printed under the sticker and manual link entry beside it.
 *
 * The camera is stopped the moment a code is read and whenever the component leaves the
 * screen: nobody wants a camera light on while reading a timetable.
 */

interface Props {
  /** Called once with the first code read. */
  onResult: (value: string) => void;
  active: boolean;
}

interface DetectedBarcode {
  rawValue?: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}

export function QrScanner({ onResult, active }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "unsupported" | "error">("starting");
  const [detail, setDetail] = useState<string | null>(null);
  const found = useRef(false);

  useEffect(() => {
    if (!active) return;
    found.current = false;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | null = null;

    const stopCamera = () => {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      if (!hasWebBarcodeDetector()) {
        setStatus("unsupported");
        setDetail("This browser has no built-in QR reader. Type the code under the sticker instead.");
        return;
      }
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        setDetail("No camera is available to this page. Type the code under the sticker instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stopCamera();
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setStatus("scanning");

        const Detector = (window as unknown as { BarcodeDetector: new (options?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        let detector: BarcodeDetectorLike;
        try {
          detector = new Detector({ formats: ["qr_code"] });
        } catch {
          detector = new Detector();
        }

        const tick = async () => {
          if (cancelled || found.current) return;
          const element = videoRef.current;
          if (element && element.readyState >= 2) {
            try {
              const codes = await detector.detect(element);
              const value = codes.find((code) => typeof code.rawValue === "string" && code.rawValue.trim())?.rawValue;
              if (value) {
                found.current = true;
                stopCamera();
                onResult(value);
                return;
              }
            } catch {
              // A frame that cannot be read is not an error worth showing.
            }
          }
          timer = window.setTimeout(tick, 350);
        };
        void tick();
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("denied");
          setDetail("Camera access is blocked. Allow it in your browser settings, or type the code under the sticker.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setStatus("error");
          setDetail("No camera was found on this device. Type the code under the sticker instead.");
        } else {
          setStatus("error");
          setDetail("The camera could not start. Type the code under the sticker instead.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      stopCamera();
    };
  }, [active, onResult]);

  return (
    <div className="qr-camera" data-state={status}>
      <video ref={videoRef} muted playsInline aria-label="Camera view for scanning a sticker" />
      <div className="qr-camera-frame" aria-hidden="true" />
      <div className="qr-camera-status" role="status">
        {status === "scanning" ? (
          <>
            <ScanLine size={16} aria-hidden="true" /> Point the camera at the QR code
          </>
        ) : status === "starting" ? (
          <>
            <Loader2 size={16} className="qr-spin" aria-hidden="true" /> Starting the camera…
          </>
        ) : (
          <>
            <CameraOff size={16} aria-hidden="true" /> {detail ?? "The camera is not available."}
          </>
        )}
      </div>
    </div>
  );
}
