import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cholo Community Desk — Help improve Kolkata bus information",
  description: "Share a feature idea, report a missing route or stop, or help correct bus information for Kolkata.",
  applicationName: "Cholo Community Desk",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f7f3",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
