"use client";

import { isNativeApp } from "./native";

/*
 * Scanning a sticker.
 *
 * Two scanners, one answer:
 *
 * - Inside the Android/iOS app, the native ML Kit scanner (`@capacitor-mlkit/barcode-scanning`)
 *   reads the QR from the camera. It runs entirely on the phone, so it works with no signal.
 * - In a browser, the built-in `BarcodeDetector` does the same job where the browser has
 *   it, with `getUserMedia` for the camera.
 *
 * When neither is available (iOS Safari has no BarcodeDetector; a desktop without a
 * camera) the caller still has manual entry: every sticker prints a short code, and every
 * link can be pasted. Scanning is a shortcut, never the only way in.
 */

export type ScanOutcome =
  | { status: "ok"; value: string }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string }
  | { status: "denied"; message: string }
  | { status: "error"; message: string };

/** True when the browser can decode a QR from a camera frame itself. */
export function hasWebBarcodeDetector(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === "function";
}

/** True when the native scanner is worth trying. */
export function canScanNatively(): boolean {
  return isNativeApp();
}

/**
 * Opens the native scanner and resolves with the first code it reads.
 * Never throws: a refused permission or a missing module becomes a stated outcome.
 */
export async function scanWithNativeApp(): Promise<ScanOutcome> {
  try {
    const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
    const support = await BarcodeScanner.isSupported();
    if (!support.supported) {
      return { status: "unavailable", message: "This phone's camera cannot scan codes." };
    }
    let permission = await BarcodeScanner.checkPermissions();
    if (permission.camera !== "granted" && permission.camera !== "limited") {
      permission = await BarcodeScanner.requestPermissions();
    }
    if (permission.camera !== "granted" && permission.camera !== "limited") {
      return { status: "denied", message: "Camera permission is needed to scan a sticker." };
    }
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    const value = barcodes.find((barcode) => barcode.rawValue)?.rawValue;
    if (!value) return { status: "cancelled" };
    return { status: "ok", value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message)) return { status: "cancelled" };
    return { status: "error", message };
  }
}
