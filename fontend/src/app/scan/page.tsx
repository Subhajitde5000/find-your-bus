import type { Metadata } from "next";
import ScanScreen from "./ScanScreen";

export const metadata: Metadata = {
  title: "Scan a QR code — Cholo",
  description:
    "Scan the QR code inside a Kolkata bus or at a bus stop to open its route, the next buses, and a countdown to your stop. Scanning works offline.",
};

export default function Page() {
  return <ScanScreen />;
}
