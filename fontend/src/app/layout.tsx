import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaBridge } from "@/components/PwaBridge";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cholo — Kolkata Bus Timetables",
  description:
    "Find scheduled Kolkata buses between your stops. Explore today's departures, routes, and journey stops with Cholo.",
  applicationName: "Cholo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Cholo",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Cholo — Kolkata Bus Timetables",
    description: "Find buses between any two Kolkata stops, with one-change journeys and full stop lists.",
    type: "website",
    locale: "en_IN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8faf7" },
    { media: "(prefers-color-scheme: dark)", color: "#101c18" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set by the bootstrap script below, before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router root layout applies to every page, so this warning does not apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap"
        />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      {/* Browser extensions (for example Grammarly) can add data attributes before hydration. */}
      <body suppressHydrationWarning>
        {children}
        <ThemeSync />
        <PwaBridge />
      </body>
    </html>
  );
}
